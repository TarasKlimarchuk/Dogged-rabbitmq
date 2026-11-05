import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { createRetryTimeoutBreakerPolicy, isRetryableHttpError } from '@app/resilience';
import { ResilienceMetrics } from '@app/metrics';
import { Delivery } from './delivery.entity.js';
import { RestockRequestDto } from './restock-request.dto.js';
import { DeliveryResponseDto } from './delivery-response.dto.js';
import { DeliveryDetailsDto } from './delivery-details.dto.js';

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);
  private readonly policy: ReturnType<typeof createRetryTimeoutBreakerPolicy>;

  constructor(
    @InjectRepository(Delivery)
    private readonly deliveries: Repository<Delivery>,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    metrics: ResilienceMetrics,
  ) {
    this.policy = createRetryTimeoutBreakerPolicy({
      isRetryable: isRetryableHttpError,
      ...metrics.breakerHooks('orders-management-callback'),
    });
  }

  async requestRestock(dto: RestockRequestDto): Promise<DeliveryResponseDto> {
    const delivery = await this.deliveries.save(
      this.deliveries.create({
        terminalId: dto.terminalId,
        itemName: dto.itemName,
        quantity: dto.upToCapacity,
      }),
    );
    return { deliveryId: delivery.id, status: 'pending' };
  }

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
      notifiedOrdersManagement: delivery.notifiedOrdersManagement,
      createdAt: delivery.createdAt,
    }));
  }

  async confirmDelivery(id: string): Promise<DeliveryResponseDto> {
    const delivery = await this.deliveries.findOneBy({ id });
    if (!delivery) {
      throw new NotFoundException(`delivery ${id} not found`);
    }

    if (!delivery.delivered) {
      delivery.delivered = true;
      await this.deliveries.save(delivery);
      this.notifyOrdersManagement(delivery);
    }

    return { deliveryId: delivery.id, status: 'delivered' };
  }

  private notifyOrdersManagement(delivery: Delivery): void {
    this.policy
      .execute(() => this.sendRestockCallback(delivery))
      .then(() =>
        this.deliveries.update(
          { id: delivery.id },
          { notifiedOrdersManagement: true },
        ),
      )
      .then(() => {
        this.logger.log(`notified orders-management of delivery ${delivery.id}`);
      })
      .catch((error) => {
        this.logger.warn(
          `failed to notify orders-management of delivery ${delivery.id}: ${(error as Error).message}`,
        );
      });
  }

  private async sendRestockCallback(delivery: Delivery): Promise<void> {
    const baseUrl = this.config.get<string>(
      'ORDERS_MANAGEMENT_URL',
      'http://localhost:3001',
    );
    await firstValueFrom(
      this.http.post(`${baseUrl}/stock/restock-callback`, {
        terminalId: delivery.terminalId,
        itemName: delivery.itemName,
        quantity: delivery.quantity,
      }),
    );
  }
}
