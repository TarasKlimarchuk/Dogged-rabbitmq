import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  REPLENISHMENT_PATTERNS,
  type RestockDeliveredEvent,
} from '@app/contracts/replenishments';
import { OutboxService } from '@app/outbox';
import { Delivery } from '@app/warehouse-db';
import { DeliveryResponseDto } from './delivery-response.dto.js';
import { DeliveryDetailsDto } from './delivery-details.dto.js';

@Injectable()
export class DeliveriesService {
  constructor(
    @InjectRepository(Delivery)
    private readonly deliveries: Repository<Delivery>,
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
  ) {}

  async findAll(status?: 'pending' | 'delivered'): Promise<DeliveryDetailsDto[]> {
    const deliveries = await this.deliveries.find({
      where: status ? { delivered: status === 'delivered' } : {},
      order: { createdAt: 'DESC' },
    });

    return deliveries.map((delivery) => ({
      deliveryId: delivery.id,
      terminalId: delivery.terminalId,
      itemName: delivery.itemName,
      quantity: delivery.quantity,
      status: delivery.delivered ? 'delivered' : 'pending',
      createdAt: delivery.createdAt,
    }));
  }

  async confirmDelivery(id: string): Promise<DeliveryResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const delivery = await manager.findOneBy(Delivery, { id });
      if (!delivery) {
        throw new NotFoundException(`delivery ${id} not found`);
      }

      const claim = await manager.update(
        Delivery,
        { id, delivered: false },
        { delivered: true },
      );

      if (claim.affected) {
        const payload: Omit<RestockDeliveredEvent, 'messageId'> = {
          deliveryId: delivery.id,
          terminalId: delivery.terminalId,
          itemName: delivery.itemName,
          quantity: delivery.quantity,
        };
        await this.outbox.enqueue(
          manager,
          REPLENISHMENT_PATTERNS.RESTOCK_DELIVERED,
          payload,
        );
      }

      return { deliveryId: delivery.id, status: 'delivered' };
    });
  }
}
