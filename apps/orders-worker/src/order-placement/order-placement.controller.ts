import { Controller, Logger } from '@nestjs/common';
import { OrderPlacementService } from './order-placement.service.js';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  ORDER_PATTERNS,
  ORDERS_MAX_ATTEMPTS,
  PlaceOrderMessage,
} from '@app/contracts/orders';
import { RabbitmqMetrics } from '@app/metrics';
import { assertNever, deliveryAttempt, formatErrors } from '@app/utils';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@Controller()
export class OrderPlacementController {
  private readonly logger = new Logger(OrderPlacementController.name);

  constructor(
    private readonly service: OrderPlacementService,
    private readonly rabbitmqMetrics: RabbitmqMetrics,
  ) {}

  @EventPattern<string>(ORDER_PATTERNS.PLACE)
  async handleOrderPlaced(@Payload() payload: unknown, @Ctx() ctx: RmqContext) {
    const channel = ctx.getChannelRef();
    const originalMsg = ctx.getMessage();

    const message = plainToInstance(PlaceOrderMessage, payload);
    const errors = await validate(message, { whitelist: true });
    if (errors.length > 0) {
      this.logger.warn(
        `invalid order.place message, moved to DLQ: ${formatErrors(errors)}`,
      );
      channel.nack(originalMsg, false, false);
      this.rabbitmqMetrics.messageSettled(ORDER_PATTERNS.PLACE, 'dead_letter');
      return;
    }

    const key = `idempotencyKey=${message.idempotencyKey}`;

    try {
      const out = await this.service.handleOrderPlaced(message);
      switch (out.kind) {
        case 'placed':
          this.logger.log(
            `order placed, ${key} inventoryIssue=${out.inventoryIssue}`,
          );
          channel.ack(originalMsg);
          this.rabbitmqMetrics.messageSettled(ORDER_PATTERNS.PLACE, 'ack');
          break;
        case 'duplicate':
          this.logger.log(`duplicate order ignored, ${key}`);
          channel.ack(originalMsg);
          this.rabbitmqMetrics.messageSettled(ORDER_PATTERNS.PLACE, 'ack');
          break;
        case 'rejected':
          // no requeue = dead letter: goes straight to the DLQ
          this.logger.warn(
            `order rejected, moved to DLQ, ${key}: ${out.reason}`,
          );
          channel.nack(originalMsg, false, false);
          this.rabbitmqMetrics.messageSettled(ORDER_PATTERNS.PLACE, 'dead_letter');
          break;
        default:
          assertNever(out);
      }
    } catch (error) {
      const attempt = deliveryAttempt(originalMsg);
      const { message: reason, stack } = error as Error;
      if (attempt >= ORDERS_MAX_ATTEMPTS) {
        this.logger.error(
          `order failed on final attempt ${attempt}/${ORDERS_MAX_ATTEMPTS}, RabbitMQ will move it to the DLQ, ${key}: ${reason}`,
          stack,
        );
      } else {
        this.logger.warn(
          `order failed (attempt ${attempt}/${ORDERS_MAX_ATTEMPTS}), requeueing, ${key}: ${reason}`,
        );
      }
      channel.reject(originalMsg, true);
      this.rabbitmqMetrics.messageSettled(ORDER_PATTERNS.PLACE, 'requeue');
    }
  }
}
