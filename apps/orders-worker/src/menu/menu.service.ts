import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MenuItem } from '@app/orders-db';

// Read-only view of the menu. Menu CRUD stays in orders-management.
@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(MenuItem)
    private readonly menu: Repository<MenuItem>,
  ) {}

  async findMissingNames(names: string[]): Promise<string[]> {
    const unique = [...new Set(names)];
    if (unique.length === 0) {
      return [];
    }

    const found = await this.menu.find({ where: { name: In(unique) } });
    const foundNames = new Set(found.map((item) => item.name));
    return unique.filter((name) => !foundNames.has(name));
  }
}
