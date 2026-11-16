import type { EntityManager } from 'typeorm';
import { REPLENISHMENT_PATTERNS } from '@app/contracts/replenishments';
import { TerminalStock } from '@app/orders-db';
import { StockService } from './stock.service.js';
import type { OutboxService } from '@app/outbox';

// capacity 50 → reorder threshold 15
const OK = { quantity: 45, capacity: 50, wasInsufficient: false };
const LOW = { quantity: 14, capacity: 50, wasInsufficient: false };
const ORDER_ID = '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d';

function setup({
  query = vi.fn().mockResolvedValue([OK]),
  update = vi.fn().mockResolvedValue({ affected: 1 }),
  enqueue = vi.fn().mockResolvedValue('message-id'),
} = {}) {
  const manager = { query, update };
  const outbox = { enqueue };
  const service = new StockService(outbox as unknown as OutboxService);
  const reserve = (items: { name: string; quantity: number }[]) =>
    service.reserve(
      manager as unknown as EntityManager,
      ORDER_ID,
      'terminal-a',
      items,
    );
  return { reserve, manager, outbox };
}

describe('StockService.reserve()', () => {
  describe('decrementing', () => {
    it('decrements through the given transaction manager', async () => {
      const { reserve, manager } = setup();

      const result = await reserve([{ name: 'Hot Dog', quantity: 5 }]);

      expect(result).toEqual({
        kind: 'reserved',
        inventoryIssue: false,
        restockRequests: [],
      });
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

      expect(result).toMatchObject({ kind: 'reserved', inventoryIssue: true });
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
        {
          triggeredByOrderId: ORDER_ID,
          terminalId: 'terminal-a',
          itemName: 'Hot Dog',
          upToCapacity: 50,
        },
      );
    });

    it('returns each enqueued request so the caller can log it after commit', async () => {
      const { reserve } = setup({
        query: vi.fn().mockResolvedValue([LOW]),
      });

      const result = await reserve([{ name: 'Hot Dog', quantity: 1 }]);

      expect(result).toEqual({
        kind: 'reserved',
        inventoryIssue: false,
        restockRequests: [
          { restockRequestId: 'message-id', itemName: 'Hot Dog' },
        ],
      });
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

      const result = await reserve([{ name: 'Hot Dog', quantity: 1 }]);

      expect(outbox.enqueue).not.toHaveBeenCalled();
      expect(result).toMatchObject({ restockRequests: [] });
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
          triggeredByOrderId: ORDER_ID,
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

describe('StockService.restock()', () => {
  function setupRestock(query = vi.fn().mockResolvedValue([{ quantity: 50 }])) {
    const manager = { query } as unknown as EntityManager;
    const service = new StockService({} as unknown as OutboxService);
    return { service, manager, query };
  }

  it('adds the delivered quantity capped at capacity and clears restockPending, in the given manager', async () => {
    const { service, manager, query } = setupRestock();

    const result = await service.restock(manager, 'terminal-a', 'Hot Dog', 50);

    expect(result).toEqual({ kind: 'restocked', quantity: 50 });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('LEAST(quantity + $3, capacity)');
    expect(sql).toContain('"restockPending" = false');
    expect(params).toEqual(['terminal-a', 'Hot Dog', 50]);
  });

  it('returns missing-stock when the terminal has no stock row for the item', async () => {
    const { service, manager } = setupRestock(vi.fn().mockResolvedValue([]));

    await expect(
      service.restock(manager, 'terminal-a', 'Hot Dog', 50),
    ).resolves.toEqual({ kind: 'missing-stock' });
  });
});
