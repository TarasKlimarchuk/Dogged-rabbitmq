import { ApiProperty } from '@nestjs/swagger';

export class MenuItemDto {
  @ApiProperty({ example: 'Hot Dog' })
  name: string;

  @ApiProperty({ example: 1.99 })
  price: number;
}

export class MenuResponseDto {
  @ApiProperty({ type: [MenuItemDto] })
  items: MenuItemDto[];

  @ApiProperty({
    enum: ['live', 'cache', 'default'],
    description:
      'live: fetched from orders-management just now. cache: orders-management ' +
      'is unreachable, served the last known-good menu. default: unreachable and ' +
      'no cache exists yet.',
  })
  source: 'live' | 'cache' | 'default';
}
