import { CanActivate, Injectable } from '@nestjs/common';
import { ChaosService } from './chaos.service.js';

@Injectable()
export class ChaosGuard implements CanActivate {
  constructor(private readonly chaos: ChaosService) {}

  async canActivate(): Promise<boolean> {
    await this.chaos.maybeInject();
    return true;
  }
}
