import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChaosGuard } from '@app/chaos';
import { DeliveriesService } from './deliveries.service.js';
import { DeliveryResponseDto } from './delivery-response.dto.js';
import { DeliveryDetailsDto } from './delivery-details.dto.js';
import { ListDeliveriesQueryDto } from './list-deliveries-query.dto.js';

@ApiTags('deliveries')
@Controller()
@UseGuards(ChaosGuard)
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get('deliveries')
  @ApiOperation({
    summary:
      'List deliveries, newest first. Filter with ?status=pending or ?status=delivered.',
  })
  @ApiOkResponse({ type: [DeliveryDetailsDto] })
  findAll(@Query() query: ListDeliveriesQueryDto): Promise<DeliveryDetailsDto[]> {
    return this.deliveriesService.findAll(query.status);
  }

  @Post('deliveries/:id/confirm')
  @ApiOperation({
    summary:
      'Simulates the courier confirming a delivery. Idempotent. The ' +
      'restock_delivered event is written to an outbox in the same ' +
      'transaction and published to RabbitMQ in the background.',
  })
  @ApiOkResponse({ type: DeliveryResponseDto })
  confirmDelivery(@Param('id') id: string): Promise<DeliveryResponseDto> {
    return this.deliveriesService.confirmDelivery(id);
  }
}
