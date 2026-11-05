import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class ListDeliveriesQueryDto {
  @ApiPropertyOptional({
    enum: ['pending', 'delivered'],
    description: 'Only return deliveries in this status. Omit for all.',
  })
  @IsOptional()
  @IsIn(['pending', 'delivered'])
  status?: 'pending' | 'delivered';
}
