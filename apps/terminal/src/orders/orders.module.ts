import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ORDERS_QUEUE, ORDERS_QUEUE_OPTIONS } from '@app/contracts/orders';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    HttpModule,
    ClientsModule.register([
      {
        name: 'ORDERS_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://rabbitMQ:5672'],
          queue: ORDERS_QUEUE,
          persistent: true,
          // must match the consumer's declaration exactly
          queueOptions: ORDERS_QUEUE_OPTIONS,
        },
      },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
