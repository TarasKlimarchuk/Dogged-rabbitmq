import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChaosService } from './chaos.service.js';
import type { ChaosState } from './chaos.service.js';
import { SetChaosDto } from './set-chaos.dto.js';

@ApiTags('admin')
@Controller('admin/chaos')
export class ChaosController {
  constructor(private readonly chaos: ChaosService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current fault-injection state for this service.' })
  @ApiOkResponse()
  getState(): ChaosState {
    return this.chaos.getState();
  }

  @Post()
  @ApiOperation({
    summary:
      'Toggle fault injection for this service. error mode fails a fraction ' +
      'of requests (failureRate); delay mode adds delayMs to every request. ' +
      'This endpoint is never itself subject to chaos, so it can always turn it off.',
  })
  @ApiOkResponse()
  setState(@Body() dto: SetChaosDto): ChaosState {
    return this.chaos.setState(dto);
  }
}
