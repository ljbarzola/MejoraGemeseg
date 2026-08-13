import { Body, Controller, Get, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { PermissionsService } from './permissions.service';
import { SetCompanySectionsDto, SetUserPermissionsDto } from './dto/permission.dto';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly service: PermissionsService) {}

  @Get('my')
  @UseGuards(AuthGuard('jwt'))
  getMyPermissions(@Req() req: any) {
    return this.service.getMyPermissions(req.user.userId, req.user.companyId);
  }

  @Get('sections/:companyId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  getCompanySections(@Param('companyId', ParseIntPipe) companyId: number, @Req() req: any) {
    if (this.service.isSuperAdmin(req.user)) {
      return this.service.getCompanySections(companyId);
    }
    if (req.user.companyId !== companyId) {
      throw new Error('No tienes acceso a esta empresa');
    }
    return this.service.getCompanySections(companyId);
  }

  @Post('sections/:companyId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  setCompanySections(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: SetCompanySectionsDto,
    @Req() req: any,
  ) {
    if (!this.service.isSuperAdmin(req.user)) {
      throw new Error('Solo el super administrador puede gestionar secciones de empresa');
    }
    return this.service.setCompanySections(companyId, dto.sections);
  }

  @Get('users/:companyId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  getUserPermissionsForCompany(@Param('companyId', ParseIntPipe) companyId: number, @Req() req: any) {
    if (this.service.isSuperAdmin(req.user)) {
      return this.service.getUserPermissionsForCompany(companyId);
    }
    if (req.user.companyId !== companyId) {
      throw new Error('No tienes acceso a esta empresa');
    }
    return this.service.getUserPermissionsForCompany(companyId);
  }

  @Post('users/:userId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  setUserPermissions(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: SetUserPermissionsDto,
    @Req() req: any,
  ) {
    if (!this.service.isSuperAdmin(req.user) && !req.user.companyId) {
      throw new Error('Sin permisos');
    }
    return this.service.setUserPermissions(userId, dto.permissions);
  }
}
