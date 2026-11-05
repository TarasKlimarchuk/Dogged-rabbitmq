import { Registry } from '@prometheus-io/client';
import { ResilienceMetrics } from '@app/metrics';
import type { Repository } from 'typeorm';
import type { HttpService } from '@nestjs/axios';
import type { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { DeliveriesService } from './deliveries.service.js';
import type { Delivery } from './delivery.entity.js';

const metrics = new ResilienceMetrics(new Registry());

function createRepo(overrides: Partial<Repository<Delivery>> = {}): Repository<Delivery> {
  return {
    create: vi.fn((data: Partial<Delivery>) => data),
    save: vi.fn((data: Partial<Delivery>) => Promise.resolve({ id: 'delivery-1', delivered: false, ...data })),
    findOneBy: vi.fn(),
    update: vi.fn(),
    ...overrides,
  } as unknown as Repository<Delivery>;
}

function createHttp(post: ReturnType<typeof vi.fn>): HttpService {
  return { post } as unknown as HttpService;
}

function createConfig(): ConfigService {
  return { get: () => 'http://orders-management:3001' } as unknown as ConfigService;
}

describe('DeliveriesService', () => {
  it('requestRestock() ships the full amount asked for and returns a pending delivery', async () => {
    const repo = createRepo();
    const service = new DeliveriesService(repo, createHttp(vi.fn()), createConfig(), metrics);

    const result = await service.requestRestock({
      terminalId: 'terminal-a',
      itemName: 'Hot Dog',
      upToCapacity: 50,
    });

    expect(result).toEqual({ deliveryId: 'delivery-1', status: 'pending' });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ terminalId: 'terminal-a', itemName: 'Hot Dog', quantity: 50 }),
    );
  });

  describe('findAll()', () => {
    const pending: Delivery = {
      id: 'delivery-1',
      terminalId: 'terminal-a',
      itemName: 'Hot Dog',
      quantity: 50,
      delivered: false,
      notifiedOrdersManagement: false,
      createdAt: new Date('2026-10-10T10:00:00Z'),
    };
    const delivered: Delivery = {
      ...pending,
      id: 'delivery-2',
      delivered: true,
      notifiedOrdersManagement: true,
    };

    it('maps deliveries to status-bearing details, newest first, with no filter by default', async () => {
      const find = vi.fn().mockResolvedValue([delivered, pending]);
      const service = new DeliveriesService(createRepo({ find }), createHttp(vi.fn()), createConfig(), metrics);

      const result = await service.findAll();

      expect(find).toHaveBeenCalledWith({ where: {}, order: { createdAt: 'DESC' } });
      expect(result).toEqual([
        expect.objectContaining({ deliveryId: 'delivery-2', status: 'delivered', notifiedOrdersManagement: true }),
        expect.objectContaining({ deliveryId: 'delivery-1', status: 'pending', notifiedOrdersManagement: false }),
      ]);
    });

    it('filters to pending deliveries', async () => {
      const find = vi.fn().mockResolvedValue([pending]);
      const service = new DeliveriesService(createRepo({ find }), createHttp(vi.fn()), createConfig(), metrics);

      await service.findAll('pending');

      expect(find).toHaveBeenCalledWith({
        where: { delivered: false },
        order: { createdAt: 'DESC' },
      });
    });

    it('filters to delivered deliveries', async () => {
      const find = vi.fn().mockResolvedValue([delivered]);
      const service = new DeliveriesService(createRepo({ find }), createHttp(vi.fn()), createConfig(), metrics);

      await service.findAll('delivered');

      expect(find).toHaveBeenCalledWith({
        where: { delivered: true },
        order: { createdAt: 'DESC' },
      });
    });
  });

  it('confirmDelivery() throws NotFoundException for an unknown delivery', async () => {
    const repo = createRepo({ findOneBy: vi.fn().mockResolvedValue(null) });
    const service = new DeliveriesService(repo, createHttp(vi.fn()), createConfig(), metrics);

    await expect(service.confirmDelivery('missing')).rejects.toThrow(NotFoundException);
  });

  it('confirmDelivery() marks delivered and notifies orders-management without blocking the response', async () => {
    const delivery: Delivery = {
      id: 'delivery-1',
      terminalId: 'terminal-a',
      itemName: 'Hot Dog',
      quantity: 50,
      delivered: false,
      notifiedOrdersManagement: false,
      createdAt: new Date(),
    };
    const findOneBy = vi.fn().mockResolvedValue(delivery);
    const update = vi.fn().mockResolvedValue({ affected: 1 });
    const repo = createRepo({ findOneBy, update });
    const post = vi.fn().mockReturnValue(of({}));
    const service = new DeliveriesService(repo, createHttp(post), createConfig(), metrics);

    const result = await service.confirmDelivery('delivery-1');

    expect(result).toEqual({ deliveryId: 'delivery-1', status: 'delivered' });
    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledWith('http://orders-management:3001/stock/restock-callback', {
        terminalId: 'terminal-a',
        itemName: 'Hot Dog',
        quantity: 50,
      });
    });
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledWith(
        { id: 'delivery-1' },
        { notifiedOrdersManagement: true },
      );
    });
  });

  it('confirmDelivery() is idempotent — confirming an already-delivered delivery does not re-notify', async () => {
    const delivery: Delivery = {
      id: 'delivery-1',
      terminalId: 'terminal-a',
      itemName: 'Hot Dog',
      quantity: 50,
      delivered: true,
      notifiedOrdersManagement: true,
      createdAt: new Date(),
    };
    const findOneBy = vi.fn().mockResolvedValue(delivery);
    const post = vi.fn();
    const repo = createRepo({ findOneBy });
    const service = new DeliveriesService(repo, createHttp(post), createConfig(), metrics);

    const result = await service.confirmDelivery('delivery-1');

    expect(result).toEqual({ deliveryId: 'delivery-1', status: 'delivered' });
    expect(post).not.toHaveBeenCalled();
  });

  it('does not throw and leaves notifiedOrdersManagement unset when the callback keeps failing', async () => {
    const delivery: Delivery = {
      id: 'delivery-1',
      terminalId: 'terminal-a',
      itemName: 'Hot Dog',
      quantity: 50,
      delivered: false,
      notifiedOrdersManagement: false,
      createdAt: new Date(),
    };
    const findOneBy = vi.fn().mockResolvedValue(delivery);
    const update = vi.fn();
    const repo = createRepo({ findOneBy, update });
    const post = vi.fn().mockReturnValue(throwError(() => new Error('orders-management down')));
    const service = new DeliveriesService(repo, createHttp(post), createConfig(), metrics);

    await expect(service.confirmDelivery('delivery-1')).resolves.toEqual({
      deliveryId: 'delivery-1',
      status: 'delivered',
    });

    await vi.waitFor(() => {
      expect(post).toHaveBeenCalled();
    });
    expect(update).not.toHaveBeenCalled();
  });
});
