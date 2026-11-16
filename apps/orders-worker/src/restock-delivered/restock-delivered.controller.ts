import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  REPLENISHMENT_PATTERNS,
  REPLENISHMENTS_MAX_ATTEMPTS,
  RestockDeliveredEvent,
} from '@app/contracts/replenishments';
import { RabbitmqMetrics } from '@app/metrics';
import { assertNever, deliveryAttempt, formatErrors } from '@app/utils';
import { RestockDeliveredService } from './restock-delivered.service.js';

@Controller()
export class RestockDeliveredController {
  private readonly logger = new Logger(RestockDeliveredController.name);

  constructor(
    private readonly service: RestockDeliveredService,
    private readonly rabbitmqMetrics: RabbitmqMetrics,
  ) {}

  @EventPattern<string>(REPLENISHMENT_PATTERNS.RESTOCK_DELIVERED)
  async handleRestockDelivered(
    @Payload() payload: unknown,
    @Ctx() ctx: RmqContext,
  ) {
    const channel = ctx.getChannelRef();
    const originalMsg = ctx.getMessage();

    const event = plainToInstance(RestockDeliveredEvent, payload);
    const errors = await validate(event, { whitelist: true });
    if (errors.length > 0) {
      this.logger.warn(
        { outcome: 'invalid', reason: formatErrors(errors) },
        `invalid ${REPLENISHMENT_PATTERNS.RESTOCK_DELIVERED} message, moved to DLQ`,
      );
      channel.nack(originalMsg, false, false);
      this.rabbitmqMetrics.messageSettled(REPLENISHMENT_PATTERNS.RESTOCK_DELIVERED, 'dead_letter');
      return;
    }

    // Logged as separate JSON fields, so Loki can filter on each of them.
    const fields = {
      messageId: event.messageId,
      deliveryId: event.deliveryId,
      terminalId: event.terminalId,
      itemName: event.itemName,
    };

    try {
      const out = await this.service.handleRestockDelivered(event);
      switch (out.kind) {
        case 'restocked':
          this.logger.log(
            { ...fields, outcome: 'restocked', quantity: out.quantity },
            'stock restocked',
          );
          channel.ack(originalMsg);
          this.rabbitmqMetrics.messageSettled(REPLENISHMENT_PATTERNS.RESTOCK_DELIVERED, 'ack');
          break;
        case 'duplicate':
          this.logger.log(
            { ...fields, outcome: 'duplicate' },
            'duplicate delivery ignored',
          );
          channel.ack(originalMsg);
          this.rabbitmqMetrics.messageSettled(REPLENISHMENT_PATTERNS.RESTOCK_DELIVERED, 'ack');
          break;
        case 'rejected':
          // retrying can't fix it: dead-letter straight away
          this.logger.warn(
            { ...fields, outcome: 'rejected', reason: out.reason },
            'delivery rejected, moved to DLQ',
          );
          channel.nack(originalMsg, false, false);
          this.rabbitmqMetrics.messageSettled(REPLENISHMENT_PATTERNS.RESTOCK_DELIVERED, 'dead_letter');
          break;
        default:
          assertNever(out);
      }
    } catch (error) {
      const attempt = deliveryAttempt(originalMsg);
      const retry = {
        ...fields,
        attempt,
        maxAttempts: REPLENISHMENTS_MAX_ATTEMPTS,
      };
      if (attempt >= REPLENISHMENTS_MAX_ATTEMPTS) {
        this.logger.error(
          { ...retry, outcome: 'final_failure', err: error },
          'delivery failed on final attempt, RabbitMQ will move it to the DLQ',
        );
      } else {
        this.logger.warn(
          { ...retry, outcome: 'retry', reason: (error as Error).message },
          'delivery failed, requeueing',
        );
      }
      // requeue so the quorum queue counts the delivery; past
      // x-delivery-limit it dead-letters instead
      channel.reject(originalMsg, true);
      this.rabbitmqMetrics.messageSettled(REPLENISHMENT_PATTERNS.RESTOCK_DELIVERED, 'requeue');
    }
  }
}
