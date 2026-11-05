import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MenuController } from './menu.controller.js';
import { MenuService } from './menu.service.js';
import { MenuCacheService } from './menu-cache.service.js';

@Module({
  imports: [HttpModule],
  controllers: [MenuController],
  providers: [MenuService, MenuCacheService],
})
export class MenuModule {}
