import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  REPLENISHMENT_PATTERNS,
  REPLENISHMENTS_MAX_ATTEMPTS,
  RestockRequestedEvent,
} from '@app/contracts/replenishments';
import { assertNever, deliveryAttempt, formatErrors } from '@app/utils';
import { RestockRequestConsumerService } from './restock-request-consumer.service.js';

@Controller()
export class RestockRequestConsumerController {
  private readonly logger = new Logger(RestockRequestConsumerController.name);

  constructor(private readonly service: RestockRequestConsumerService) {}

  @EventPattern<string>(REPLENISHMENT_PATTERNS.RESTOCK_REQUESTED)
  async handleRestockRequested(
    @Payload() payload: unknown,
    @Ctx() ctx: RmqContext,
  ) {
    const channel = ctx.getChannelRef();
    const originalMsg = ctx.getMessage();

    const event = plainToInstance(RestockRequestedEvent, payload);
    const errors = await validate(event, { whitelist: true });
    if (errors.length > 0) {
      this.logger.warn(
        `invalid ${REPLENISHMENT_PATTERNS.RESTOCK_REQUESTED} message, moved to DLQ: ${formatErrors(errors)}`,
      );
      channel.nack(originalMsg, false, false);
      return;
    }

    const key = `messageId=${event.messageId} terminalId=${event.terminalId} itemName=${event.itemName}`;

    try {
      const out = await this.service.handleRestockRequested(event);
      switch (out.kind) {
        case 'created':
          this.logger.log(`delivery ${out.deliveryId} created, ${key}`);
          break;
        case 'duplicate':
          this.logger.log(`duplicate restock request ignored, ${key}`);
          break;
        default:
          assertNever(out);
      }
      channel.ack(originalMsg);
    } catch (error) {
      const attempt = deliveryAttempt(originalMsg);
      const { message: reason, stack } = error as Error;
      if (attempt >= REPLENISHMENTS_MAX_ATTEMPTS) {
        this.logger.error(
          `restock request failed on final attempt ${attempt}/${REPLENISHMENTS_MAX_ATTEMPTS}, RabbitMQ will move it to the DLQ, ${key}: ${reason}`,
          stack,
        );
      } else {
        this.logger.warn(
          `restock request failed (attempt ${attempt}/${REPLENISHMENTS_MAX_ATTEMPTS}), requeueing, ${key}: ${reason}`,
        );
      }
      // requeue so the quorum queue counts the delivery; past
      // x-delivery-limit it dead-letters instead
      channel.reject(originalMsg, true);
    }
  }
}
