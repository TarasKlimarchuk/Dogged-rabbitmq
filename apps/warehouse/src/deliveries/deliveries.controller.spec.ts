import { Test, TestingModule } from '@nestjs/testing';
import { ChaosGuard } from '@app/chaos';
import { DeliveriesController } from './deliveries.controller.js';
import { DeliveriesService } from './deliveries.service.js';

describe('DeliveriesController', () => {
  let controller: DeliveriesController;
  const deliveriesService = {
    requestRestock: vi.fn(),
    confirmDelivery: vi.fn(),
    findAll: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliveriesController],
      providers: [{ provide: DeliveriesService, useValue: deliveriesService }],
    })
      .overrideGuard(ChaosGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DeliveriesController>(DeliveriesController);
  });

  it('delegates to DeliveriesService.requestRestock()', async () => {
    const dto = { terminalId: 'terminal-a', itemName: 'Hot Dog', upToCapacity: 50 };
    const response = { deliveryId: 'delivery-1', status: 'pending' as const };
    deliveriesService.requestRestock.mockResolvedValue(response);

    await expect(controller.requestRestock(dto)).resolves.toEqual(response);
    expect(deliveriesService.requestRestock).toHaveBeenCalledWith(dto);
  });

  it('passes the status filter through to DeliveriesService.findAll()', async () => {
    deliveriesService.findAll.mockResolvedValue([]);

    await controller.findAll({ status: 'pending' });
    await controller.findAll({});

    expect(deliveriesService.findAll).toHaveBeenNthCalledWith(1, 'pending');
    expect(deliveriesService.findAll).toHaveBeenNthCalledWith(2, undefined);
  });

  it('delegates to DeliveriesService.confirmDelivery()', async () => {
    const response = { deliveryId: 'delivery-1', status: 'delivered' as const };
    deliveriesService.confirmDelivery.mockResolvedValue(response);

    await expect(controller.confirmDelivery('delivery-1')).resolves.toEqual(response);
    expect(deliveriesService.confirmDelivery).toHaveBeenCalledWith('delivery-1');
  });
});
