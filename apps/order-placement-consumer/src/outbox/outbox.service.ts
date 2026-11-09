import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { OutboxMessage } from '@app/orders-db';

// Write side of the outbox. Callers must pass the EntityManager of the
// transaction that makes the business change: that is the whole point, the
// message is committed (or rolled back) together with that change.
@Injectable()
export class OutboxService {
  async enqueue(
    manager: EntityManager,
    pattern: string,
    payload: object,
  ): Promise<string> {
    const id = randomUUID();
    await manager.insert(OutboxMessage, { id, pattern, payload });
    return id;
  }
}
