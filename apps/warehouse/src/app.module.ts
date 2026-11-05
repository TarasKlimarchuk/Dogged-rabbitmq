import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChaosModule } from '@app/chaos';
import { MetricsModule } from '@app/metrics';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DeliveriesModule } from './deliveries/deliveries.module.js';
import { InitialSchema1791462830391 } from './migrations/1791462830391-InitialSchema.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('POSTGRES_HOST', 'localhost'),
        port: config.get<number>('POSTGRES_PORT', 5432),
        username: config.get<string>('POSTGRES_USER', 'postgres'),
        password: config.get<string>('POSTGRES_PASSWORD', 'postgres'),
        database: config.get<string>('WAREHOUSE_DB_NAME', 'warehouse'),
        autoLoadEntities: true,
        synchronize: false,
        migrations: [InitialSchema1791462830391],
        migrationsRun: true,
      }),
    }),
    ChaosModule,
    MetricsModule,
    DeliveriesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
