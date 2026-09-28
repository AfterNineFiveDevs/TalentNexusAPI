import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from '../@decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Version(VERSION_NEUTRAL)
  @Public()
  @Get('live')
  getLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Version(VERSION_NEUTRAL)
  @Public()
  @Get('ready')
  getReadiness(): Promise<{ status: 'ok'; database: 'connected' }> {
    return this.healthService.checkReadiness();
  }
}
