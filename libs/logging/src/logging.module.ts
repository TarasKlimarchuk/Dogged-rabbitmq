import { DynamicModule } from '@nestjs/common';
import { LoggerModule, Params } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';

export function loggerParams(): Params {
  const pretty = process.env.NODE_ENV !== 'production';

  return {
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? 'info',
      formatters: { level: (label) => ({ level: label }) },
      timestamp: stdTimeFunctions.isoTime,
      transport: pretty
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
      // Scrapes and health probes hit every few seconds; logging them is noise.
      autoLogging: {
        ignore: (req) =>
          req.url === '/metrics' || (req.url ?? '').startsWith('/health/'),
      },
      quietReqLogger: true,
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    microservice: { autoLogging: false },
  };
}

// Import once, in each app's root module. LoggerModule is global, so feature
// modules must not import it again (that would log every request twice).
export class LoggingModule {
  static forRoot(): DynamicModule {
    return LoggerModule.forRoot(loggerParams());
  }
}
