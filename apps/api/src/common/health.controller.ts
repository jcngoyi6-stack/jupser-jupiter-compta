import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { PrismaService } from './prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly db: PrismaService) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'Jupiter Compta API', editeur: 'JUPSER' };
  }

  @Public()
  @Get('ready')
  async ready() {
    await this.db.client.$queryRaw`SELECT 1`;
    return { status: 'ready' };
  }
}
