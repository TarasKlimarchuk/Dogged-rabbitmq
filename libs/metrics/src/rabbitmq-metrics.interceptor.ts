import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import { Histogram, Registry } from '@prometheus-io/client';
import { Observable, tap } from 'rxjs';

@Injectable()
export class RabbitmqMetricsInterceptor implements NestInterceptor {
  private readonly duration: Histogram<'pattern' | 'outcome'>;

  constructor(registry: Registry) {
    this.duration = new Histogram({
      name: 'rabbitmq_message_handling_duration_seconds',
      help: 'Duration of RabbitMQ message handling in seconds',
      labelNames: ['pattern', 'outcome'],
      registers: [registry],
    });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'rpc') {
      return next.handle();
    }

    const pattern = context
      .switchToRpc()
      .getContext<RmqContext>()
      .getPattern();
    const stopTimer = this.duration.startTimer({ pattern });

    return next.handle().pipe(
      tap({
        next: () => stopTimer({ outcome: 'success' }),
        error: () => stopTimer({ outcome: 'error' }),
      }),
    );
  }
}
