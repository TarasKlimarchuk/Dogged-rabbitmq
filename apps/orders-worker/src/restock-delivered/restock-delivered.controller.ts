import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  REPLENISHMENT_PATTERNS,
  REPLENISHMENTS_MAX_ATTEMPTS,
  RestockDeliveredEvent,
} from '@app/contracts/replenishments';
import { assertNever, deliveryAttempt, formatErrors } from '@app/utils';
import { RestockDeliveredService } from './restock-delivered.service.js';

@Controller()
export class RestockDeliveredController {
  private readonly logger = new Logger(RestockDeliveredController.name);

  constructor(private readonly service: RestockDeliveredService) {}

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
        `invalid ${REPLENISHMENT_PATTERNS.RESTOCK_DELIVERED} message, moved to DLQ: ${formatErrors(errors)}`,
      );
      channel.nack(originalMsg, false, false);
      return;
    }

    const key = `messageId=${event.messageId} deliveryId=${event.deliveryId} terminalId=${event.terminalId} itemName=${event.itemName}`;

    try {
      const out = await this.service.handleRestockDelivered(event);
      switch (out.kind) {
        case 'restocked':
          this.logger.log(`stock restocked to ${out.quantity}, ${key}`);
          channel.ack(originalMsg);
          break;
        case 'duplicate':
          this.logger.log(`duplicate delivery ignored, ${key}`);
          channel.ack(originalMsg);
          break;
        case 'rejected':
          // retrying can't fix it: dead-letter straight away
          this.logger.warn(`delivery rejected, moved to DLQ, ${key}: ${out.reason}`);
          channel.nack(originalMsg, false, false);
          break;
        default:
          assertNever(out);
      }
    } catch (error) {
      const attempt = deliveryAttempt(originalMsg);
      const { message: reason, stack } = error as Error;
      if (attempt >= REPLENISHMENTS_MAX_ATTEMPTS) {
        this.logger.error(
          `delivery failed on final attempt ${attempt}/${REPLENISHMENTS_MAX_ATTEMPTS}, RabbitMQ will move it to the DLQ, ${key}: ${reason}`,
          stack,
        );
      } else {
        this.logger.warn(
          `delivery failed (attempt ${attempt}/${REPLENISHMENTS_MAX_ATTEMPTS}), requeueing, ${key}: ${reason}`,
        );
      }
      // requeue so the quorum queue counts the delivery; past
      // x-delivery-limit it dead-letters instead
      channel.reject(originalMsg, true);
    }
  }
}
