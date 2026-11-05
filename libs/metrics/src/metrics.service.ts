import { Injectable } from '@nestjs/common';
import { Registry, collectDefaultMetrics } from '@prometheus-io/client';

@Injectable()
export class MetricsService {
  constructor(private readonly registry: Registry) {
    collectDefaultMetrics({ register: this.registry });
  }

  public async getMetrics() {
    return {
      metrics: await this.registry.metrics(),
      contentType: this.registry.contentType,
    };
  }
}
