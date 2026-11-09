import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminalStock } from '@app/orders-db';
import { OutboxModule } from '../outbox/outbox.module.js';
import { StockService } from './stock.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([TerminalStock]), OutboxModule],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
