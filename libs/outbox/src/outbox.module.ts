import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import type { RmqOptions } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxMessage } from './outbox-message.entity.js';
import { OUTBOX_CLIENT } from './outbox.constants.js';
import { OutboxRelay } from './outbox.relay.js';
import { OutboxService } from './outbox.service.js';

export interface OutboxModuleOptions {
  queue: string;
  queueOptions: NonNullable<RmqOptions['options']>['queueOptions'];
}

@Module({})
export class OutboxModule {
  static register(options: OutboxModuleOptions): DynamicModule {
    return {
      module: OutboxModule,
      imports: [
        TypeOrmModule.forFeature([OutboxMessage]),
        ClientsModule.registerAsync([
          {
            name: OUTBOX_CLIENT,
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
              transport: Transport.RMQ,
              options: {
                urls: [
                  config.get<string>('RABBITMQ_URL', 'amqp://rabbitMQ:5672'),
                ],
                queue: options.queue,
                persistent: true,
                queueOptions: options.queueOptions,
              },
            }),
          },
        ]),
      ],
      providers: [OutboxService, OutboxRelay],
      exports: [OutboxService],
    };
  }
}
