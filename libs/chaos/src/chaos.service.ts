import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type ChaosMode = 'error' | 'delay';

export interface ChaosState {
  enabled: boolean;
  mode: ChaosMode;
  failureRate: number;
  delayMs: number;
}

const DEFAULT_STATE: ChaosState = {
  enabled: false,
  mode: 'error',
  failureRate: 1,
  delayMs: 0,
};

@Injectable()
export class ChaosService {
  private state: ChaosState = { ...DEFAULT_STATE };

  getState(): ChaosState {
    return this.state;
  }

  setState(update: Partial<ChaosState>): ChaosState {
    this.state = { ...this.state, ...update };
    return this.state;
  }

  async maybeInject(): Promise<void> {
    if (!this.state.enabled) {
      return;
    }

    if (this.state.mode === 'delay') {
      await new Promise((resolve) => setTimeout(resolve, this.state.delayMs));
      return;
    }

    if (Math.random() < this.state.failureRate) {
      throw new ServiceUnavailableException('chaos: simulated failure');
    }
  }
}
