import { ServiceUnavailableException } from '@nestjs/common';
import { ChaosGuard } from './chaos.guard.js';
import { ChaosService } from './chaos.service.js';

describe('ChaosGuard', () => {
  it('allows the request through when chaos is disabled', async () => {
    const guard = new ChaosGuard(new ChaosService());

    await expect(guard.canActivate()).resolves.toBe(true);
  });

  it('propagates the simulated failure when chaos is enabled', async () => {
    const chaos = new ChaosService();
    chaos.setState({ enabled: true, mode: 'error', failureRate: 1 });
    const guard = new ChaosGuard(chaos);

    await expect(guard.canActivate()).rejects.toThrow(ServiceUnavailableException);
  });
});
