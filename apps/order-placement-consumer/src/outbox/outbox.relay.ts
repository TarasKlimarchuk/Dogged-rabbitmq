import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { DataSource } from 'typeorm';
import { lastValueFrom } from 'rxjs';
import { OutboxMessage } from '@app/orders-db';
import { REPLENISHMENT_CLIENT } from './outbox.constants.js';

export const OUTBOX_POLL_INTERVAL_MS = 2000;
export const OUTBOX_BATCH_SIZE = 50;
// A row that failed this many publishes is skipped from then on (a poison
// message). It stays in the table with its lastError for someone to inspect.
export const OUTBOX_MAX_ATTEMPTS = 20;

// Read side of the outbox: moves unsent rows to RabbitMQ.
//
// Delivery is at-least-once. If the process dies after the broker confirmed
// a publish but before publishedAt is committed, the row is sent again on the
// next tick, so consumers must deduplicate by messageId.
@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    // Every outbox message currently goes to replenishments_queue. When a
    // second destination queue is needed, route by message.pattern instead.
    @Inject(REPLENISHMENT_CLIENT) private readonly client: ClientProxy,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), OUTBOX_POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    // setInterval doesn't wait for the previous tick; a slow batch (e.g.
    // broker timing out) must not get a second batch started on top of it.
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.publishBatch();
    } catch (error) {
      // e.g. the database is down: nothing was marked as sent, so the next
      // tick simply tries again
      this.logger.error(`outbox tick failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  // Returns how many messages were published, for tests and logging.
  async publishBatch(): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      // FOR UPDATE SKIP LOCKED: every replica runs a relay. Each one locks the
      // rows it picked, and the others skip those rows instead of waiting for
      // them, so replicas share the work and never publish the same batch.
      const batch = await manager
        .getRepository(OutboxMessage)
        .createQueryBuilder('message')
        .where('message.publishedAt IS NULL')
        .andWhere('message.attempts < :maxAttempts', {
          maxAttempts: OUTBOX_MAX_ATTEMPTS,
        })
        .orderBy('message.createdAt', 'ASC')
        .limit(OUTBOX_BATCH_SIZE)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      let published = 0;
      for (const message of batch) {
        try {
          // emit() returns an Observable; lastValueFrom turns it into a
          // Promise that settles only once RabbitMQ has confirmed the publish
          // (or failed). Mark the row as sent only after that.
          await lastValueFrom(
            this.client.emit(message.pattern, {
              messageId: message.id,
              ...message.payload,
            }),
          );
          await manager.update(OutboxMessage, message.id, {
            publishedAt: new Date(),
          });
          published++;
        } catch (error) {
          const reason = (error as Error).message;
          this.logger.warn(
            `outbox publish failed id=${message.id} pattern=${message.pattern} attempt=${message.attempts + 1}: ${reason}`,
          );
          await manager.update(OutboxMessage, message.id, {
            attempts: () => '"attempts" + 1',
            lastError: reason,
          });
        }
      }

      if (published > 0) {
        this.logger.log(`outbox published ${published}/${batch.length}`);
      }
      return published;
    });
  }
}
