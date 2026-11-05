import { ApiProperty } from '@nestjs/swagger';

export class DeliveryDetailsDto {
  @ApiProperty({ example: '3b1f7e2a-5c4d-4a9b-8f1e-2d3c4b5a6f7e' })
  deliveryId: string;

  @ApiProperty({ example: 'terminal-a' })
  terminalId: string;

  @ApiProperty({ example: 'Hot Dog' })
  itemName: string;

  @ApiProperty({ example: 50 })
  quantity: number;

  @ApiProperty({ enum: ['pending', 'delivered'] })
  status: 'pending' | 'delivered';

  @ApiProperty({
    description:
      'Whether orders-management has acknowledged the restock callback. ' +
      'A delivered delivery with false here means the notification never got through.',
  })
  notifiedOrdersManagement: boolean;

  @ApiProperty()
  createdAt: Date;
}
