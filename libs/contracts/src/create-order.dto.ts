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
      'Client-generated idempotency key. Must be created by the original caller ' +
      '(not by terminal) so that a client retry reuses the same key instead of ' +
      'minting a new one; replaying it returns the original order instead of a duplicate.',
    example: '7a5a6c9e-9c3a-4b8a-8e7a-3c2f6b0e1a2d',
  })
  @IsUUID()
  idempotencyKey: string;

  @ApiProperty({ type: [OrderItemDto] })
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
