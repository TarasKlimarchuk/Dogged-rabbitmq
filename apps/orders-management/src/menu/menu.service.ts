import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuItem } from '@app/orders-db';
import { CreateMenuItemDto } from './create-menu-item.dto.js';

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(MenuItem)
    private readonly menu: Repository<MenuItem>,
  ) {}

  create(dto: CreateMenuItemDto): Promise<MenuItem> {
    return this.menu.save(this.menu.create(dto));
  }

  findAll(): Promise<MenuItem[]> {
    return this.menu.find();
  }

  async findOne(id: string): Promise<MenuItem> {
    const item = await this.menu.findOneBy({ id });
    if (!item) {
      throw new NotFoundException(`menu item ${id} not found`);
    }
    return item;
  }

  async remove(id: string): Promise<void> {
    const result = await this.menu.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`menu item ${id} not found`);
    }
  }
}
