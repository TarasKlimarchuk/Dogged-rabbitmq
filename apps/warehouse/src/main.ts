import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { connect } from 'amqplib';
import {
  RESTOCK_DELIVERIES_DLQ,
  RESTOCK_DELIVERIES_DLQ_OPTIONS,
} from '@app/contracts/replenishments';
import { AppModule } from './app.module.js';

// main.ts runs before ConfigModule loads .env, so only real env vars apply here.
const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://rabbitMQ:5672';

async function declareDeadLetterQueue(url: string): Promise<void> {
  const connection = await connect(url);
  try {
    const channel = await connection.createChannel();
    await channel.assertQueue(
      RESTOCK_DELIVERIES_DLQ,
      RESTOCK_DELIVERIES_DLQ_OPTIONS,
    );
  } finally {
    await connection.close();
  }
}

async function bootstrap() {
  await declareDeadLetterQueue(RABBITMQ_URL);

  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('Dogged · Warehouse API')
    .setDescription(
      'Lists and confirms deliveries for the hot dog vendor system. Restock ' +
        'requests arrive over RabbitMQ (restock-request-consumer), and ' +
        'confirmed deliveries are published back over RabbitMQ (orders-worker).',
    )
    .setVersion('0.1')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3002);
}
await bootstrap();
