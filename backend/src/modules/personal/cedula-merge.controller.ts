import { Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CedulaMergeService } from './services/cedula-merge.service';
import { MergeCedulaDto } from './dto/cedula-merge.dto';

// Fusionar cédulas duplicadas mueve/borra datos de producción de forma
// irreversible — solo ADMIN, mismo nivel de acceso que deleteDriveEmployee
// en DriveController.
@Controller('personal/cedula-merge')
@UseGuards(AuthGuard('jwt'))
export class CedulaMergeController {
  constructor(private readonly cedulaMergeService: CedulaMergeService) {}

  @Get('preview')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  preview(
    @Query('cedulaOrigen') cedulaOrigen: string,
    @Query('cedulaDestino') cedulaDestino: string,
    @Req() req: any,
  ) {
    return this.cedulaMergeService.preview(
      req.user.companyId,
      cedulaOrigen,
      cedulaDestino,
    );
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  merge(@Body() body: MergeCedulaDto, @Req() req: any) {
    return this.cedulaMergeService.merge(
      req.user.companyId,
      req.user.userId,
      body.cedulaOrigen,
      body.cedulaDestino,
    );
  }

  @Get('historial')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  historial(@Req() req: any) {
    return this.cedulaMergeService.listLogs(req.user.companyId);
  }
}
