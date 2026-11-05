import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MetricsModule } from '@app/metrics';
import { Order } from '@app/orders-db';
import { OrderPlacementConsumerController } from './order-placement-consumer.controller.js';
import { OrderPlacementConsumerService } from './order-placement-consumer.service.js';
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
        // the migrations. The consumer never migrates (3 replicas would race).
        database: config.get<string>('ORDERS_DB_NAME', 'orders_management'),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
      }),
    }),
    TypeOrmModule.forFeature([Order]),
    MetricsModule, // provides ResilienceMetrics for StockService's restock policy
    StockModule,
    MenuModule,
  ],
  controllers: [OrderPlacementConsumerController],
  providers: [OrderPlacementConsumerService],
})
export class OrderPlacementConsumerModule {}
