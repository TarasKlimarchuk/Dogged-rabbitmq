import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  private readonly logger = new Logger(DeliveriesService.name);

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
    const { delivery, confirmed } = await this.dataSource.transaction(
      async (manager) => {
        const delivery = await manager.findOneBy(Delivery, { id });
        if (!delivery) {
          throw new NotFoundException(`delivery ${id} not found`);
        }

        const claim = await manager.update(
          Delivery,
          { id, delivered: false },
          { delivered: true },
        );
        if (!claim.affected) {
          return { delivery, confirmed: false };
        }

        const payload: Omit<RestockDeliveredEvent, 'messageId'> = {
          deliveryId: delivery.id,
          restockRequestId: delivery.restockRequestId,
          terminalId: delivery.terminalId,
          itemName: delivery.itemName,
          quantity: delivery.quantity,
        };
        await this.outbox.enqueue(
          manager,
          REPLENISHMENT_PATTERNS.RESTOCK_DELIVERED,
          payload,
        );
        return { delivery, confirmed: true };
      },
    );

    // Logged after commit, so a rolled-back confirm is never reported.
    this.logger.log(
      {
        deliveryId: delivery.id,
        restockRequestId: delivery.restockRequestId,
        terminalId: delivery.terminalId,
        itemName: delivery.itemName,
        outcome: confirmed ? 'confirmed' : 'already_confirmed',
      },
      confirmed ? 'delivery confirmed' : 'delivery already confirmed',
    );

    return { deliveryId: delivery.id, status: 'delivered' };
  }
}
