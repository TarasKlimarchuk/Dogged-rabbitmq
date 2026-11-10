import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  REPLENISHMENTS_QUEUE,
  REPLENISHMENTS_QUEUE_OPTIONS,
} from '@app/contracts/replenishments';
import { TerminalStock } from '@app/orders-db';
import { OutboxModule } from '@app/outbox';
import { StockService } from './stock.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([TerminalStock]),
    // restock requests go to restock-request-consumer
    OutboxModule.register({
      queue: REPLENISHMENTS_QUEUE,
      queueOptions: REPLENISHMENTS_QUEUE_OPTIONS,
    }),
  ],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
