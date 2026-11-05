import { ApiProperty } from '@nestjs/swagger';

export class DeliveryResponseDto {
  @ApiProperty({ example: '3b1f7e2a-5c4d-4a9b-8f1e-2d3c4b5a6f7e' })
  deliveryId: string;

  @ApiProperty({ enum: ['pending', 'delivered'] })
  status: 'pending' | 'delivered';
}
