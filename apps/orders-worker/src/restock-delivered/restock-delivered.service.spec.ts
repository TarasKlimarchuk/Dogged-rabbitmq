import type { DataSource, EntityManager } from 'typeorm';
import type { RestockDeliveredEvent } from '@app/contracts/replenishments';
import { ProcessedMessage } from '@app/orders-db';
import { RestockDeliveredService } from './restock-delivered.service.js';
import type { RestockResult, StockService } from '../stock/stock.service.js';

const event: RestockDeliveredEvent = {
  messageId: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d',
  deliveryId: '3b1f7e2a-5c4d-4a9b-8f1e-2d3c4b5a6f7e',
  terminalId: 'terminal-a',
  itemName: 'Hot Dog',
  quantity: 50,
};

function setup({
  inboxRows = [{ messageId: event.messageId }] as unknown[],
  restock = { kind: 'restocked', quantity: 50 } as RestockResult,
} = {}) {
  const qb = {
    insert: vi.fn().mockReturnThis(),
    into: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    orIgnore: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ raw: inboxRows }),
  };
  const manager = { createQueryBuilder: () => qb };
  // Like the real one: runs the callback with a manager and rejects if it
  // throws (which is what makes TypeORM roll back).
  const transaction = vi.fn(
    async (work: (m: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
  );
  const stock = { restock: vi.fn().mockResolvedValue(restock) };
  const service = new RestockDeliveredService(
    { transaction } as unknown as DataSource,
    stock as unknown as StockService,
  );
  return { service, qb, manager, transaction, stock };
}

describe('RestockDeliveredService', () => {
  it('records the messageId and restocks in one transaction', async () => {
    const { service, qb, manager, transaction, stock } = setup();

    const outcome = await service.handleRestockDelivered(event);

    expect(outcome).toEqual({ kind: 'restocked', quantity: 50 });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(qb.into).toHaveBeenCalledWith(ProcessedMessage);
    expect(qb.values).toHaveBeenCalledWith({ messageId: event.messageId });
    expect(qb.orIgnore).toHaveBeenCalled();
    // same manager → the inbox row and the stock change commit together
    expect(stock.restock).toHaveBeenCalledWith(
      manager,
      'terminal-a',
      'Hot Dog',
      50,
    );
  });

  it('skips a message whose id is already in the inbox, without touching stock', async () => {
    const { service, stock } = setup({ inboxRows: [] });

    const outcome = await service.handleRestockDelivered(event);

    expect(outcome).toEqual({ kind: 'duplicate' });
    expect(stock.restock).not.toHaveBeenCalled();
  });

  it('rejects (and rolls back the inbox row) when the terminal has no stock row', async () => {
    const { service, transaction } = setup({
      restock: { kind: 'missing-stock' },
    });

    const outcome = await service.handleRestockDelivered(event);

    expect(outcome).toEqual({
      kind: 'rejected',
      reason: 'terminal "terminal-a" has no stock entry for "Hot Dog"',
    });
    // the transaction callback threw, which is what rolls it back
    await expect(transaction.mock.results[0]?.value).rejects.toThrow();
  });

  it('lets unexpected errors propagate so the message is retried', async () => {
    const { service, stock } = setup();
    stock.restock.mockRejectedValue(new Error('db down'));

    await expect(service.handleRestockDelivered(event)).rejects.toThrow(
      'db down',
    );
  });
});
