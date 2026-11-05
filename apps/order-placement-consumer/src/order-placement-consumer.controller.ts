import { Controller, Logger } from '@nestjs/common';
import { OrderPlacementConsumerService } from './order-placement-consumer.service.js';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  ORDER_PATTERNS,
  ORDERS_MAX_DELIVERIES,
  PlaceOrderMessage,
} from '@app/contracts';
import { assertNever, formatErrors } from '@app/utils';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@Controller()
export class OrderPlacementConsumerController {
  private readonly logger = new Logger(OrderPlacementConsumerController.name);
  constructor(private readonly service: OrderPlacementConsumerService) {}

  @EventPattern<string>(ORDER_PATTERNS.PLACE)
  async handleOrderPlaced(
    @Payload() payload: unknown,
    @Ctx() ctx: RmqContext,
  ) {
    const channel = ctx.getChannelRef();
    const originalMsg = ctx.getMessage();

    const message = plainToInstance(PlaceOrderMessage, payload);
    const errors = await validate(message, { whitelist: true });
    if (errors.length > 0) {
      this.logger.warn(
        `invalid order.place message, moved to DLQ: ${formatErrors(errors)}`,
      );
      channel.nack(originalMsg, false, false);
      return;
    }

    const key = `idempotencyKey=${message.idempotencyKey}`;

    try {
      const out = await this.service.handleOrderPlaced(message);

      switch (out.kind) {
        case 'placed':
          this.logger.log(`order placed, ${key} inventoryIssue=${out.inventoryIssue}`);
          channel.ack(originalMsg);
          break;
        case 'duplicate':
          this.logger.log(`duplicate order ignored, ${key}`);
          channel.ack(originalMsg);
          break;
        case 'rejected':
          // no requeue = dead letter: goes straight to the DLQ
          this.logger.warn(`order rejected, moved to DLQ, ${key}: ${out.reason}`);
          channel.nack(originalMsg, false, false);
          break;
        default:
          assertNever(out);
      }
    } catch (error) {
      // Requeue: RabbitMQ counts the delivery, and once it reaches
      // ORDERS_MAX_DELIVERIES it dead-letters the message to the DLQ.
      const attempt = deliveryAttempt(originalMsg);
      const reason = (error as Error).message;
      if (attempt >= ORDERS_MAX_DELIVERIES) {
        this.logger.error(
          `order failed on final attempt ${attempt}/${ORDERS_MAX_DELIVERIES}, RabbitMQ will move it to the DLQ, ${key}: ${reason}`,
        );
      } else {
        this.logger.warn(
          `order failed (attempt ${attempt}/${ORDERS_MAX_DELIVERIES}), requeueing, ${key}: ${reason}`,
        );
      }
      channel.nack(originalMsg, false, true);
    }
  }
}

// Quorum queues set x-delivery-count on redeliveries (it's absent on the first
// one), so the current attempt is that count + 1.
function deliveryAttempt(message: {
  properties?: { headers?: Record<string, unknown> };
}): number {
  const previous = Number(message.properties?.headers?.['x-delivery-count'] ?? 0);
  return (Number.isFinite(previous) ? previous : 0) + 1;
}
