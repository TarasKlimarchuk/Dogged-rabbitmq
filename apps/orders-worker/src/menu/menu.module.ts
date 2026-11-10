import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuItem } from '@app/orders-db';
import { MenuService } from './menu.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([MenuItem])],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
