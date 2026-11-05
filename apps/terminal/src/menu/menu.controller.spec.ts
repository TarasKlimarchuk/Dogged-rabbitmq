import { Test, TestingModule } from '@nestjs/testing';
import { MenuController } from './menu.controller.js';
import { MenuService } from './menu.service.js';

describe('MenuController', () => {
  let controller: MenuController;
  const menuService = { getMenu: vi.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MenuController],
      providers: [{ provide: MenuService, useValue: menuService }],
    }).compile();

    controller = module.get<MenuController>(MenuController);
  });

  it('delegates to MenuService.getMenu()', async () => {
    const response = { items: [{ name: 'Hot Dog', price: 1.99 }], source: 'live' as const };
    menuService.getMenu.mockResolvedValue(response);

    await expect(controller.getMenu()).resolves.toEqual(response);
  });
});
