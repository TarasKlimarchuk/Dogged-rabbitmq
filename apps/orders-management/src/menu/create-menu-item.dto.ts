import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateMenuItemDto {
  @ApiProperty({ example: 'Hot Dog' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 1.99 })
  @IsNumber()
  @Min(0)
  price: number;
}
