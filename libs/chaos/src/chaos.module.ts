import { Global, Module } from '@nestjs/common';
import { ChaosService } from './chaos.service.js';
import { ChaosGuard } from './chaos.guard.js';
import { ChaosController } from './chaos.controller.js';

// Global so feature modules (Orders, Menu, Stock, Deliveries, ...) can use
// @UseGuards(ChaosGuard) without each one importing ChaosModule themselves.
@Global()
@Module({
  controllers: [ChaosController],
  providers: [ChaosService, ChaosGuard],
  exports: [ChaosService, ChaosGuard],
})
export class ChaosModule {}
