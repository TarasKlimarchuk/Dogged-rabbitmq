import { Registry } from '@prometheus-io/client';
import { ResilienceMetrics } from '@app/metrics';
import type { ConfigService } from '@nestjs/config';
import type { ClientProxy } from '@nestjs/microservices';
import { ServiceUnavailableException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { ORDER_PATTERNS } from '@app/contracts/orders';
import { OrdersService } from './orders.service.js';
import type { CreateOrderDto } from '@app/contracts/orders/create-order.dto.js';

const metrics = new ResilienceMetrics(new Registry());

function createConfigService(values: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

function createClient(emit: ReturnType<typeof vi.fn>): ClientProxy {
  return { emit } as unknown as ClientProxy;
}

function createService(
  emit: ReturnType<typeof vi.fn>,
  config = createConfigService({ TERMINAL_ID: 'terminal-a' }),
) {
  return new OrdersService(config, createClient(emit), metrics);
}

const order: CreateOrderDto = {
  idempotencyKey: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d',
  items: [{ name: 'Hot Dog', quantity: 2 }],
};

describe('OrdersService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes the order tagged with this terminal's id and accepts it", async () => {
    const emit = vi.fn().mockReturnValue(of(undefined));
    const service = createService(emit);

    await expect(service.placeOrder(order)).resolves.toEqual({
      status: 'accepted',
      order,
      terminalId: 'terminal-a',
    });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(ORDER_PATTERNS.PLACE, {
      ...order,
      terminalId: 'terminal-a',
    });
  });

  it('falls back to terminal-dev when TERMINAL_ID is not set', async () => {
    const emit = vi.fn().mockReturnValue(of(undefined));
    const service = createService(emit, createConfigService());

    await expect(service.placeOrder(order)).resolves.toMatchObject({
      terminalId: 'terminal-dev',
    });
    expect(emit).toHaveBeenCalledWith(ORDER_PATTERNS.PLACE, {
      ...order,
      terminalId: 'terminal-dev',
    });
  });

  it('retries a failed publish, then throws ServiceUnavailableException', async () => {
    const emit = vi.fn().mockReturnValue(throwError(() => new Error('broker down')));
    const service = createService(emit);

    const outcome = expect(service.placeOrder(order)).rejects.toThrow(
      ServiceUnavailableException,
    );
    await vi.runAllTimersAsync();
    await outcome;

    expect(emit.mock.calls.length).toBeGreaterThan(1);
  });

  it('succeeds if a retry gets through after a transient failure', async () => {
    const emit = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('connection reset')))
      .mockReturnValue(of(undefined));
    const service = createService(emit);

    const outcome = expect(service.placeOrder(order)).resolves.toMatchObject({
      status: 'accepted',
    });
    await vi.runAllTimersAsync();
    await outcome;

    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('opens the circuit after repeated failures and stops publishing', async () => {
    const emit = vi.fn().mockReturnValue(throwError(() => new Error('broker down')));
    const service = createService(emit);

    const firstOutcome = expect(service.placeOrder(order)).rejects.toThrow(
      ServiceUnavailableException,
    );
    await vi.runAllTimersAsync();
    await firstOutcome;
    const callsAfterFirstOrder = emit.mock.calls.length;

    // no timers advanced: an open breaker must fail the request immediately
    // instead of sleeping through the retry backoff first.
    await expect(service.placeOrder(order)).rejects.toThrow(
      ServiceUnavailableException,
    );

    // the breaker should already be open from the first call's own retries,
    // so the second placeOrder() must fail fast without publishing again.
    expect(emit.mock.calls.length).toBe(callsAfterFirstOrder);
  });
});
