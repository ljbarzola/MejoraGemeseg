import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CacaoPuntosService } from './puntos.service';
import { CreatePuntoDto, UpdatePuntoDto } from './dto/punto.dto';

@Controller('cacao/puntos')
export class CacaoPuntosController {
  constructor(private readonly service: CacaoPuntosService) {}

  /** `?todos=1` incluye los desactivados (para Configuración). */
  @Get()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  list(@Req() req: any, @Query('todos') todos?: string) {
    return this.service.list(req.user.companyId, todos !== '1');
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  create(@Body() dto: CreatePuntoDto, @Req() req: any) {
    return this.service.create(req.user.companyId, dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePuntoDto,
    @Req() req: any,
  ) {
    return this.service.update(req.user.companyId, id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.remove(req.user.companyId, id);
  }
}
