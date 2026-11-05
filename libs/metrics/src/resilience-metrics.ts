import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Registry } from '@prometheus-io/client';
import type {
  BreakerHooks,
  BreakerState,
  RetryHooks,
} from '@app/resilience';

const STATE_VALUES: Record<BreakerState, number> = {
  closed: 0,
  'half-open': 1,
  open: 2,
  isolated: 3,
};

/**
 * Turns the hooks of `@app/resilience` policies into Prometheus metrics, one
 * label value per policy so several policies in a service stay distinguishable.
 */
@Injectable()
export class ResilienceMetrics {
  private readonly retries: Counter<'policy'>;
  private readonly giveUps: Counter<'policy'>;
  private readonly breakerState: Gauge<'policy'>;
  private readonly rejections: Counter<'policy'>;
  private readonly failures: Counter<'policy' | 'kind'>;

  constructor(registry: Registry) {
    this.retries = new Counter({
      name: 'resilience_retries_total',
      help: 'Retry attempts made after a failed call',
      labelNames: ['policy'],
      registers: [registry],
    });
    this.giveUps = new Counter({
      name: 'resilience_give_ups_total',
      help: 'Calls that failed after all retries were used up',
      labelNames: ['policy'],
      registers: [registry],
    });
    this.breakerState = new Gauge({
      name: 'circuit_breaker_state',
      help: 'Circuit breaker state: 0 closed, 1 half-open, 2 open, 3 isolated',
      labelNames: ['policy'],
      registers: [registry],
    });
    this.rejections = new Counter({
      name: 'circuit_breaker_rejections_total',
      help: 'Calls rejected without reaching the dependency because the breaker was open',
      labelNames: ['policy'],
      registers: [registry],
    });
    this.failures = new Counter({
      name: 'resilience_failures_total',
      help: 'Failed attempts against the dependency, by cause (timeout, network, app or client)',
      labelNames: ['policy', 'kind'],
      registers: [registry],
    });
  }

  retryHooks(policy: string): RetryHooks {
    return {
      onRetry: () => this.retries.inc({ policy }),
      onGiveUp: () => this.giveUps.inc({ policy }),
      onFailure: (kind) => this.failures.inc({ policy, kind }),
    };
  }

  breakerHooks(policy: string): BreakerHooks {
    return {
      ...this.retryHooks(policy),
      onBreakerStateChange: (state) =>
        this.breakerState.set({ policy }, STATE_VALUES[state]),
      onReject: () => this.rejections.inc({ policy }),
    };
  }
}
