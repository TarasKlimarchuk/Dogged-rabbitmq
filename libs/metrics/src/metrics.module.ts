import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsService } from './metrics.service.js';
import { Registry } from '@prometheus-io/client';
import { MetricsController } from './metrics.controller.js';
import { HttpMetricsInterceptor } from './http-metrics.interceptor.js';
import { ResilienceMetrics } from './resilience-metrics.js';
import { RabbitmqMetricsInterceptor } from './rabbitmq-metrics.interceptor.js';
import { RabbitmqMetrics } from './rabbitmq-metrics.js';
import { OutboxMetrics } from './outbox-metrics.js';

// Global so feature modules can inject ResilienceMetrics and RabbitmqMetrics
// without each one
// importing MetricsModule.
@Global()
@Module({
  providers: [
    MetricsService,
    ResilienceMetrics,
    RabbitmqMetrics,
    OutboxMetrics,
    { provide: Registry, useValue: new Registry() },
    // APP_INTERCEPTOR applies the interceptor to every route of the host app.
    // RMQ handlers only get it when connectMicroservice uses inheritAppConfig.
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RabbitmqMetricsInterceptor },
  ],
  exports: [MetricsService, ResilienceMetrics, RabbitmqMetrics, OutboxMetrics],
  controllers: [MetricsController],
})
export class MetricsModule {}
