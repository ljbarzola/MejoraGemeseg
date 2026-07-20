import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CacaoDashboardService } from './dashboard.service';

@Controller('cacao/dashboard')
export class CacaoDashboardController {
  constructor(private readonly service: CacaoDashboardService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  getDashboard(@Req() req: any) {
    return this.service.getDashboard(req.user.companyId);
  }
}
