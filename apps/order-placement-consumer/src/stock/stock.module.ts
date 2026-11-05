import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminalStock } from '@app/orders-db';
import { StockService } from './stock.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([TerminalStock]), HttpModule],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
