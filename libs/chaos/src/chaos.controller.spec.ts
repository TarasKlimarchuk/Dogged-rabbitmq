import { Test, TestingModule } from '@nestjs/testing';
import { ChaosController } from './chaos.controller.js';
import { ChaosService } from './chaos.service.js';

describe('ChaosController', () => {
  let controller: ChaosController;
  const chaosService = { getState: vi.fn(), setState: vi.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChaosController],
      providers: [{ provide: ChaosService, useValue: chaosService }],
    }).compile();

    controller = module.get<ChaosController>(ChaosController);
  });

  it('delegates to ChaosService.getState()', () => {
    const state = { enabled: false, mode: 'error' as const, failureRate: 1, delayMs: 0 };
    chaosService.getState.mockReturnValue(state);

    expect(controller.getState()).toEqual(state);
  });

  it('delegates to ChaosService.setState()', () => {
    const dto = { enabled: true, mode: 'delay' as const, delayMs: 2000 };
    const state = { ...dto, failureRate: 1 };
    chaosService.setState.mockReturnValue(state);

    expect(controller.setState(dto)).toEqual(state);
    expect(chaosService.setState).toHaveBeenCalledWith(dto);
  });
});
