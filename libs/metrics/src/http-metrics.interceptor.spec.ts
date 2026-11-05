import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { Registry } from '@prometheus-io/client';
import { lastValueFrom, of, throwError } from 'rxjs';
import { HttpMetricsInterceptor } from './http-metrics.interceptor.js';
import { MetricsController } from './metrics.controller.js';

class SomeController {}

function httpContext(
  controller: unknown,
  req: object,
  res: object,
): ExecutionContext {
  return {
    getType: () => 'http',
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

describe('HttpMetricsInterceptor', () => {
  let registry: Registry;
  let interceptor: HttpMetricsInterceptor;
  const req = { method: 'GET', route: { path: '/orders/:id' } };

  beforeEach(() => {
    registry = new Registry();
    interceptor = new HttpMetricsInterceptor(registry);
  });

  it('records duration labelled with method, route pattern and status', async () => {
    const ctx = httpContext(SomeController, req, { statusCode: 200 });

    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of('ok') }));

    const text = await registry.metrics();
    expect(text).toContain(
      'http_request_duration_seconds_count{method="GET",route="/orders/:id",status="200"} 1',
    );
  });

  it('takes the status from an HttpException when the handler fails', async () => {
    const ctx = httpContext(SomeController, req, { statusCode: 200 });

    await expect(
      lastValueFrom(
        interceptor.intercept(ctx, {
          handle: () => throwError(() => new NotFoundException()),
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(await registry.metrics()).toContain('status="404"');
  });

  it('records 500 for non-HTTP errors', async () => {
    const ctx = httpContext(SomeController, req, { statusCode: 200 });

    await expect(
      lastValueFrom(
        interceptor.intercept(ctx, {
          handle: () => throwError(() => new Error('boom')),
        }),
      ),
    ).rejects.toThrow('boom');

    expect(await registry.metrics()).toContain('status="500"');
  });

  it('does not measure requests to the metrics endpoint itself', async () => {
    const ctx = httpContext(MetricsController, req, { statusCode: 200 });

    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of('ok') }));

    expect(await registry.metrics()).not.toContain(
      'http_request_duration_seconds_count',
    );
  });
});
