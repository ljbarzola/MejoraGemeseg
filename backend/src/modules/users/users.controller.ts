import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { CreateLocationDto } from './dto/create-location.dto';
import { SetPreferenceDto } from './dto/set-preference.dto';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Administración (2026-11-26): manda la casilla de la sección, no el rol. Quien no es administrador
  // (un Gerente al que le dieron «Escribir») no puede crear ni tocar administradores.
  @Post()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('ADMIN', 'write')
  create(@Body() dto: CreateUserDto, @Req() req: any) {
    this.soloAdminToca(req.user, dto.role);
    return this.usersService.create(dto, req.user.companyId);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(
    @Req() req: any,
    @Query() query: { role?: string; isActive?: string; search?: string },
  ) {
    return this.usersService.findAll(req.user.companyId, query, req.user.role);
  }

  // Lecturas de la pantalla Administración: el Gerente también las ve (solo
  // lectura). Crear/editar/borrar siguen siendo solo ADMIN.
  @Get('stats')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('ADMIN', 'view')
  getStats(@Req() req: any) {
    return this.usersService.getStats(req.user.companyId);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  getMe(@Req() req: any) {
    return this.usersService.getMe(req.user.userId);
  }

  // Perfil propio: solo el teléfono (lista cerrada en UpdateMeDto). Va antes de
  // `:id` para que esa ruta no lo capture.
  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  updateMe(@Req() req: any, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(req.user.userId, dto);
  }

  @Patch('me/active-agent')
  @UseGuards(AuthGuard('jwt'))
  setActiveAgent(@Req() req: any, @Body() body: { agentId: number | null }) {
    return this.usersService.setActiveAgent(req.user.userId, body.agentId);
  }

  // Preferencias personales (ej. columnas de una tabla). Siempre las del
  // usuario autenticado: no existe forma de pedir las de otra persona. Van
  // antes de `:id` para que esa ruta no las capture.
  @Get('me/preferences/:key')
  @UseGuards(AuthGuard('jwt'))
  getPreference(@Req() req: any, @Param('key') key: string) {
    return this.usersService.getPreference(req.user.userId, key);
  }

  @Put('me/preferences/:key')
  @UseGuards(AuthGuard('jwt'))
  setPreference(
    @Req() req: any,
    @Param('key') key: string,
    @Body() dto: SetPreferenceDto,
  ) {
    return this.usersService.setPreference(req.user.userId, key, dto.value);
  }

  @Get('locations')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('ADMIN', 'view')
  getLocations(@Req() req: any) {
    return this.usersService.getLocations(req.user.companyId);
  }

  @Post('locations')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('ADMIN', 'write')
  createLocation(@Body() dto: CreateLocationDto, @Req() req: any) {
    return this.usersService.createLocation(req.user.companyId, dto.nombre);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('ADMIN', 'view')
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const user = await this.usersService.findOne(id);
    if (req.user.companyId && user.companyId !== req.user.companyId) {
      throw new ForbiddenException('No tienes acceso a este usuario');
    }
    return user;
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('ADMIN', 'write')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Req() req: any,
  ) {
    const user = await this.usersService.findOne(id);
    if (req.user.companyId && user.companyId !== req.user.companyId) {
      throw new ForbiddenException('No puedes editar usuarios de otra empresa');
    }
    this.soloAdminToca(req.user, dto.role, user.role);
    return this.usersService.update(id, dto, req.user.userId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('ADMIN', 'write')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const user = await this.usersService.findOne(id);
    if (req.user.companyId && user.companyId !== req.user.companyId) {
      throw new ForbiddenException(
        'No puedes eliminar usuarios de otra empresa',
      );
    }
    this.soloAdminToca(req.user, undefined, user.role);
    return this.usersService.remove(id);
  }

  /** Un no-administrador no crea administradores ni edita o borra a uno (evita subirse el rol a sí mismo). */
  private soloAdminToca(
    actor: { role: string; companyId: number | null },
    rolNuevo?: string,
    rolActual?: string,
  ) {
    if (actor.role === 'ADMIN') return;
    if (rolNuevo === 'ADMIN' || rolActual === 'ADMIN') {
      throw new ForbiddenException('Solo un administrador puede crear o cambiar a otro administrador');
    }
  }
}
