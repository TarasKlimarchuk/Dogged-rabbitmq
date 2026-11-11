import { CreateOrderDto } from './create-order.dto.js';
import { IsNotEmpty, IsString } from 'class-validator';

export class PlaceOrderMessage extends CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  terminalId: string;
}
