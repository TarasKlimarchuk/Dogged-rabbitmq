import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheck,
  HealthCheckService,
  type HealthIndicatorFunction,
  MicroserviceHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Transport, type RmqOptions } from '@nestjs/microservices';
import { HEALTH_OPTIONS, type HealthOptions } from './health.options.js';
import { ApiTags } from '@nestjs/swagger';

const DB_TIMEOUT_MS = 1_000;
// Opening an AMQP connection takes a few round trips, so allow more time.
const RABBITMQ_TIMEOUT_MS = 3_000;

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly microservice: MicroserviceHealthIndicator,
    private readonly config: ConfigService,
    @Inject(HEALTH_OPTIONS) private readonly options: HealthOptions,
  ) {}

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check(this.readinessChecks());
  }

  private readinessChecks(): HealthIndicatorFunction[] {
    const checks: HealthIndicatorFunction[] = [];

    if (this.options.database) {
      checks.push(() =>
        this.db.pingCheck('database').withTimeout(DB_TIMEOUT_MS),
      );
    }

    if (this.options.rabbitmq) {
      // todo: check existing RMQ connections, instead of opening new one
      checks.push(() =>
        this.microservice
          .pingCheck<RmqOptions>('rabbitmq', {
            transport: Transport.RMQ,
            options: {
              urls: [
                this.config.get<string>('RABBITMQ_URL', 'amqp://rabbitMQ:5672'),
              ],
            },
          })
          .withTimeout(RABBITMQ_TIMEOUT_MS),
      );
    }

    return checks;
  }
}
