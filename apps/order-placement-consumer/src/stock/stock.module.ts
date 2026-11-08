import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminalStock } from '@app/orders-db';
import { StockService } from './stock.service.js';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  REPLENISHMENTS_QUEUE,
  REPLENISHMENTS_QUEUE_OPTIONS,
} from '@app/contracts/replenishments';

@Module({
  imports: [
    TypeOrmModule.forFeature([TerminalStock]),
    ClientsModule.registerAsync([
      {
        name: 'REPLENISHMENT_SERVICE',
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
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
