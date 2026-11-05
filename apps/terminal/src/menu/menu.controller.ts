import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MenuService } from './menu.service.js';
import { MenuResponseDto } from './menu-response.dto.js';

@ApiTags('menu')
@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  @ApiOperation({
    summary:
      'Fetch the menu. Retries against orders-management with backoff+jitter; ' +
      'falls back to the local cache or a default menu if it stays unreachable.',
  })
  @ApiOkResponse({ type: MenuResponseDto })
  getMenu(): Promise<MenuResponseDto> {
    return this.menuService.getMenu();
  }
}
