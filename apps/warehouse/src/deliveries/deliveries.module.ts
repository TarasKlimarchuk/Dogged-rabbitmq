import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  RESTOCK_DELIVERIES_QUEUE,
  RESTOCK_DELIVERIES_QUEUE_OPTIONS,
} from '@app/contracts/replenishments';
import { OutboxModule } from '@app/outbox';
import { Delivery } from '@app/warehouse-db';
import { DeliveriesController } from './deliveries.controller.js';
import { DeliveriesService } from './deliveries.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery]),
    // confirmed deliveries go to orders-worker
    OutboxModule.register({
      queue: RESTOCK_DELIVERIES_QUEUE,
      queueOptions: RESTOCK_DELIVERIES_QUEUE_OPTIONS,
    }),
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
})
export class DeliveriesModule {}
