import { ApiProperty } from '@nestjs/swagger';

export class MenuItemResponseDto {
  @ApiProperty({ example: '3b1f7e2a-5c4d-4a9b-8f1e-2d3c4b5a6f7e' })
  id: string;

  @ApiProperty({ example: 'Hot Dog' })
  name: string;

  @ApiProperty({ example: 1.99 })
  price: number;
}

export class MenuListResponseDto {
  @ApiProperty({ type: [MenuItemResponseDto] })
  items: MenuItemResponseDto[];
}
