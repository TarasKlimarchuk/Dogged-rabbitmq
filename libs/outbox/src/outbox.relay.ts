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
import { OutboxMessage } from './outbox-message.entity.js';
import { OUTBOX_CLIENT } from './outbox.constants.js';
import { OutboxMetrics } from '@app/metrics';

export const OUTBOX_POLL_INTERVAL_MS = 2000;
export const OUTBOX_BATCH_SIZE = 50;
export const OUTBOX_MAX_ATTEMPTS = 20;

@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    @Inject(OUTBOX_CLIENT) private readonly client: ClientProxy,
    private readonly outboxMetrics: OutboxMetrics,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), OUTBOX_POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.publishBatch();
    } catch (error) {
      this.logger.error({ err: error }, 'outbox tick failed');
    } finally {
      this.running = false;
    }
  }

  async publishBatch(): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
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
          const attempt = message.attempts + 1;
          const fields = {
            outboxId: message.id,
            pattern: message.pattern,
            attempt,
            maxAttempts: OUTBOX_MAX_ATTEMPTS,
            reason,
          };
          if (attempt === OUTBOX_MAX_ATTEMPTS) {
            this.logger.error(
              fields,
              'outbox message exhausted, it will not be retried',
            );
            this.outboxMetrics.messageExhausted(message.pattern);
          } else {
            this.logger.warn(fields, 'outbox publish failed');
          }
          await manager.update(OutboxMessage, message.id, {
            attempts: () => '"attempts" + 1',
            lastError: reason,
          });
        }
      }

      if (published > 0) {
        this.logger.log(
          { published, batchSize: batch.length },
          'outbox batch published',
        );
      }
      return published;
    });
  }
}
