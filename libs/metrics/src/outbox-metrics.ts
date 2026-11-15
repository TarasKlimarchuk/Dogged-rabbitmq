import { Injectable } from '@nestjs/common';
import { Counter, Registry } from '@prometheus-io/client';

@Injectable()
export class OutboxMetrics {
  private readonly exhausted: Counter<'pattern'>;

  constructor(registry: Registry) {
    this.exhausted = new Counter({
      name: 'outbox_exhausted_total',
      help: 'Outbox messages that hit the max publish attempts and will not be retried',
      labelNames: ['pattern'],
      registers: [registry],
    });
  }

  messageExhausted(pattern: string): void {
    this.exhausted.inc({ pattern });
  }
}
