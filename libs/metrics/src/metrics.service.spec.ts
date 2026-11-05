import { Test, TestingModule } from '@nestjs/testing';
import { Registry } from '@prometheus-io/client';
import { MetricsService } from './metrics.service.js';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: Registry, useValue: new Registry() },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  it('exposes default process metrics in the Prometheus text format', async () => {
    const { metrics, contentType } = await service.getMetrics();

    expect(metrics).toContain('process_cpu_seconds_total');
    expect(contentType).toMatch(/^text\/plain/);
  });
});
