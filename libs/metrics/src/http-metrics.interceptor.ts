import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Histogram, Registry } from '@prometheus-io/client';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MetricsController } from './metrics.controller.js';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  private readonly duration: Histogram<'method' | 'route' | 'status'>;

  constructor(registry: Registry) {
    this.duration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status'],
      registers: [registry],
    });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Only HTTP requests are measured, and scraping /metrics must not measure itself.
    if (
      context.getType() !== 'http' ||
      context.getClass() === MetricsController
    ) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const stopTimer = this.duration.startTimer();

    // The route pattern ("/orders/:id"), not the raw URL: a label per concrete
    // id would create a new time series for every id (cardinality explosion).
    const labels = (status: number) => ({
      method: req.method,
      route: req.route?.path ?? 'unknown',
      status,
    });

    return next.handle().pipe(
      tap({
        next: () => stopTimer(labels(res.statusCode)),
        // On errors Nest has not written the status yet, so read it off the exception.
        error: (error: unknown) =>
          stopTimer(
            labels(error instanceof HttpException ? error.getStatus() : 500),
          ),
      }),
    );
  }
}
