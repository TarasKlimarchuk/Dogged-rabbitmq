import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { RmqContext } from '@nestjs/microservices';
import { ORDERS_DELIVERY_LIMIT, ORDERS_MAX_ATTEMPTS } from '@app/contracts/orders';
import { OrderPlacementConsumerController } from './order-placement-consumer.controller.js';
import type { OrderPlacementConsumerService } from './order-placement-consumer.service.js';

const validPayload = {
  idempotencyKey: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d',
  terminalId: 'terminal-a',
  items: [{ name: 'Hot Dog', quantity: 2 }],
};

function setup(
  handle: ReturnType<typeof vi.fn>,
  headers: Record<string, unknown> = {},
) {
  const channel = { ack: vi.fn(), nack: vi.fn(), reject: vi.fn() };
  const rawMessage = { properties: { headers } };
  const ctx = {
    getChannelRef: () => channel,
    getMessage: () => rawMessage,
  } as unknown as RmqContext;
  const controller = new OrderPlacementConsumerController({
    handleOrderPlaced: handle,
  } as unknown as OrderPlacementConsumerService);
  return { controller, channel, rawMessage, ctx, handle };
}

describe('OrderPlacementConsumerController', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('acks a placed order', async () => {
    const { controller, channel, rawMessage, ctx } = setup(
      vi.fn().mockResolvedValue({ kind: 'placed', orderId: 'x', inventoryIssue: false }),
    );

    await controller.handleOrderPlaced(validPayload, ctx);

    expect(channel.ack).toHaveBeenCalledWith(rawMessage);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('acks a duplicate, since it was already processed', async () => {
    const { controller, channel, rawMessage, ctx } = setup(
      vi.fn().mockResolvedValue({ kind: 'duplicate' }),
    );

    await controller.handleOrderPlaced(validPayload, ctx);

    expect(channel.ack).toHaveBeenCalledWith(rawMessage);
  });

  it('dead-letters a rejected order without requeue', async () => {
    const { controller, channel, rawMessage, ctx } = setup(
      vi.fn().mockResolvedValue({ kind: 'rejected', reason: 'unknown menu item(s): Pizza' }),
    );

    await controller.handleOrderPlaced(validPayload, ctx);

    expect(channel.nack).toHaveBeenCalledWith(rawMessage, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('dead-letters an invalid message without calling the service', async () => {
    const { controller, channel, rawMessage, ctx, handle } = setup(vi.fn());

    await controller.handleOrderPlaced(
      { ...validPayload, items: [{ name: 'Hot Dog', quantity: 0 }] },
      ctx,
    );

    expect(handle).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(rawMessage, false, false);
  });

  it('requeues on an unexpected error so RabbitMQ can count the delivery', async () => {
    const { controller, channel, rawMessage, ctx } = setup(
      vi.fn().mockRejectedValue(new Error('connection refused')),
    );

    await controller.handleOrderPlaced(validPayload, ctx);

    expect(channel.reject).toHaveBeenCalledWith(rawMessage, true);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining(`attempt 1/${ORDERS_MAX_ATTEMPTS}`),
    );
  });

  it('reads the attempt number from x-delivery-count on redeliveries', async () => {
    const { controller, ctx } = setup(
      vi.fn().mockRejectedValue(new Error('connection refused')),
      { 'x-delivery-count': 2 },
    );

    await controller.handleOrderPlaced(validPayload, ctx);

    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining(`attempt 3/${ORDERS_MAX_ATTEMPTS}`),
    );
  });

  it('logs an error on the final attempt, still leaving the dead-lettering to RabbitMQ', async () => {
    const { controller, channel, rawMessage, ctx } = setup(
      vi.fn().mockRejectedValue(new Error('connection refused')),
      { 'x-delivery-count': ORDERS_DELIVERY_LIMIT },
    );

    await controller.handleOrderPlaced(validPayload, ctx);

    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('will move it to the DLQ'),
    );
    expect(channel.reject).toHaveBeenCalledWith(rawMessage, true);
  });
});
