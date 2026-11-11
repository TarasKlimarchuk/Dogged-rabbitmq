import type { EntityManager } from 'typeorm';
import { OutboxMessage } from './outbox-message.entity.js';
import { OutboxService } from './outbox.service.js';

describe('OutboxService', () => {
  it("inserts the message through the caller's transaction manager and returns its id", async () => {
    const insert = vi.fn().mockResolvedValue({});
    const manager = { insert } as unknown as EntityManager;

    const id = await new OutboxService().enqueue(manager, 'some.pattern', {
      a: 1,
    });

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(insert).toHaveBeenCalledWith(OutboxMessage, {
      id,
      pattern: 'some.pattern',
      payload: { a: 1 },
    });
  });
});
