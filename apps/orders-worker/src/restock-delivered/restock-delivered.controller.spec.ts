import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import type { RmqContext } from '@nestjs/microservices';
import {
  REPLENISHMENTS_DELIVERY_LIMIT,
  REPLENISHMENTS_MAX_ATTEMPTS,
} from '@app/contracts/replenishments';
import { RestockDeliveredController } from './restock-delivered.controller.js';
import type { RestockDeliveredService } from './restock-delivered.service.js';

const validPayload = {
  messageId: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d',
  deliveryId: '3b1f7e2a-5c4d-4a9b-8f1e-2d3c4b5a6f7e',
  terminalId: 'terminal-a',
  itemName: 'Hot Dog',
  quantity: 50,
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
  const controller = new RestockDeliveredController({
    handleRestockDelivered: handle,
  } as unknown as RestockDeliveredService);
  return { controller, channel, rawMessage, ctx, handle };
}

describe('RestockDeliveredController', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('acks once the stock is restocked', async () => {
    const { controller, channel, rawMessage, ctx, handle } = setup(
      vi.fn().mockResolvedValue({ kind: 'restocked', quantity: 50 }),
    );

    await controller.handleRestockDelivered(validPayload, ctx);

    expect(handle).toHaveBeenCalledWith(expect.objectContaining(validPayload));
    expect(channel.ack).toHaveBeenCalledWith(rawMessage);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('acks a duplicate, since it was already applied', async () => {
    const { controller, channel, rawMessage, ctx } = setup(
      vi.fn().mockResolvedValue({ kind: 'duplicate' }),
    );

    await controller.handleRestockDelivered(validPayload, ctx);

    expect(channel.ack).toHaveBeenCalledWith(rawMessage);
  });

  it('dead-letters a rejected delivery without requeue', async () => {
    const { controller, channel, rawMessage, ctx } = setup(
      vi.fn().mockResolvedValue({ kind: 'rejected', reason: 'no stock row' }),
    );

    await controller.handleRestockDelivered(validPayload, ctx);

    expect(channel.nack).toHaveBeenCalledWith(rawMessage, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it.each([
    ['a non-uuid messageId', { messageId: 'nope' }],
    ['a non-uuid deliveryId', { deliveryId: 'nope' }],
    ['a missing quantity', { quantity: undefined }],
    ['a zero quantity', { quantity: 0 }],
    ['an empty itemName', { itemName: '' }],
  ])(
    'dead-letters a message with %s without calling the service',
    async (_, override) => {
      const { controller, channel, rawMessage, ctx, handle } = setup(vi.fn());

      await controller.handleRestockDelivered(
        { ...validPayload, ...override },
        ctx,
      );

      expect(handle).not.toHaveBeenCalled();
      expect(channel.nack).toHaveBeenCalledWith(rawMessage, false, false);
    },
  );

  it('requeues on an unexpected error so RabbitMQ can count the delivery', async () => {
    const { controller, channel, rawMessage, ctx } = setup(
      vi.fn().mockRejectedValue(new Error('connection refused')),
    );

    await controller.handleRestockDelivered(validPayload, ctx);

    expect(channel.reject).toHaveBeenCalledWith(rawMessage, true);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining(`attempt 1/${REPLENISHMENTS_MAX_ATTEMPTS}`),
    );
  });

  it('logs an error on the final attempt, still leaving the dead-lettering to RabbitMQ', async () => {
    const { controller, channel, rawMessage, ctx } = setup(
      vi.fn().mockRejectedValue(new Error('connection refused')),
      { 'x-delivery-count': REPLENISHMENTS_DELIVERY_LIMIT },
    );

    await controller.handleRestockDelivered(validPayload, ctx);

    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('will move it to the DLQ'),
    );
    expect(channel.reject).toHaveBeenCalledWith(rawMessage, true);
  });
});
