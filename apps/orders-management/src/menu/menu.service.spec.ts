import type { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { MenuService } from './menu.service.js';
import type { MenuItem } from '@app/orders-db';

function createRepo(overrides: Partial<Repository<MenuItem>> = {}): Repository<MenuItem> {
  return {
    create: vi.fn((data: Partial<MenuItem>) => data),
    save: vi.fn(),
    find: vi.fn(),
    findOneBy: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as Repository<MenuItem>;
}

describe('MenuService', () => {
  it('creates a menu item', async () => {
    const save = vi.fn().mockResolvedValue({ id: '1', name: 'Hot Dog', price: 1.99 });
    const service = new MenuService(createRepo({ save }));

    await expect(service.create({ name: 'Hot Dog', price: 1.99 })).resolves.toEqual({
      id: '1',
      name: 'Hot Dog',
      price: 1.99,
    });
  });

  it('lists all menu items', async () => {
    const items = [{ id: '1', name: 'Hot Dog', price: 1.99 }];
    const find = vi.fn().mockResolvedValue(items);
    const service = new MenuService(createRepo({ find }));

    await expect(service.findAll()).resolves.toEqual(items);
  });

  it('returns a single menu item by id', async () => {
    const item = { id: '1', name: 'Hot Dog', price: 1.99 };
    const findOneBy = vi.fn().mockResolvedValue(item);
    const service = new MenuService(createRepo({ findOneBy }));

    await expect(service.findOne('1')).resolves.toEqual(item);
  });

  it('throws NotFoundException when fetching a missing item', async () => {
    const findOneBy = vi.fn().mockResolvedValue(null);
    const service = new MenuService(createRepo({ findOneBy }));

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('deletes an existing item', async () => {
    const del = vi.fn().mockResolvedValue({ affected: 1 });
    const service = new MenuService(createRepo({ delete: del }));

    await expect(service.remove('1')).resolves.toBeUndefined();
  });

  it('throws NotFoundException when deleting a missing item', async () => {
    const del = vi.fn().mockResolvedValue({ affected: 0 });
    const service = new MenuService(createRepo({ delete: del }));

    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
  });
});
