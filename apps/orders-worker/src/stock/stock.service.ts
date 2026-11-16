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

// A restock request enqueued while reserving stock for an order. Returned so
// the caller can log it once the transaction commits (logging it here would
// report requests that a later rollback throws away).
export interface ScheduledRestock {
  restockRequestId: string;
  itemName: string;
}

export type ReserveResult =
  | {
      kind: 'reserved';
      inventoryIssue: boolean;
      restockRequests: ScheduledRestock[];
    }
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
    orderId: string,
    terminalId: string,
    items: OrderItem[],
  ): Promise<ReserveResult> {
    let inventoryIssue = false;
    const restockRequests: ScheduledRestock[] = [];

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
        const restockRequestId = await this.scheduleRestock(
          manager,
          orderId,
          terminalId,
          item.name,
          row.capacity,
        );
        if (restockRequestId) {
          restockRequests.push({ restockRequestId, itemName: item.name });
        }
      }
    }

    return { kind: 'reserved', inventoryIssue, restockRequests };
  }

  // Returns the restock request id (the outbox row id, sent as the message's
  // messageId), or null when a restock for this item is already pending.
  private async scheduleRestock(
    manager: EntityManager,
    orderId: string,
    terminalId: string,
    itemName: string,
    capacity: number,
  ): Promise<string | null> {
    const claim = await manager.update(
      TerminalStock,
      { terminalId, itemName, restockPending: false },
      { restockPending: true },
    );
    if (!claim.affected) {
      return null;
    }

    const payload: Omit<RestockRequestedEvent, 'messageId'> = {
      triggeredByOrderId: orderId,
      terminalId,
      itemName,
      upToCapacity: capacity,
    };
    return this.outbox.enqueue(
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
