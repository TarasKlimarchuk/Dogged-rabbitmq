import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  REPLENISHMENT_PATTERNS,
  type RestockRequestedEvent,
} from '@app/contracts/replenishments';
import type { OrderItem } from '@app/orders-db';
import { TerminalStock } from '@app/orders-db';
import { OutboxService } from '@app/outbox';

const REORDER_THRESHOLD_RATIO = 0.3;

export type ReserveResult =
  | { kind: 'reserved'; inventoryIssue: boolean }
  | { kind: 'missing-stock'; itemName: string };

interface DecrementRow {
  quantity: number;
  capacity: number;
  wasInsufficient: boolean;
}

type DecrementResult =
  { kind: 'decremented'; row: DecrementRow } | { kind: 'missing-stock' };

export type RestockResult =
  { kind: 'restocked'; quantity: number } | { kind: 'missing-stock' };

@Injectable()
export class StockService {
  constructor(private readonly outbox: OutboxService) {}

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

      const { row } = result;
      if (row.wasInsufficient) {
        inventoryIssue = true;
      }

      if (row.quantity < row.capacity * REORDER_THRESHOLD_RATIO) {
        await this.scheduleRestock(
          manager,
          terminalId,
          item.name,
          row.capacity,
        );
      }
    }

    return { kind: 'reserved', inventoryIssue };
  }

  private async scheduleRestock(
    manager: EntityManager,
    terminalId: string,
    itemName: string,
    capacity: number,
  ): Promise<void> {
    const claim = await manager.update(
      TerminalStock,
      { terminalId, itemName, restockPending: false },
      { restockPending: true },
    );
    if (!claim.affected) {
      return;
    }

    const payload: Omit<RestockRequestedEvent, 'messageId'> = {
      terminalId,
      itemName,
      upToCapacity: capacity,
    };
    await this.outbox.enqueue(
      manager,
      REPLENISHMENT_PATTERNS.RESTOCK_REQUESTED,
      payload,
    );
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

  async restock(
    manager: EntityManager,
    terminalId: string,
    itemName: string,
    delivered: number,
  ): Promise<RestockResult> {
    const rows = await manager.query<{ quantity: number }[]>(
      `
        WITH updated AS (
          UPDATE terminal_stock
          SET quantity = LEAST(quantity + $3, capacity),
              "restockPending" = false
          WHERE "terminalId" = $1 AND "itemName" = $2
          RETURNING quantity
        )
        SELECT quantity FROM updated
      `,
      [terminalId, itemName, delivered],
    );

    const row = rows[0];
    return row
      ? { kind: 'restocked', quantity: row.quantity }
      : { kind: 'missing-stock' };
  }
}
