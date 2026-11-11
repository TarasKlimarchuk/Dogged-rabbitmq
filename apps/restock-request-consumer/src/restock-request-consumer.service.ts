import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { RestockRequestedEvent } from '@app/contracts/replenishments';
import { Delivery } from '@app/warehouse-db';

export type RestockRequestOutcome =
  { kind: 'created'; deliveryId: string } | { kind: 'duplicate' };

@Injectable()
export class RestockRequestConsumerService {
  constructor(
    @InjectRepository(Delivery)
    private readonly deliveries: Repository<Delivery>,
  ) {}

  // Warehouse stock is treated as infinite, so every request becomes a
  // pending delivery for the full amount.
  async handleRestockRequested(
    event: RestockRequestedEvent,
  ): Promise<RestockRequestOutcome> {
    // ON CONFLICT DO NOTHING on the unique restockRequestId: a redelivered
    // message (outbox delivery is at-least-once) inserts nothing and returns
    // no row, instead of failing or creating a second delivery.
    const result = await this.deliveries
      .createQueryBuilder()
      .insert()
      .into(Delivery)
      .values({
        restockRequestId: event.messageId,
        terminalId: event.terminalId,
        itemName: event.itemName,
        quantity: event.upToCapacity,
      })
      .orIgnore()
      .returning(['id'])
      .execute();

    const row = (result.raw as { id: string }[])[0];
    return row
      ? { kind: 'created', deliveryId: row.id }
      : { kind: 'duplicate' };
  }
}
