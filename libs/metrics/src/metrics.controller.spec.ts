import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

describe('MetricsController', () => {
  let controller: MetricsController;
  const metricsService = {
    getMetrics: vi.fn().mockResolvedValue({
      metrics: '# HELP up test\n',
      contentType: 'text/plain; version=0.0.4; charset=utf-8',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [{ provide: MetricsService, useValue: metricsService }],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
  });

  it('sets the registry content type and returns the metrics text', async () => {
    const res = { setHeader: vi.fn() } as unknown as Response;

    const body = await controller.getMetrics(res);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain; version=0.0.4; charset=utf-8',
    );
    expect(body).toBe('# HELP up test\n');
  });
});
