import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CacaoConfigService } from './cacao-config.service';
import { UpdateCacaoConfigDto } from './dto/cacao-config.dto';

@Controller('cacao/configuracion')
export class CacaoConfigController {
  constructor(private readonly service: CacaoConfigService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  get(@Req() req: any) {
    return this.service.get(req.user.companyId);
  }

  @Put()
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  update(@Body() dto: UpdateCacaoConfigDto, @Req() req: any) {
    return this.service.update(req.user.companyId, dto);
  }
}
