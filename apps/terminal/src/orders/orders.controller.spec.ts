import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

describe('OrdersController', () => {
  let controller: OrdersController;
  const ordersService = { placeOrder: vi.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [{ provide: OrdersService, useValue: ordersService }],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  it('delegates to OrdersService.placeOrder()', async () => {
    const order = {
      idempotencyKey: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d',
      items: [{ name: 'Hot Dog', quantity: 2 }],
    };
    const response = { orderId: 'order-1', status: 'accepted' as const, inventoryWarning: null };
    ordersService.placeOrder.mockResolvedValue(response);

    await expect(controller.placeOrder(order)).resolves.toEqual(response);
    expect(ordersService.placeOrder).toHaveBeenCalledWith(order);
  });
});
