import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  REPLENISHMENTS_QUEUE,
  REPLENISHMENTS_QUEUE_OPTIONS,
} from '@app/contracts/replenishments';
import { OutboxMessage } from '@app/orders-db';
import { REPLENISHMENT_CLIENT } from './outbox.constants.js';
import { OutboxRelay } from './outbox.relay.js';
import { OutboxService } from './outbox.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutboxMessage]),
    ClientsModule.registerAsync([
      {
        name: REPLENISHMENT_CLIENT,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.get<string>('RABBITMQ_URL', 'amqp://rabbitMQ:5672')],
            queue: REPLENISHMENTS_QUEUE,
            persistent: true,
            // must match the consumer's declaration exactly
            queueOptions: REPLENISHMENTS_QUEUE_OPTIONS,
          },
        }),
      },
    ]),
  ],
  providers: [OutboxService, OutboxRelay],
  exports: [OutboxService],
})
export class OutboxModule {}
