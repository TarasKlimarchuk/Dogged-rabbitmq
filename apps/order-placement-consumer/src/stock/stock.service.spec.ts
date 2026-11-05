import { Registry } from '@prometheus-io/client';
import { ResilienceMetrics } from '@app/metrics';
import type { EntityManager, Repository } from 'typeorm';
import type { HttpService } from '@nestjs/axios';
import type { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { StockService } from './stock.service.js';
import type { TerminalStock } from '@app/orders-db';

const metrics = new ResilienceMetrics(new Registry());

function createStockRepo(
  overrides: Partial<Repository<TerminalStock>> = {},
): Repository<TerminalStock> {
  return {
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  } as unknown as Repository<TerminalStock>;
}

function createManager(query: ReturnType<typeof vi.fn>): EntityManager {
  return { query } as unknown as EntityManager;
}

function createHttp(post: ReturnType<typeof vi.fn>): HttpService {
  return { post } as unknown as HttpService;
}

function createConfig(): ConfigService {
  return { get: () => 'http://warehouse:3002' } as unknown as ConfigService;
}

function createService(
  stockRepo = createStockRepo(),
  post = vi.fn().mockReturnValue(of({})),
): StockService {
  return new StockService(stockRepo, createHttp(post), createConfig(), metrics);
}

describe('StockService', () => {
  describe('reserve()', () => {
    it('decrements through the given transaction manager', async () => {
      const query = vi
        .fn()
        .mockResolvedValue([{ quantity: 45, capacity: 50, wasInsufficient: false }]);
      const stockRepo = createStockRepo();
      const service = createService(stockRepo);

      const result = await service.reserve(createManager(query), 'terminal-a', [
        { name: 'Hot Dog', quantity: 5 },
      ]);

      expect(result).toEqual({ kind: 'reserved', inventoryIssue: false });
      expect(query).toHaveBeenCalledWith(expect.any(String), ['terminal-a', 'Hot Dog', 5]);
      // the injected repository runs outside the transaction, so it must not be used
      expect(stockRepo.update).not.toHaveBeenCalled();
    });

    it('flags inventoryIssue when the database reports the request as insufficient', async () => {
      const query = vi
        .fn()
        .mockResolvedValue([{ quantity: 0, capacity: 50, wasInsufficient: true }]);
      const service = createService();

      const result = await service.reserve(createManager(query), 'terminal-a', [
        { name: 'Hot Dog', quantity: 5 },
      ]);

      expect(result).toEqual({ kind: 'reserved', inventoryIssue: true });
    });

    it('returns missing-stock when the terminal has no stock row for an item', async () => {
      const query = vi
        .fn()
        .mockResolvedValueOnce([{ quantity: 10, capacity: 50, wasInsufficient: false }])
        .mockResolvedValueOnce([]);
      const service = createService();

      const result = await service.reserve(createManager(query), 'terminal-a', [
        { name: 'Hot Dog', quantity: 1 },
        { name: 'Soda', quantity: 1 },
      ]);

      expect(result).toEqual({ kind: 'missing-stock', itemName: 'Soda' });
    });

    it('stops at the first missing item without decrementing the rest', async () => {
      const query = vi.fn().mockResolvedValue([]);
      const service = createService();

      await service.reserve(createManager(query), 'terminal-a', [
        { name: 'Hot Dog', quantity: 1 },
        { name: 'Soda', quantity: 1 },
      ]);

      expect(query).toHaveBeenCalledTimes(1);
    });
  });

  describe('requestRestockIfNeeded()', () => {
    it('claims restockPending atomically before sending a restock request', async () => {
      const update = vi.fn().mockResolvedValue({ affected: 1 });
      const post = vi.fn().mockReturnValue(of({}));
      const service = createService(createStockRepo({ update }), post);

      await service.requestRestockIfNeeded('terminal-a', 'Hot Dog');

      expect(update).toHaveBeenCalledWith(
        { terminalId: 'terminal-a', itemName: 'Hot Dog', restockPending: false },
        { restockPending: true },
      );
      await vi.waitFor(() => {
        expect(post).toHaveBeenCalledWith(
          'http://warehouse:3002/restock',
          expect.objectContaining({ terminalId: 'terminal-a', itemName: 'Hot Dog' }),
        );
      });
    });

    it('does not send a restock request when the claim affects no rows (already pending)', async () => {
      const update = vi.fn().mockResolvedValue({ affected: 0 });
      const post = vi.fn().mockReturnValue(of({}));
      const service = createService(createStockRepo({ update }), post);

      await service.requestRestockIfNeeded('terminal-a', 'Hot Dog');

      expect(post).not.toHaveBeenCalled();
    });

    it('releases the claim when the restock request ultimately fails', async () => {
      const update = vi.fn().mockResolvedValue({ affected: 1 });
      const post = vi.fn().mockReturnValue(throwError(() => new Error('warehouse down')));
      const service = createService(createStockRepo({ update }), post);

      await service.requestRestockIfNeeded('terminal-a', 'Hot Dog');

      await vi.waitFor(() => {
        expect(update).toHaveBeenCalledWith(
          { terminalId: 'terminal-a', itemName: 'Hot Dog' },
          { restockPending: false },
        );
      });
    });
  });
});
