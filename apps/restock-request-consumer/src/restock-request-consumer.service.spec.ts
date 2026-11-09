import type { Repository } from 'typeorm';
import { Delivery } from '@app/warehouse-db';
import { RestockRequestConsumerService } from './restock-request-consumer.service.js';

const event = {
  messageId: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d',
  terminalId: 'terminal-a',
  itemName: 'Hot Dog',
  upToCapacity: 50,
};

function setup(raw: unknown[]) {
  const builder = {
    insert: vi.fn().mockReturnThis(),
    into: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    orIgnore: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ raw }),
  };
  const repo = {
    createQueryBuilder: () => builder,
  } as unknown as Repository<Delivery>;
  return { service: new RestockRequestConsumerService(repo), builder };
}

describe('RestockRequestConsumerService', () => {
  it('inserts a pending delivery for the full capacity, keyed by messageId', async () => {
    const { service, builder } = setup([{ id: 'delivery-1' }]);

    const result = await service.handleRestockRequested(event);

    expect(result).toEqual({ kind: 'created', deliveryId: 'delivery-1' });
    expect(builder.into).toHaveBeenCalledWith(Delivery);
    expect(builder.values).toHaveBeenCalledWith({
      restockRequestId: event.messageId,
      terminalId: 'terminal-a',
      itemName: 'Hot Dog',
      quantity: 50,
    });
    // ON CONFLICT DO NOTHING is what makes redeliveries harmless
    expect(builder.orIgnore).toHaveBeenCalled();
  });

  it('reports a duplicate when the insert hit an existing restockRequestId', async () => {
    const { service } = setup([]);

    await expect(service.handleRestockRequested(event)).resolves.toEqual({
      kind: 'duplicate',
    });
  });

  it('lets a database error propagate so the message is requeued', async () => {
    const { service, builder } = setup([]);
    builder.execute.mockRejectedValue(new Error('db down'));

    await expect(service.handleRestockRequested(event)).rejects.toThrow(
      'db down',
    );
  });
});
