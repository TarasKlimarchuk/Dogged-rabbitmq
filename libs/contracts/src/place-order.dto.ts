import { CreateOrderDto } from '@app/contracts/create-order.dto.js';
import { IsNotEmpty, IsString } from 'class-validator';

export class PlaceOrderMessage extends CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  terminalId: string;
}
