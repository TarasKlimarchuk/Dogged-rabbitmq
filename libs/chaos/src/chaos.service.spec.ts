import { ServiceUnavailableException } from '@nestjs/common';
import { ChaosService } from './chaos.service.js';

describe('ChaosService', () => {
  it('does nothing when disabled', async () => {
    const chaos = new ChaosService();
    await expect(chaos.maybeInject()).resolves.toBeUndefined();
  });

  it('setState() merges onto the current state and getState() reflects it', () => {
    const chaos = new ChaosService();
    const state = chaos.setState({ enabled: true, mode: 'delay', delayMs: 100 });

    expect(state).toEqual({ enabled: true, mode: 'delay', failureRate: 1, delayMs: 100 });
    expect(chaos.getState()).toEqual(state);
  });

  it('throws in error mode when failureRate is 1', async () => {
    const chaos = new ChaosService();
    chaos.setState({ enabled: true, mode: 'error', failureRate: 1 });

    await expect(chaos.maybeInject()).rejects.toThrow(ServiceUnavailableException);
  });

  it('never throws in error mode when failureRate is 0', async () => {
    const chaos = new ChaosService();
    chaos.setState({ enabled: true, mode: 'error', failureRate: 0 });

    await expect(chaos.maybeInject()).resolves.toBeUndefined();
  });

  it('delays by delayMs in delay mode instead of throwing', async () => {
    vi.useFakeTimers();
    const chaos = new ChaosService();
    chaos.setState({ enabled: true, mode: 'delay', delayMs: 1000 });

    let resolved = false;
    void chaos.maybeInject().then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);

    vi.useRealTimers();
  });
});
