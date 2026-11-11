import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { RestockDeliveredEvent } from '@app/contracts/replenishments';
import { ProcessedMessage } from '@app/orders-db';
import { StockService } from '../stock/stock.service.js';

export type RestockDeliveredOutcome =
  | { kind: 'restocked'; quantity: number }
  | { kind: 'duplicate' }
  | { kind: 'rejected'; reason: string };

// Thrown inside the transaction only to make TypeORM roll it back (including
// the inbox row, so a fixed and replayed message is not mistaken for a
// duplicate); caught below and turned into a 'rejected' outcome.
class RestockRejected extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

@Injectable()
export class RestockDeliveredService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly stock: StockService,
  ) {}

  async handleRestockDelivered(
    event: RestockDeliveredEvent,
  ): Promise<RestockDeliveredOutcome> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        // Inbox: ON CONFLICT DO NOTHING on the messageId primary key. A
        // redelivered message inserts nothing, and is skipped instead of
        // adding the same stock twice. Committed together with the stock
        // change, so the two can't get out of step.
        const inbox = await manager
          .createQueryBuilder()
          .insert()
          .into(ProcessedMessage)
          .values({ messageId: event.messageId })
          .orIgnore()
          .returning(['messageId'])
          .execute();
        if ((inbox.raw as unknown[]).length === 0) {
          return { kind: 'duplicate' as const };
        }

        const result = await this.stock.restock(
          manager,
          event.terminalId,
          event.itemName,
          event.quantity,
        );
        if (result.kind === 'missing-stock') {
          throw new RestockRejected(
            `terminal "${event.terminalId}" has no stock entry for "${event.itemName}"`,
          );
        }

        return { kind: 'restocked' as const, quantity: result.quantity };
      });
    } catch (error) {
      if (error instanceof RestockRejected) {
        return { kind: 'rejected', reason: error.reason };
      }
      throw error;
    }
  }
}
