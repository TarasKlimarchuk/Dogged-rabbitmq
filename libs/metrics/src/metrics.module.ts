import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsService } from './metrics.service.js';
import { Registry } from '@prometheus-io/client';
import { MetricsController } from './metrics.controller.js';
import { HttpMetricsInterceptor } from './http-metrics.interceptor.js';
import { ResilienceMetrics } from './resilience-metrics.js';

// Global so feature modules can inject ResilienceMetrics without each one
// importing MetricsModule, the same way ChaosModule is shared.
@Global()
@Module({
  providers: [
    MetricsService,
    ResilienceMetrics,
    { provide: Registry, useValue: new Registry() },
    // APP_INTERCEPTOR applies the interceptor to every route of the host app.
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
  exports: [MetricsService, ResilienceMetrics],
  controllers: [MetricsController],
})
export class MetricsModule {}
