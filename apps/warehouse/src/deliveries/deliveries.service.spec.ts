import type { DataSource, EntityManager, Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { REPLENISHMENT_PATTERNS } from '@app/contracts/replenishments';
import type { OutboxService } from '@app/outbox';
import { Delivery } from '@app/warehouse-db';
import { DeliveriesService } from './deliveries.service.js';

const pending: Delivery = {
  id: 'delivery-1',
  restockRequestId: null,
  terminalId: 'terminal-a',
  itemName: 'Hot Dog',
  quantity: 50,
  delivered: false,
  createdAt: new Date('2026-10-10T10:00:00Z'),
};
const delivered: Delivery = { ...pending, id: 'delivery-2', delivered: true };

function setup({
  find = vi.fn(),
  update = vi.fn().mockResolvedValue({ affected: 1 }),
  findOneBy = vi.fn().mockResolvedValue({ ...pending, delivered: true }),
  enqueue = vi.fn().mockResolvedValue('message-id'),
} = {}) {
  const repo = { find } as unknown as Repository<Delivery>;
  const manager = { update, findOneBy };
  // Like the real one: runs the callback with a manager and rejects if it
  // throws (which is what makes TypeORM roll back).
  const transaction = vi.fn(
    async (work: (m: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
  );
  const outbox = { enqueue };
  const service = new DeliveriesService(
    repo,
    { transaction } as unknown as DataSource,
    outbox as unknown as OutboxService,
  );
  return { service, manager, transaction, outbox };
}

describe('DeliveriesService', () => {
  describe('findAll()', () => {
    it('maps deliveries to status-bearing details, newest first, with no filter by default', async () => {
      const find = vi.fn().mockResolvedValue([delivered, pending]);
      const { service } = setup({ find });

      const result = await service.findAll();

      expect(find).toHaveBeenCalledWith({ where: {}, order: { createdAt: 'DESC' } });
      expect(result).toEqual([
        expect.objectContaining({ deliveryId: 'delivery-2', status: 'delivered' }),
        expect.objectContaining({ deliveryId: 'delivery-1', status: 'pending' }),
      ]);
    });

    it('filters to pending deliveries', async () => {
      const find = vi.fn().mockResolvedValue([pending]);
      const { service } = setup({ find });

      await service.findAll('pending');

      expect(find).toHaveBeenCalledWith({
        where: { delivered: false },
        order: { createdAt: 'DESC' },
      });
    });

    it('filters to delivered deliveries', async () => {
      const find = vi.fn().mockResolvedValue([delivered]);
      const { service } = setup({ find });

      await service.findAll('delivered');

      expect(find).toHaveBeenCalledWith({
        where: { delivered: true },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('confirmDelivery()', () => {
    it('claims the delivery and enqueues restock_delivered in the same transaction', async () => {
      const { service, manager, transaction, outbox } = setup();

      const result = await service.confirmDelivery('delivery-1');

      expect(result).toEqual({ deliveryId: 'delivery-1', status: 'delivered' });
      expect(transaction).toHaveBeenCalledTimes(1);
      // only flips a delivery that is still pending
      expect(manager.update).toHaveBeenCalledWith(
        Delivery,
        { id: 'delivery-1', delivered: false },
        { delivered: true },
      );
      // same manager → the message commits (or rolls back) with the claim
      expect(outbox.enqueue).toHaveBeenCalledWith(
        manager,
        REPLENISHMENT_PATTERNS.RESTOCK_DELIVERED,
        {
          deliveryId: 'delivery-1',
          terminalId: 'terminal-a',
          itemName: 'Hot Dog',
          quantity: 50,
        },
      );
    });

    it('is idempotent: an already-delivered delivery is not enqueued again', async () => {
      const { service, outbox } = setup({
        update: vi.fn().mockResolvedValue({ affected: 0 }),
      });

      const result = await service.confirmDelivery('delivery-1');

      expect(result).toEqual({ deliveryId: 'delivery-1', status: 'delivered' });
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown delivery', async () => {
      const { service, outbox } = setup({
        update: vi.fn().mockResolvedValue({ affected: 0 }),
        findOneBy: vi.fn().mockResolvedValue(null),
      });

      await expect(service.confirmDelivery('missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('lets an outbox failure propagate so the claim rolls back too', async () => {
      const { service } = setup({
        enqueue: vi.fn().mockRejectedValue(new Error('db down')),
      });

      await expect(service.confirmDelivery('delivery-1')).rejects.toThrow(
        'db down',
      );
    });
  });
});
