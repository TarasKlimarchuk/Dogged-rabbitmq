import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { createRetryTimeoutBreakerPolicy } from '@app/resilience';
import { ResilienceMetrics } from '@app/metrics';
import { CreateOrderDto } from '@app/contracts/orders/create-order.dto.js';
import { ClientProxy } from '@nestjs/microservices';
import { ORDER_PATTERNS } from '@app/contracts/orders';
import { ConfigService } from '@nestjs/config';
import { OrderResponseDto } from './order-response.dto.js';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly policy: ReturnType<typeof createRetryTimeoutBreakerPolicy>;

  constructor(
    private readonly config: ConfigService,
    @Inject('ORDERS_SERVICE') private readonly ordersConsumer: ClientProxy,
    metrics: ResilienceMetrics,
  ) {
    this.policy = createRetryTimeoutBreakerPolicy({
      initialDelayMs: 1000,
      ...metrics.breakerHooks('orders-broker-publish'),
    });
  }

  async placeOrder(order: CreateOrderDto): Promise<OrderResponseDto> {
    try {
      const terminalId = this.config.get<string>('TERMINAL_ID', 'terminal-dev');
      await this.policy.execute(() =>
        lastValueFrom(
          this.ordersConsumer.emit(ORDER_PATTERNS.PLACE, {
            ...order,
            terminalId,
          }),
        ),
      );
      return { status: 'accepted', order, terminalId };
    } catch (error) {
      this.logger.warn(
        `order broker publish failed, idempotencyKey=${order.idempotencyKey}: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'orders broker is unavailable, please try again later',
      );
    }
  }
}
