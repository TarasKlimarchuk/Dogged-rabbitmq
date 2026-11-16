import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheckService,
  type HealthIndicatorFunction,
  MicroserviceHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Transport } from '@nestjs/microservices';
import { HealthController } from './health.controller.js';
import { HEALTH_OPTIONS, type HealthOptions } from './health.options.js';

// A HealthCheckAttempt stand-in: records the timeout and resolves to `result`.
function attempt(result: object) {
  return { withTimeout: vi.fn().mockReturnValue(result) };
}

async function createController(options: HealthOptions) {
  const health = {
    check: vi.fn(async (fns: HealthIndicatorFunction[]) =>
      Promise.all(fns.map((fn) => (fn as () => unknown)())),
    ),
  };
  const db = { pingCheck: vi.fn(() => attempt({ database: { status: 'up' } })) };
  const microservice = {
    pingCheck: vi.fn(() => attempt({ rabbitmq: { status: 'up' } })),
  };
  const config = { get: vi.fn((_key: string, fallback: string) => fallback) };

  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: HealthCheckService, useValue: health },
      { provide: TypeOrmHealthIndicator, useValue: db },
      { provide: MicroserviceHealthIndicator, useValue: microservice },
      { provide: ConfigService, useValue: config },
      { provide: HEALTH_OPTIONS, useValue: options },
    ],
  }).compile();

  return {
    controller: module.get(HealthController),
    health,
    db,
    microservice,
  };
}

describe('HealthController', () => {
  it('liveness checks no dependencies', async () => {
    const { controller, health, db, microservice } = await createController({
      database: true,
      rabbitmq: true,
    });

    await controller.live();

    expect(health.check).toHaveBeenCalledWith([]);
    expect(db.pingCheck).not.toHaveBeenCalled();
    expect(microservice.pingCheck).not.toHaveBeenCalled();
  });

  it('readiness pings the database and RabbitMQ when both are enabled', async () => {
    const { controller, db, microservice } = await createController({
      database: true,
      rabbitmq: true,
    });

    const result = await controller.ready();

    expect(result).toEqual([
      { database: { status: 'up' } },
      { rabbitmq: { status: 'up' } },
    ]);
    expect(db.pingCheck).toHaveBeenCalledWith('database');
    expect(microservice.pingCheck).toHaveBeenCalledWith('rabbitmq', {
      transport: Transport.RMQ,
      options: { urls: ['amqp://rabbitMQ:5672'] },
    });
  });

  it('readiness skips checks that are not enabled', async () => {
    const { controller, health, db, microservice } = await createController({
      rabbitmq: true,
    });

    await controller.ready();

    expect(health.check.mock.calls[0][0]).toHaveLength(1);
    expect(db.pingCheck).not.toHaveBeenCalled();
    expect(microservice.pingCheck).toHaveBeenCalledOnce();
  });
});
