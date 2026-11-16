import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemDto {
  @ApiProperty({ example: 'Hot Dog' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({
    description:
      'Client-generated order id, which is also the idempotency key. Must be ' +
      'created by the original caller (not by terminal) so that a client retry ' +
      'reuses the same id instead of minting a new one; replaying it does not ' +
      'create a duplicate order. Every service logs it as `orderId`, so it also ' +
      'serves as the correlation id for following one order through the system.',
    example: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d',
  })
  @IsUUID()
  orderId: string;

  @ApiProperty({ type: [OrderItemDto] })
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
