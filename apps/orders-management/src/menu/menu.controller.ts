import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { MenuService } from './menu.service.js';
import { CreateMenuItemDto } from './create-menu-item.dto.js';
import { MenuItemResponseDto, MenuListResponseDto } from './menu-item-response.dto.js';

@ApiTags('menu')
@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Post()
  @ApiCreatedResponse({ type: MenuItemResponseDto })
  create(@Body() dto: CreateMenuItemDto) {
    return this.menuService.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: MenuListResponseDto })
  async findAll(): Promise<MenuListResponseDto> {
    const items = await this.menuService.findAll();
    return { items };
  }

  @Get(':id')
  @ApiOkResponse({ type: MenuItemResponseDto })
  findOne(@Param('id') id: string) {
    return this.menuService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(@Param('id') id: string): Promise<void> {
    return this.menuService.remove(id);
  }
}
