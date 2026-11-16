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
        { outcome: 'invalid', reason: formatErrors(errors) },
        'invalid order.place message, moved to DLQ',
      );
      channel.nack(originalMsg, false, false);
      this.rabbitmqMetrics.messageSettled(ORDER_PATTERNS.PLACE, 'dead_letter');
      return;
    }

    // Logged as separate JSON fields, so Loki can filter on each of them.
    const fields = {
      orderId: message.orderId,
      terminalId: message.terminalId,
    };

    try {
      const out = await this.service.handleOrderPlaced(message);
      switch (out.kind) {
        case 'placed':
          this.logger.log(
            { ...fields, outcome: 'placed', inventoryIssue: out.inventoryIssue },
            'order placed',
          );
          // One line per restock, so a search for the restockRequestId
          // finds the order that triggered it.
          for (const restock of out.restockRequests) {
            this.logger.log({ ...fields, ...restock }, 'restock requested');
          }
          channel.ack(originalMsg);
          this.rabbitmqMetrics.messageSettled(ORDER_PATTERNS.PLACE, 'ack');
          break;
        case 'duplicate':
          this.logger.log(
            { ...fields, outcome: 'duplicate' },
            'duplicate order ignored',
          );
          channel.ack(originalMsg);
          this.rabbitmqMetrics.messageSettled(ORDER_PATTERNS.PLACE, 'ack');
          break;
        case 'rejected':
          // no requeue = dead letter: goes straight to the DLQ
          this.logger.warn(
            { ...fields, outcome: 'rejected', reason: out.reason },
            'order rejected, moved to DLQ',
          );
          channel.nack(originalMsg, false, false);
          this.rabbitmqMetrics.messageSettled(ORDER_PATTERNS.PLACE, 'dead_letter');
          break;
        default:
          assertNever(out);
      }
    } catch (err) {
      const attempt = deliveryAttempt(originalMsg);
      const retry = { ...fields, attempt, maxAttempts: ORDERS_MAX_ATTEMPTS };
      if (attempt >= ORDERS_MAX_ATTEMPTS) {
        this.logger.error(
          { ...retry, outcome: 'final_failure', err },
          'order failed on final attempt, RabbitMQ will move it to the DLQ',
        );
      } else {
        this.logger.warn(
          { ...retry, outcome: 'retry', reason: (err as Error).message },
          'order failed, requeueing',
        );
      }
      channel.reject(originalMsg, true);
      this.rabbitmqMetrics.messageSettled(ORDER_PATTERNS.PLACE, 'requeue');
    }
  }
}
