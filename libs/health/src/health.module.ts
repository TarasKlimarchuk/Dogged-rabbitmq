import { DynamicModule, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';
import { HEALTH_OPTIONS, type HealthOptions } from './health.options.js';

// Adds GET /health/live and GET /health/ready to the app. Import once, in the
// app's root module. Needs the global ConfigModule (for RABBITMQ_URL) and, when
// `database` is on, TypeOrmModule.forRoot in the same app.
@Module({})
export class HealthModule {
  static forRoot(options: HealthOptions = {}): DynamicModule {
    return {
      module: HealthModule,
      imports: [TerminusModule.forRoot()],
      controllers: [HealthController],
      providers: [{ provide: HEALTH_OPTIONS, useValue: options }],
    };
  }
}
