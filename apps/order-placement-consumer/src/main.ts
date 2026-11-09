import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { connect } from 'amqplib';
import {
  ORDERS_DLQ,
  ORDERS_DLQ_OPTIONS,
  ORDERS_QUEUE,
  ORDERS_QUEUE_OPTIONS,
} from '@app/contracts/orders';
import {
  REPLENISHMENTS_DLQ,
  REPLENISHMENTS_DLQ_OPTIONS,
} from '@app/contracts/replenishments';
import { OrderPlacementConsumerModule } from './order-placement-consumer.module.js';

// main.ts runs before ConfigModule loads .env, so only real env vars apply here.
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://rabbitMQ:5672';

// orders_queue dead-letters into ORDERS_DLQ, but only declaring orders_queue
// doesn't create the DLQ, and a dead letter with nowhere to go is silently
// dropped. The same goes for replenishments_queue, which this service
// publishes to (via the outbox). assertQueue is idempotent, so every replica
// can run this.
async function declareDeadLetterQueues(url: string): Promise<void> {
  const connection = await connect(url);
  try {
    const channel = await connection.createChannel();
    await channel.assertQueue(ORDERS_DLQ, ORDERS_DLQ_OPTIONS);
    await channel.assertQueue(REPLENISHMENTS_DLQ, REPLENISHMENTS_DLQ_OPTIONS);
  } finally {
    await connection.close();
  }
}

async function bootstrap() {
  await declareDeadLetterQueues(RABBITMQ_URL);

  const app = await NestFactory.create(OrderPlacementConsumerModule);
  // On SIGTERM (docker stop, deploy), run onModuleDestroy hooks so the outbox
  // relay stops polling before connections close.
  app.enableShutdownHooks();

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [RABBITMQ_URL],
      queue: ORDERS_QUEUE,
      noAck: false,
      prefetchCount: 10,
      queueOptions: ORDERS_QUEUE_OPTIONS,
    },
  });
  await app.startAllMicroservices();
  await app.listen(3004);
}

await bootstrap();
