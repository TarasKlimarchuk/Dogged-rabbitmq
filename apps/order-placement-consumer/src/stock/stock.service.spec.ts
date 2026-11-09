import type { EntityManager } from 'typeorm';
import { REPLENISHMENT_PATTERNS } from '@app/contracts/replenishments';
import { TerminalStock } from '@app/orders-db';
import { StockService } from './stock.service.js';
import type { OutboxService } from '../outbox/outbox.service.js';

// capacity 50 → reorder threshold 15
const OK = { quantity: 45, capacity: 50, wasInsufficient: false };
const LOW = { quantity: 14, capacity: 50, wasInsufficient: false };

function setup({
  query = vi.fn().mockResolvedValue([OK]),
  update = vi.fn().mockResolvedValue({ affected: 1 }),
  enqueue = vi.fn().mockResolvedValue('message-id'),
} = {}) {
  const manager = { query, update };
  const outbox = { enqueue };
  const service = new StockService(outbox as unknown as OutboxService);
  const reserve = (items: { name: string; quantity: number }[]) =>
    service.reserve(manager as unknown as EntityManager, 'terminal-a', items);
  return { reserve, manager, outbox };
}

describe('StockService.reserve()', () => {
  describe('decrementing', () => {
    it('decrements through the given transaction manager', async () => {
      const { reserve, manager } = setup();

      const result = await reserve([{ name: 'Hot Dog', quantity: 5 }]);

      expect(result).toEqual({ kind: 'reserved', inventoryIssue: false });
      expect(manager.query).toHaveBeenCalledWith(expect.any(String), [
        'terminal-a',
        'Hot Dog',
        5,
      ]);
    });

    it('flags inventoryIssue when the database reports the request as insufficient', async () => {
      const { reserve } = setup({
        query: vi
          .fn()
          .mockResolvedValue([
            { quantity: 0, capacity: 50, wasInsufficient: true },
          ]),
      });

      const result = await reserve([{ name: 'Hot Dog', quantity: 5 }]);

      expect(result).toEqual({ kind: 'reserved', inventoryIssue: true });
    });

    it('returns missing-stock when the terminal has no stock row for an item', async () => {
      const { reserve } = setup({
        query: vi.fn().mockResolvedValueOnce([OK]).mockResolvedValueOnce([]),
      });

      const result = await reserve([
        { name: 'Hot Dog', quantity: 1 },
        { name: 'Soda', quantity: 1 },
      ]);

      expect(result).toEqual({ kind: 'missing-stock', itemName: 'Soda' });
    });

    it('stops at the first missing item without decrementing the rest', async () => {
      const { reserve, manager } = setup({
        query: vi.fn().mockResolvedValue([]),
      });

      await reserve([
        { name: 'Hot Dog', quantity: 1 },
        { name: 'Soda', quantity: 1 },
      ]);

      expect(manager.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('scheduling restocks', () => {
    it('claims restockPending and enqueues a request through the same manager when stock drops below the threshold', async () => {
      const { reserve, manager, outbox } = setup({
        query: vi.fn().mockResolvedValue([LOW]),
      });

      await reserve([{ name: 'Hot Dog', quantity: 1 }]);

      expect(manager.update).toHaveBeenCalledWith(
        TerminalStock,
        {
          terminalId: 'terminal-a',
          itemName: 'Hot Dog',
          restockPending: false,
        },
        { restockPending: true },
      );
      // the same manager → the outbox row commits (or rolls back) with the order
      expect(outbox.enqueue).toHaveBeenCalledWith(
        manager,
        REPLENISHMENT_PATTERNS.RESTOCK_REQUESTED,
        { terminalId: 'terminal-a', itemName: 'Hot Dog', upToCapacity: 50 },
      );
    });

    it('does nothing when stock stays at or above the threshold', async () => {
      const { reserve, manager, outbox } = setup({
        query: vi
          .fn()
          .mockResolvedValue([
            { quantity: 15, capacity: 50, wasInsufficient: false },
          ]),
      });

      await reserve([{ name: 'Hot Dog', quantity: 1 }]);

      expect(manager.update).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('does not enqueue when a restock is already pending (claim affects no rows)', async () => {
      const { reserve, outbox } = setup({
        query: vi.fn().mockResolvedValue([LOW]),
        update: vi.fn().mockResolvedValue({ affected: 0 }),
      });

      await reserve([{ name: 'Hot Dog', quantity: 1 }]);

      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('enqueues only for the items that were claimed', async () => {
      const { reserve, outbox } = setup({
        query: vi.fn().mockResolvedValue([LOW]),
        update: vi
          .fn()
          .mockResolvedValueOnce({ affected: 0 }) // Hot Dog already pending
          .mockResolvedValueOnce({ affected: 1 }), // Soda claimed
      });

      await reserve([
        { name: 'Hot Dog', quantity: 1 },
        { name: 'Soda', quantity: 1 },
      ]);

      expect(outbox.enqueue).toHaveBeenCalledTimes(1);
      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        {
          terminalId: 'terminal-a',
          itemName: 'Soda',
          upToCapacity: 50,
        },
      );
    });

    it('lets an outbox failure propagate so the whole order transaction rolls back', async () => {
      const { reserve } = setup({
        query: vi.fn().mockResolvedValue([LOW]),
        enqueue: vi.fn().mockRejectedValue(new Error('db down')),
      });

      await expect(reserve([{ name: 'Hot Dog', quantity: 1 }])).rejects.toThrow(
        'db down',
      );
    });
  });
});
