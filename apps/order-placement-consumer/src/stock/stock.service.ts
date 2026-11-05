import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { EntityManager, Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { createRetryTimeoutBreakerPolicy, isRetryableHttpError } from '@app/resilience';
import { ResilienceMetrics } from '@app/metrics';
import { TerminalStock } from '@app/orders-db';
import type { OrderItem } from '@app/orders-db';

const DEFAULT_CAPACITY = 50;
const REORDER_THRESHOLD_RATIO = 0.3;

export type ReserveResult =
  | { kind: 'reserved'; inventoryIssue: boolean }
  // The terminal has no stock row for this item (unknown terminal, or an
  // item that was never stocked there). Retrying can't fix it.
  | { kind: 'missing-stock'; itemName: string };

interface DecrementRow {
  quantity: number;
  capacity: number;
  wasInsufficient: boolean;
}

type DecrementResult =
  | { kind: 'decremented'; row: DecrementRow }
  | { kind: 'missing-stock' };

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);
  private readonly policy: ReturnType<typeof createRetryTimeoutBreakerPolicy>;

  constructor(
    @InjectRepository(TerminalStock)
    private readonly stock: Repository<TerminalStock>,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    metrics: ResilienceMetrics,
  ) {
    this.policy = createRetryTimeoutBreakerPolicy({
      isRetryable: isRetryableHttpError,
      ...metrics.breakerHooks('warehouse-restock'),
    });
  }

  async reserve(
    manager: EntityManager,
    terminalId: string,
    items: OrderItem[],
  ): Promise<ReserveResult> {
    let inventoryIssue = false;

    for (const item of items) {
      const result = await this.decrement(
        manager,
        terminalId,
        item.name,
        item.quantity,
      );
      if (result.kind === 'missing-stock') {
        return { kind: 'missing-stock', itemName: item.name };
      }

      if (result.row.wasInsufficient) {
        inventoryIssue = true;
      }
      // if (row.quantity < row.capacity * REORDER_THRESHOLD_RATIO) {
      //   await this.requestRestockIfNeeded(terminalId, item.name);
      // } move it todo
    }

    return { kind: 'reserved', inventoryIssue };
  }

  // A single atomic UPDATE, rather than the read-then-write-back approach
  private async decrement(
    manager: EntityManager,
    terminalId: string,
    itemName: string,
    requested: number,
  ): Promise<DecrementResult> {
    const rows = await manager.query<DecrementRow[]>(
      `
        WITH before AS (
          SELECT quantity FROM terminal_stock
          WHERE "terminalId" = $1 AND "itemName" = $2
        ),
        updated AS (
          UPDATE terminal_stock
          SET quantity = GREATEST(quantity - $3, 0)
          WHERE "terminalId" = $1 AND "itemName" = $2
          RETURNING quantity, capacity
        )
        SELECT updated.quantity, updated.capacity, (before.quantity < $3) AS "wasInsufficient"
        FROM updated, before
      `,
      [terminalId, itemName, requested],
    );

    const row = rows[0];
    return row ? { kind: 'decremented', row } : { kind: 'missing-stock' };
  }

  // Public so it can be called after the order transaction commits (see the
  // commented-out call in reserve()). Not called from anywhere yet.
  async requestRestockIfNeeded(
    terminalId: string,
    itemName: string,
  ): Promise<void> {
    const claim = await this.stock.update(
      { terminalId, itemName, restockPending: false },
      { restockPending: true },
    );
    if (!claim.affected) {
      return;
    }

    this.policy
      .execute(() => this.sendRestockRequest(terminalId, itemName))
      .then(() => {
        this.logger.log(`restock requested terminalId=${terminalId} item=${itemName}`);
      })
      .catch(async (error) => {
        this.logger.warn(
          `restock request failed terminalId=${terminalId} item=${itemName}: ${(error as Error).message}`,
        );
        // release the claim so the next low-stock check can try again
        await this.stock.update({ terminalId, itemName }, { restockPending: false });
      });
  }

  private async sendRestockRequest(
    terminalId: string,
    itemName: string,
  ): Promise<void> {
    const baseUrl = this.config.get<string>(
      'WAREHOUSE_URL',
      'http://localhost:3002',
    );
    await firstValueFrom(
      this.http.post(`${baseUrl}/restock`, {
        terminalId,
        itemName,
        upToCapacity: DEFAULT_CAPACITY,
      }),
    );
  }
}
