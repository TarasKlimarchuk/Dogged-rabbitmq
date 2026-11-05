import { ApiProperty } from '@nestjs/swagger';
import { CreateOrderDto } from '@app/contracts';
import { IsNotEmpty, IsString } from 'class-validator';

export class OrderResponseDto {
  @ApiProperty({ enum: ['accepted'] })
  status: 'accepted';

  @ApiProperty({ type: CreateOrderDto })
  order: CreateOrderDto;

  @ApiProperty({ example: 'terminalId' })
  @IsString()
  @IsNotEmpty()
  terminalId: string;
}
