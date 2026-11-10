import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChaosModule } from '@app/chaos';
import { MetricsModule } from '@app/metrics';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { MenuModule } from './menu/menu.module.js';
import { InitialSchema1791462826391 } from './migrations/1791462826391-InitialSchema.js';
import { SeedMenu1791462827391 } from './migrations/1791462827391-SeedMenu.js';
import { SeedTerminalStock1791462828391 } from './migrations/1791462828391-SeedTerminalStock.js';
import { AddRestockPendingColumn1791462829391 } from './migrations/1791462829391-AddRestockPendingColumn.js';
import { AddOutbox1791462830391 } from './migrations/1791462830391-AddOutbox.js';
import { AddProcessedMessages1791462831391 } from './migrations/1791462831391-AddProcessedMessages.js';

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
        database: config.get<string>('ORDERS_DB_NAME', 'orders_management'),
        autoLoadEntities: true,
        synchronize: false,
        migrations: [
          InitialSchema1791462826391,
          SeedMenu1791462827391,
          SeedTerminalStock1791462828391,
          AddRestockPendingColumn1791462829391,
          AddOutbox1791462830391,
          AddProcessedMessages1791462831391,
        ],
        migrationsRun: true,
      }),
    }),
    ChaosModule,
    MetricsModule,
    MenuModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
