import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { PlaceOrderMessage } from '@app/contracts/orders';
import type { Order } from '@app/orders-db';
import { OrderPlacementConsumerService } from './order-placement-consumer.service.js';
import type { MenuService } from './menu/menu.service.js';
import type { ReserveResult, StockService } from './stock/stock.service.js';

const message: PlaceOrderMessage = {
  idempotencyKey: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d',
  terminalId: 'terminal-a',
  items: [{ name: 'Hot Dog', quantity: 2 }],
};

function setup({
  missingNames = [] as string[],
  reserve = { kind: 'reserved', inventoryIssue: false } as ReserveResult,
  insert = vi.fn().mockResolvedValue({}),
} = {}) {
  const manager = {
    create: vi.fn((_entity: unknown, data: object) => data),
    insert,
    update: vi.fn().mockResolvedValue({}),
  };
  // Like the real one: runs the callback with a manager and rejects if it
  // throws (which is what makes TypeORM roll back).
  const transaction = vi.fn(
    async (work: (m: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
  );
  const stock = { reserve: vi.fn().mockResolvedValue(reserve) };
  const menu = { findMissingNames: vi.fn().mockResolvedValue(missingNames) };

  const service = new OrderPlacementConsumerService(
    { transaction } as unknown as DataSource,
    {} as Repository<Order>,
    stock as unknown as StockService,
    menu as unknown as MenuService,
  );
  return { service, manager, transaction, stock };
}

describe('OrderPlacementConsumerService', () => {
  it('inserts the order and reserves stock in one transaction', async () => {
    const { service, manager, transaction, stock } = setup();

    const outcome = await service.handleOrderPlaced(message);

    expect(outcome).toEqual({
      kind: 'placed',
      orderId: message.idempotencyKey,
      inventoryIssue: false,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ idempotencyKey: message.idempotencyKey }),
    );
    expect(stock.reserve).toHaveBeenCalledWith(manager, 'terminal-a', message.items);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('marks the order with inventoryIssue when stock was insufficient', async () => {
    const { service, manager } = setup({
      reserve: { kind: 'reserved', inventoryIssue: true },
    });

    const outcome = await service.handleOrderPlaced(message);

    expect(outcome).toMatchObject({ kind: 'placed', inventoryIssue: true });
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      message.idempotencyKey,
      { inventoryIssue: true },
    );
  });

  it('rejects unknown menu items without starting a transaction', async () => {
    const { service, transaction } = setup({ missingNames: ['Pizza'] });

    const outcome = await service.handleOrderPlaced(message);

    expect(outcome).toEqual({
      kind: 'rejected',
      reason: 'unknown menu item(s): Pizza',
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rolls back and rejects when the terminal has no stock row for an item', async () => {
    const { service, transaction, manager } = setup({
      reserve: { kind: 'missing-stock', itemName: 'Hot Dog' },
    });

    const outcome = await service.handleOrderPlaced(message);

    expect(outcome).toEqual({
      kind: 'rejected',
      reason: 'terminal "terminal-a" has no stock entry for "Hot Dog"',
    });
    // the callback must throw (not return) so TypeORM rolls back the insert
    await expect(transaction.mock.results[0].value).rejects.toThrow();
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('treats a unique-key violation on insert as a duplicate', async () => {
    const { service, stock } = setup({
      insert: vi.fn().mockRejectedValue({ driverError: { code: '23505' } }),
    });

    const outcome = await service.handleOrderPlaced(message);

    expect(outcome).toEqual({ kind: 'duplicate' });
    expect(stock.reserve).not.toHaveBeenCalled();
  });

  it('rethrows unexpected errors so the caller can retry', async () => {
    const { service } = setup({
      insert: vi.fn().mockRejectedValue(new Error('connection refused')),
    });

    await expect(service.handleOrderPlaced(message)).rejects.toThrow('connection refused');
  });
});
