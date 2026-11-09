import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { connect } from 'amqplib';
import {
  REPLENISHMENTS_DLQ,
  REPLENISHMENTS_DLQ_OPTIONS,
  REPLENISHMENTS_QUEUE,
  REPLENISHMENTS_QUEUE_OPTIONS,
} from '@app/contracts/replenishments';
import { RestockRequestConsumerModule } from './restock-request-consumer.module.js';

// main.ts runs before ConfigModule loads .env, so only real env vars apply here.
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://rabbitMQ:5672';

// replenishments_queue dead-letters into REPLENISHMENTS_DLQ, but declaring
// the main queue doesn't create the DLQ, and a dead letter with nowhere to go
// is silently dropped. order-placement-consumer declares it too; whichever
// service starts first wins, and assertQueue is idempotent.
async function declareDeadLetterQueue(url: string): Promise<void> {
  const connection = await connect(url);
  try {
    const channel = await connection.createChannel();
    await channel.assertQueue(REPLENISHMENTS_DLQ, REPLENISHMENTS_DLQ_OPTIONS);
  } finally {
    await connection.close();
  }
}

async function bootstrap() {
  await declareDeadLetterQueue(RABBITMQ_URL);

  const app = await NestFactory.create(RestockRequestConsumerModule);
  app.enableShutdownHooks();

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [RABBITMQ_URL],
      queue: REPLENISHMENTS_QUEUE,
      noAck: false,
      prefetchCount: 10,
      // must match the producer's (order-placement-consumer) declaration
      queueOptions: REPLENISHMENTS_QUEUE_OPTIONS,
    },
  });
  await app.startAllMicroservices();
  // HTTP only serves /metrics
  await app.listen(3005);
}

await bootstrap();
