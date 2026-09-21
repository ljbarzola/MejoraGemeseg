import { Controller, Get, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { NotificationConfigService } from './services/notification-config.service';

@Controller('personal/notification-config')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class NotificationConfigController {
  constructor(private readonly configService: NotificationConfigService) {}

  @Get()
  @Section('RRHH', 'view')
  get(@Req() req: any) {
    return this.configService.get(req.user.companyId);
  }

  @Patch()
  @Section('RRHH', 'write')
  upsert(@Body() body: any, @Req() req: any) {
    return this.configService.upsert(req.user.companyId, body);
  }
}
