import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { OrdersModule } from './orders/orders.module.js';
import { MenuModule } from './menu/menu.module.js';
import { LoggingModule } from '@app/logging';
import { MetricsModule } from '@app/metrics';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggingModule.forRoot(),
    OrdersModule,
    MenuModule,
    MetricsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
