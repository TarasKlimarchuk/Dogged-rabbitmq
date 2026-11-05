import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChaosGuard } from '@app/chaos';
import { DeliveriesService } from './deliveries.service.js';
import { RestockRequestDto } from './restock-request.dto.js';
import { DeliveryResponseDto } from './delivery-response.dto.js';
import { DeliveryDetailsDto } from './delivery-details.dto.js';
import { ListDeliveriesQueryDto } from './list-deliveries-query.dto.js';

@ApiTags('deliveries')
@Controller()
@UseGuards(ChaosGuard)
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post('restock')
  @ApiOperation({
    summary:
      'Accept a restock request from orders-management. Warehouse stock is ' +
      'treated as infinite, so this always ships the full requested amount.',
  })
  @ApiCreatedResponse({ type: DeliveryResponseDto })
  requestRestock(@Body() dto: RestockRequestDto): Promise<DeliveryResponseDto> {
    return this.deliveriesService.requestRestock(dto);
  }

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
      'Simulates the courier confirming a delivery. Notifies orders-management ' +
      'through retry + circuit breaker, without blocking this response on it.',
  })
  @ApiOkResponse({ type: DeliveryResponseDto })
  confirmDelivery(@Param('id') id: string): Promise<DeliveryResponseDto> {
    return this.deliveriesService.confirmDelivery(id);
  }
}
