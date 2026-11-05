import { Test, TestingModule } from '@nestjs/testing';
import { ChaosGuard } from '@app/chaos';
import { MenuController } from './menu.controller.js';
import { MenuService } from './menu.service.js';

describe('MenuController', () => {
  let controller: MenuController;
  const menuService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MenuController],
      providers: [{ provide: MenuService, useValue: menuService }],
    })
      .overrideGuard(ChaosGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MenuController>(MenuController);
  });

  it('delegates creation to MenuService.create()', async () => {
    const dto = { name: 'Hot Dog', price: 1.99 };
    const created = { id: '1', ...dto };
    menuService.create.mockResolvedValue(created);

    await expect(controller.create(dto)).resolves.toEqual(created);
    expect(menuService.create).toHaveBeenCalledWith(dto);
  });

  it('wraps MenuService.findAll() in an items envelope', async () => {
    const items = [{ id: '1', name: 'Hot Dog', price: 1.99 }];
    menuService.findAll.mockResolvedValue(items);

    await expect(controller.findAll()).resolves.toEqual({ items });
  });

  it('delegates single lookups to MenuService.findOne()', async () => {
    const item = { id: '1', name: 'Hot Dog', price: 1.99 };
    menuService.findOne.mockResolvedValue(item);

    await expect(controller.findOne('1')).resolves.toEqual(item);
    expect(menuService.findOne).toHaveBeenCalledWith('1');
  });

  it('delegates deletion to MenuService.remove()', async () => {
    menuService.remove.mockResolvedValue(undefined);

    await controller.remove('1');
    expect(menuService.remove).toHaveBeenCalledWith('1');
  });
});
