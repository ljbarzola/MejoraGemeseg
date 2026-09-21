import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { CacaoDashboardService } from './dashboard.service';

@Controller('cacao/dashboard')
export class CacaoDashboardController {
  constructor(private readonly service: CacaoDashboardService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  getDashboard(@Req() req: any) {
    return this.service.getDashboard(req.user.companyId);
  }
}
