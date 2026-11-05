import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MetricsService } from './metrics.service.js';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async getMetrics(@Res({ passthrough: true }) res: Response) {
    const { metrics, contentType } = await this.metricsService.getMetrics();
    res.setHeader('Content-Type', contentType);
    return metrics;
  }
}
