import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { createRetryTimeoutBreakerPolicy } from '@app/resilience';
import { ResilienceMetrics } from '@app/metrics';
import type { OrderItem } from '@app/orders-db';
import { TerminalStock } from '@app/orders-db';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

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
  { kind: 'decremented'; row: DecrementRow } | { kind: 'missing-stock' };

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);
  private readonly policy: ReturnType<typeof createRetryTimeoutBreakerPolicy>;

  constructor(
    @InjectRepository(TerminalStock)
    private readonly stock: Repository<TerminalStock>,
    @Inject('REPLENISHMENT_SERVICE')
    private readonly replenishmentConsumer: ClientProxy,
    metrics: ResilienceMetrics,
  ) {
    this.policy = createRetryTimeoutBreakerPolicy({
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
        WITH before AS (SELECT quantity
                        FROM terminal_stock
                        WHERE "terminalId" = $1
                          AND "itemName" = $2),
             updated AS (
        UPDATE terminal_stock
        SET quantity = GREATEST(quantity - $3, 0)
        WHERE "terminalId" = $1
          AND "itemName" = $2 RETURNING quantity, capacity
        )
        SELECT updated.quantity, updated.capacity, (before.quantity < $3) AS "wasInsufficient"
        FROM updated,
             before
      `,
      [terminalId, itemName, requested],
    );

    const row = rows[0];
    return row ? { kind: 'decremented', row } : { kind: 'missing-stock' };
  }

  // Best-effort, called after the order transaction commits. Never throws:
  // a failure here must not requeue an order that is already placed (the
  // redelivery would be treated as a duplicate and the restock lost anyway).
  async requestRestockIfNeeded(
    terminalId: string,
    items: OrderItem[],
  ): Promise<void> {
    for (const item of items) {
      try {
        await this.requestRestockForItem(terminalId, item.name);
      } catch (error) {
        // per item, so one failure doesn't skip the remaining items
        this.logger.warn(
          `restock check failed terminalId=${terminalId} item=${item.name}: ${(error as Error).message}`,
        );
      }
    }
  }

  private async requestRestockForItem(
    terminalId: string,
    itemName: string,
  ): Promise<void> {
    // Threshold check + claim in one atomic UPDATE: only matches when stock
    // is low AND no restock is already pending for this terminal/item.
    const claim = await this.stock
      .createQueryBuilder()
      .update()
      .set({ restockPending: true })
      .where('"terminalId" = :terminalId AND "itemName" = :itemName', {
        terminalId,
        itemName,
      })
      .andWhere('"restockPending" = false')
      .andWhere('quantity < capacity * CAST(:ratio AS numeric)', {
        ratio: REORDER_THRESHOLD_RATIO,
      })
      .execute();
    if (claim.affected) {
      await this.policy
        .execute(() =>
          lastValueFrom(
            this.replenishmentConsumer.emit('restock_request', {
              terminalId,
              itemName,
            }),
          ),
        )
        .then(() => {
          this.logger.log(
            `restock requested terminalId=${terminalId} item=${itemName}`,
          );
        })
        .catch(async (error) => {
          this.logger.warn(
            `restock request failed terminalId=${terminalId} item=${itemName}: ${(error as Error).message}`,
          );
          // release the claim so the next low-stock check can try again
          await this.stock
            .update({ terminalId, itemName }, { restockPending: false })
            .catch((releaseError: unknown) => {
              // not awaited by anyone: an escape here would be an
              // unhandled rejection
              this.logger.error(
                `failed to release restock claim terminalId=${terminalId} item=${itemName}: ${(releaseError as Error).message}`,
              );
            });
        });
    }
  }
}
