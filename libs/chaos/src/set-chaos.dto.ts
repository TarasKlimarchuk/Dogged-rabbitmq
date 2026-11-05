import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import type { ChaosMode } from './chaos.service.js';

export class SetChaosDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ enum: ['error', 'delay'], example: 'error' })
  @IsOptional()
  @IsIn(['error', 'delay'])
  mode?: ChaosMode;

  @ApiPropertyOptional({
    example: 1,
    description: 'Fraction of requests to fail in error mode, 0-1.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  failureRate?: number;

  @ApiPropertyOptional({
    example: 5000,
    description: 'Delay added to every request in delay mode, in ms.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  delayMs?: number;
}
