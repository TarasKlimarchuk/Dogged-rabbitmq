import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MetricsModule } from '@app/metrics';
import { Order, ProcessedMessage } from '@app/orders-db';
import { OrderPlacementController } from './order-placement/order-placement.controller.js';
import { OrderPlacementService } from './order-placement/order-placement.service.js';
import { RestockDeliveredController } from './restock-delivered/restock-delivered.controller.js';
import { RestockDeliveredService } from './restock-delivered/restock-delivered.service.js';
import { StockModule } from './stock/stock.module.js';
import { MenuModule } from './menu/menu.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('POSTGRES_HOST', 'localhost'),
        port: config.get<number>('POSTGRES_PORT', 5432),
        username: config.get<string>('POSTGRES_USER', 'postgres'),
        password: config.get<string>('POSTGRES_PASSWORD', 'postgres'),
        // Same database as orders-management, which owns the schema and runs
        // the migrations. The worker never migrates (replicas would race).
        database: config.get<string>('ORDERS_DB_NAME', 'orders_management'),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
      }),
    }),
    TypeOrmModule.forFeature([Order, ProcessedMessage]),
    MetricsModule, // exposes /metrics and HTTP request metrics
    StockModule,
    MenuModule,
  ],
  // Each controller handles one queue (see main.ts).
  controllers: [OrderPlacementController, RestockDeliveredController],
  providers: [OrderPlacementService, RestockDeliveredService],
})
// Every RabbitMQ consumer that writes to the orders database.
export class OrdersWorkerModule {}
