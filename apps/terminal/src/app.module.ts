import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrdersModule } from './orders/orders.module.js';
import { MenuModule } from './menu/menu.module.js';
import { LoggingModule } from '@app/logging';
import { MetricsModule } from '@app/metrics';
import { HealthModule } from '@app/health';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggingModule.forRoot(),
    OrdersModule,
    MenuModule,
    MetricsModule,
    HealthModule.forRoot({ rabbitmq: true }),
  ],
})
export class AppModule {}
