import { Injectable, Logger } from '@nestjs/common';
import { PlaceOrderMessage } from '@app/contracts/orders';
import { isUniqueViolation, Order } from '@app/orders-db';
import { DataSource } from 'typeorm';
import { MenuService } from '../menu/menu.service.js';
import { type ScheduledRestock, StockService } from '../stock/stock.service.js';

export type PlaceOrderOutcome =
  | {
      kind: 'placed';
      orderId: string;
      inventoryIssue: boolean;
      restockRequests: ScheduledRestock[];
    }
  | { kind: 'duplicate' }
  | { kind: 'rejected'; reason: string };

// Thrown inside the transaction only to make TypeORM roll it back; caught
// below and turned into a 'rejected' outcome. Never leaves this service.
class OrderRejected extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

@Injectable()
export class OrderPlacementService {
  private readonly logger = new Logger(OrderPlacementService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly stock: StockService,
    private readonly menu: MenuService,
  ) {}

  async handleOrderPlaced(dto: PlaceOrderMessage): Promise<PlaceOrderOutcome> {
    const missingItems = await this.menu.findMissingNames(
      dto.items.map((item) => item.name),
    );
    if (missingItems.length > 0) {
      return {
        kind: 'rejected',
        reason: `unknown menu item(s): ${missingItems.join(', ')}`,
      };
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager.insert(
          Order,
          manager.create(Order, {
            orderId: dto.orderId,
            terminalId: dto.terminalId,
            items: dto.items,
          }),
        );

        const reservation = await this.stock.reserve(
          manager,
          dto.orderId,
          dto.terminalId,
          dto.items,
        );
        if (reservation.kind === 'missing-stock') {
          throw new OrderRejected(
            `terminal "${dto.terminalId}" has no stock entry for "${reservation.itemName}"`,
          );
        }

        const { inventoryIssue, restockRequests } = reservation;
        if (inventoryIssue) {
          await manager.update(Order, dto.orderId, { inventoryIssue });
        }

        return {
          kind: 'placed' as const,
          orderId: dto.orderId,
          inventoryIssue,
          restockRequests,
        };
      });
    } catch (error) {
      if (error instanceof OrderRejected) {
        return { kind: 'rejected', reason: error.reason };
      }
      if (isUniqueViolation(error)) {
        return { kind: 'duplicate' };
      }

      throw error;
    }
  }
}
