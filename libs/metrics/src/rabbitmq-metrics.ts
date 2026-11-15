import { Injectable } from '@nestjs/common';
import { Counter, Registry } from '@prometheus-io/client';

export type MessageOutcome = 'ack' | 'requeue' | 'dead_letter';

@Injectable()
export class RabbitmqMetrics {
  private readonly settled: Counter<'pattern' | 'outcome'>;

  constructor(registry: Registry) {
    this.settled = new Counter({
      name: 'rabbitmq_messages_settled_total',
      help: 'Consumed RabbitMQ messages by how the handler settled them (ack, requeue, dead_letter)',
      labelNames: ['pattern', 'outcome'],
      registers: [registry],
    });
  }

  messageSettled(pattern: string, outcome: MessageOutcome): void {
    this.settled.inc({ pattern, outcome });
  }
}
