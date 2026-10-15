import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { VentasMotivosService } from './ventas-motivos.service';

// Catálogo de motivos de cierre (descartar un lead, perder una oportunidad,
// cancelar o no renovar un contrato). Cada empresa edita el suyo.
@Controller('ventas/motivos')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class VentasMotivosController {
  constructor(private readonly motivos: VentasMotivosService) {}

  @Get()
  @Section('VENTAS', 'view')
  list(
    @Req() req: any,
    @Query('kind') kind?: string,
    @Query('incluirInactivos') incluirInactivos?: string,
  ) {
    return this.motivos.list(req.user.companyId, {
      kind: kind || undefined,
      incluirInactivos: incluirInactivos === 'true',
    });
  }

  @Post()
  @Section('VENTAS', 'write')
  create(
    @Req() req: any,
    @Body() body: { label: string; kinds: string[]; requiresComment?: boolean },
  ) {
    return this.motivos.create(req.user.companyId, body);
  }

  @Patch(':id')
  @Section('VENTAS', 'write')
  update(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: { label?: string; kinds?: string[]; requiresComment?: boolean; isActive?: boolean },
  ) {
    return this.motivos.update(req.user.companyId, id, body);
  }

  @Delete(':id')
  @Section('VENTAS', 'write')
  remove(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.motivos.remove(req.user.companyId, id);
  }
}
