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
  RESTOCK_DELIVERIES_DLQ,
  RESTOCK_DELIVERIES_DLQ_OPTIONS,
  RESTOCK_DELIVERIES_QUEUE,
  RESTOCK_DELIVERIES_QUEUE_OPTIONS,
} from '@app/contracts/replenishments';
import { OrdersWorkerModule } from './orders-worker.module.js';

// main.ts runs before ConfigModule loads .env, so only real env vars apply here.
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://rabbitMQ:5672';

// Each main queue dead-letters into its DLQ, but declaring the main queue
// doesn't create the DLQ, and a dead letter with nowhere to go is silently
// dropped. That covers the queues this worker consumes (orders,
// restock deliveries) and the one it publishes to through the outbox
// (replenishments). assertQueue is idempotent, so every replica can run this.
async function declareDeadLetterQueues(url: string): Promise<void> {
  const connection = await connect(url);
  try {
    const channel = await connection.createChannel();
    await channel.assertQueue(ORDERS_DLQ, ORDERS_DLQ_OPTIONS);
    await channel.assertQueue(REPLENISHMENTS_DLQ, REPLENISHMENTS_DLQ_OPTIONS);
    await channel.assertQueue(
      RESTOCK_DELIVERIES_DLQ,
      RESTOCK_DELIVERIES_DLQ_OPTIONS,
    );
  } finally {
    await connection.close();
  }
}

async function bootstrap() {
  await declareDeadLetterQueues(RABBITMQ_URL);

  const app = await NestFactory.create(OrdersWorkerModule);
  // On SIGTERM (docker stop, deploy), run onModuleDestroy hooks so the outbox
  // relay stops polling before connections close.
  app.enableShutdownHooks();

  // One RMQ server per queue. Each server only receives its own queue's
  // messages, and routes them to the @EventPattern handler by pattern.
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
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [RABBITMQ_URL],
      queue: RESTOCK_DELIVERIES_QUEUE,
      noAck: false,
      prefetchCount: 10,
      // must match the producer's (warehouse) declaration
      queueOptions: RESTOCK_DELIVERIES_QUEUE_OPTIONS,
    },
  });
  await app.startAllMicroservices();
  // HTTP only serves /metrics
  await app.listen(3004);
}

await bootstrap();
