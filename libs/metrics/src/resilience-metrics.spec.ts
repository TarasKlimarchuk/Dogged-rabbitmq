import { Registry } from '@prometheus-io/client';
import { ResilienceMetrics } from './resilience-metrics.js';

describe('ResilienceMetrics', () => {
  let registry: Registry;
  let metrics: ResilienceMetrics;

  beforeEach(() => {
    registry = new Registry();
    metrics = new ResilienceMetrics(registry);
  });

  it('counts retries and give-ups per policy', async () => {
    const orders = metrics.retryHooks('orders');
    const menu = metrics.retryHooks('menu');

    orders.onRetry?.();
    orders.onRetry?.();
    menu.onRetry?.();
    orders.onGiveUp?.();

    const text = await registry.metrics();
    expect(text).toContain('resilience_retries_total{policy="orders"} 2');
    expect(text).toContain('resilience_retries_total{policy="menu"} 1');
    expect(text).toContain('resilience_give_ups_total{policy="orders"} 1');
  });

  it('maps breaker states to numbers on the gauge', async () => {
    const hooks = metrics.breakerHooks('orders');

    hooks.onBreakerStateChange?.('closed');
    expect(await registry.metrics()).toContain(
      'circuit_breaker_state{policy="orders"} 0',
    );

    hooks.onBreakerStateChange?.('open');
    expect(await registry.metrics()).toContain(
      'circuit_breaker_state{policy="orders"} 2',
    );

    hooks.onBreakerStateChange?.('half-open');
    expect(await registry.metrics()).toContain(
      'circuit_breaker_state{policy="orders"} 1',
    );
  });

  it('breaker hooks also include the retry hooks', async () => {
    metrics.breakerHooks('orders').onRetry?.();

    expect(await registry.metrics()).toContain(
      'resilience_retries_total{policy="orders"} 1',
    );
  });

  it('counts failures per policy and kind', async () => {
    const hooks = metrics.breakerHooks('orders');

    hooks.onFailure?.('timeout');
    hooks.onFailure?.('timeout');
    hooks.onFailure?.('network');

    const text = await registry.metrics();
    expect(text).toContain('resilience_failures_total{policy="orders",kind="timeout"} 2');
    expect(text).toContain('resilience_failures_total{policy="orders",kind="network"} 1');
  });
});
