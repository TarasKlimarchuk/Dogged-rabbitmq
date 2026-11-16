import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggingModule } from '@app/logging';
import { MetricsModule } from '@app/metrics';
import { HealthModule } from '@app/health';
import { Delivery } from '@app/warehouse-db';
import { RestockRequestConsumerController } from './restock-request-consumer.controller.js';
import { RestockRequestConsumerService } from './restock-request-consumer.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggingModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('POSTGRES_HOST', 'localhost'),
        port: config.get<number>('POSTGRES_PORT', 5432),
        username: config.get<string>('POSTGRES_USER', 'postgres'),
        password: config.get<string>('POSTGRES_PASSWORD', 'postgres'),
        // Same database as warehouse, which owns the schema and runs the
        // migrations. The consumer never migrates (replicas would race).
        database: config.get<string>('WAREHOUSE_DB_NAME', 'warehouse'),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
      }),
    }),
    TypeOrmModule.forFeature([Delivery]),
    MetricsModule, // exposes /metrics
    HealthModule.forRoot({ database: true, rabbitmq: true }), // /health/live, /health/ready
  ],
  controllers: [RestockRequestConsumerController],
  providers: [RestockRequestConsumerService],
})
export class RestockRequestConsumerModule {}
