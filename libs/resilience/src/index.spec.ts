import { BrokenCircuitError } from 'cockatiel';
import { AxiosError } from 'axios';
import {
  classifyFailure,
  createRetryTimeoutBreakerPolicy,
  createRetryTimeoutPolicy,
} from './index.js';
import type { BreakerState } from './index.js';

const fail = () => Promise.reject(new Error('down'));

describe('resilience hooks', () => {
  it('reports each retry and the final give-up', async () => {
    const onRetry = vi.fn();
    const onGiveUp = vi.fn();
    const policy = createRetryTimeoutPolicy({
      maxAttempts: 2,
      initialDelayMs: 1,
      onRetry,
      onGiveUp,
    });

    await expect(policy.execute(fail)).rejects.toThrow('down');

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it('reports the initial closed state, then open once the breaker trips', async () => {
    const states: BreakerState[] = [];
    const policy = createRetryTimeoutBreakerPolicy({
      maxAttempts: 1,
      initialDelayMs: 1,
      consecutiveFailuresToOpen: 2,
      onBreakerStateChange: (state) => states.push(state),
    });

    expect(states).toEqual(['closed']);

    await expect(policy.execute(fail)).rejects.toThrow();
    await expect(policy.execute(fail)).rejects.toThrow();

    expect(states).toContain('open');
  });

  it('reports half-open and closed again after the breaker recovers', async () => {
    const states: BreakerState[] = [];
    const policy = createRetryTimeoutBreakerPolicy({
      maxAttempts: 0,
      consecutiveFailuresToOpen: 1,
      halfOpenAfterMs: 10,
      onBreakerStateChange: (state) => states.push(state),
    });

    await expect(policy.execute(fail)).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await policy.execute(() => Promise.resolve('ok'));

    expect(states).toEqual(['closed', 'open', 'half-open', 'closed']);
  });

  it('reports calls rejected by an open breaker, without retrying them', async () => {
    const onRetry = vi.fn();
    const onReject = vi.fn();
    const policy = createRetryTimeoutBreakerPolicy({
      maxAttempts: 0,
      consecutiveFailuresToOpen: 1,
      onRetry,
      onReject,
    });

    await expect(policy.execute(fail)).rejects.toThrow('down');
    expect(onReject).not.toHaveBeenCalled();

    await expect(policy.execute(fail)).rejects.toBeInstanceOf(BrokenCircuitError);
    await expect(policy.execute(fail)).rejects.toBeInstanceOf(BrokenCircuitError);

    expect(onReject).toHaveBeenCalledTimes(2);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('works without any hooks', async () => {
    const policy = createRetryTimeoutBreakerPolicy({ maxAttempts: 0 });

    await expect(policy.execute(() => Promise.resolve(1))).resolves.toBe(1);
  });

  it('classifies failures as timeout, network, app or client', async () => {
    const networkError = new AxiosError('connect ECONNREFUSED', 'ECONNREFUSED');
    const appError = new AxiosError('500', 'ERR_BAD_RESPONSE', undefined, undefined, {
      status: 500,
    } as never);
    const clientError = new AxiosError('404', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 404,
    } as never);
    const kinds: string[] = [];
    const policy = createRetryTimeoutPolicy({
      maxAttempts: 0,
      timeoutMs: 5,
      onFailure: (kind) => kinds.push(kind),
    });

    await expect(policy.execute(() => Promise.reject(networkError))).rejects.toThrow();
    await expect(policy.execute(() => Promise.reject(appError))).rejects.toThrow();
    await expect(policy.execute(() => Promise.reject(clientError))).rejects.toThrow();
    await expect(
      policy.execute(() => new Promise((resolve) => setTimeout(resolve, 50))),
    ).rejects.toThrow();

    expect(kinds).toEqual(['network', 'app', 'client', 'timeout']);
    expect(classifyFailure(new Error('boom'))).toBe('app');
  });

  it('reports unhandled failures too, but not breaker rejections', async () => {
    const onFailure = vi.fn();
    const policy = createRetryTimeoutBreakerPolicy({
      maxAttempts: 0,
      consecutiveFailuresToOpen: 1,
      isRetryable: (error) => (error as Error).message !== 'client',
      onFailure,
    });

    await expect(policy.execute(() => Promise.reject(new Error('client')))).rejects.toThrow();
    expect(onFailure).toHaveBeenCalledTimes(1);

    await expect(policy.execute(fail)).rejects.toThrow('down');
    await expect(policy.execute(fail)).rejects.toBeInstanceOf(BrokenCircuitError);
    expect(onFailure).toHaveBeenCalledTimes(2);
  });
});
