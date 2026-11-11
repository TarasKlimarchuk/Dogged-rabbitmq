import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { OutboxMessage } from './outbox-message.entity.js';

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
