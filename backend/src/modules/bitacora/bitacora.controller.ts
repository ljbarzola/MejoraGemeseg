import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { PermissionsService } from '../permissions/permissions.service';
import { BitacoraService, UsuarioBitacora } from './bitacora.service';
import { BitacoraGoogleService } from './bitacora-google.service';
import { CambiarActivacionDto } from './dto/cambiar-activacion.dto';

interface Autenticado {
  user: UsuarioBitacora;
}

/**
 * Sin @Section a nivel de clase a propósito: `estado` y `mi-hoja` los puede usar
 * cualquier persona (cada quien ve solo lo suyo, como la bandeja de
 * notificaciones), y activar hojas lo deciden los administradores y gerentes por
 * su rol. Solo la bitácora de TODO el equipo exige la sección BITACORA, que está
 * cerrada por defecto.
 */
@Controller('bitacora')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class BitacoraController {
  constructor(
    private readonly bitacora: BitacoraService,
    private readonly google: BitacoraGoogleService,
    private readonly permisos: PermissionsService,
  ) {}

  /** Qué ve esta persona: ¿empresa encendida?, ¿su hoja activada?, ¿puede activar hojas? (decide su menú). */
  @Get('estado')
  estado(@Req() req: Autenticado) {
    return this.bitacora.estado(req.user);
  }

  @Get('mi-hoja')
  async miHoja(@Req() req: Autenticado, @Query('fecha') fecha?: string) {
    const dia = this.bitacora.resolverFecha(fecha);
    const estado = await this.bitacora.estado(req.user);
    // Quien nunca tuvo la hoja activada no ve nada; quien la tuvo conserva su historial.
    const hoja =
      estado.empresaActiva && estado.registrada
        ? await this.bitacora.hojaDe(req.user.userId, dia)
        : null;
    return { ...estado, fecha: dia, hoja };
  }

  /** Personas de la empresa con su estado (por defecto ninguna activada). Administradores y gerentes. */
  @Get('activaciones')
  activaciones(@Req() req: Autenticado) {
    return this.bitacora.listarActivaciones(req.user);
  }

  @Put('activaciones/:userId')
  cambiarActivacion(
    @Req() req: Autenticado,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: CambiarActivacionDto,
  ) {
    return this.bitacora.cambiarActivacion(req.user, userId, dto.activa);
  }

  @Get('equipo')
  @Section('BITACORA', 'view')
  async equipo(@Req() req: Autenticado, @Query('fecha') fecha?: string) {
    const dia = this.bitacora.resolverFecha(fecha);
    const companyId = this.empresaDe(req);
    await this.exigirPermisoExplicito(req.user.userId);
    return {
      fecha: dia,
      personas: await this.bitacora.resumenEquipo(companyId, dia),
    };
  }

  /** Métricas del equipo en los últimos 7, 14 o 30 días, para el Dashboard. */
  @Get('metricas')
  @Section('BITACORA', 'view')
  async metricas(@Req() req: Autenticado, @Query('dias') dias?: string) {
    const companyId = this.empresaDe(req);
    await this.exigirPermisoExplicito(req.user.userId);
    return this.bitacora.metricas(companyId, dias);
  }

  @Get('equipo/:userId')
  @Section('BITACORA', 'view')
  async personaDelEquipo(
    @Req() req: Autenticado,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('fecha') fecha?: string,
  ) {
    const dia = this.bitacora.resolverFecha(fecha);
    const companyId = this.empresaDe(req);
    await this.exigirPermisoExplicito(req.user.userId);
    const persona = await this.bitacora.personaDeLaEmpresa(companyId, userId);
    await this.bitacora.registrarConsulta(req.user.userId, persona.id, dia);
    return {
      persona: {
        id: persona.id,
        nombre: persona.fullName,
        cargo: persona.position,
        activa: persona.activa,
      },
      hoja: await this.bitacora.hojaDe(persona.id, dia),
    };
  }

  /**
   * Conexión con Google, para la pestaña «Google» de Configuración: qué falta
   * configurar, cuántas personas se leen y cuándo fue el último evento guardado.
   * Administradores y gerentes.
   */
  @Get('google/estado')
  async estadoGoogle(@Req() req: Autenticado) {
    const companyId = await this.bitacora.exigirAdministrador(req.user);
    return {
      ...this.google.configuracion(),
      ...(await this.bitacora.resumenGoogle(companyId)),
    };
  }

  /**
   * Lee ahora mismo la actividad de Google de las personas activadas de la
   * empresa de quien lo pide. Lo hacen los administradores y gerentes (quienes
   * configuran la bitácora) o quien tenga «Escribir» en la sección; no hace falta
   * poder ver la bitácora del equipo.
   */
  @Post('google/sincronizar')
  async sincronizarGoogle(@Req() req: Autenticado) {
    const { puedeAdministrar } = await this.bitacora.estado(req.user);
    if (!puedeAdministrar) {
      await this.exigirPermisoExplicito(req.user.userId, 'write');
    }
    return this.google.sincronizar(req.user.companyId ?? undefined);
  }

  /**
   * Ver la bitácora de otras personas exige una fila de permiso propia con
   * «Ver» marcado. El guard de sección deja pasar a todos si el administrador de
   * la empresa marca la sección como «módulo fijo»; aquí no, porque son datos
   * de personas y no se abren por omisión.
   */
  private async exigirPermisoExplicito(
    userId: number,
    acceso: 'view' | 'write' = 'view',
  ): Promise<void> {
    const permisos = await this.permisos.getUserPermissions(userId);
    const tiene = permisos.some(
      (p) =>
        p.section === 'BITACORA' &&
        (acceso === 'write' ? p.canWrite : p.canView),
    );
    if (!tiene) {
      throw new ForbiddenException(
        'No tienes acceso a la bitácora del equipo.',
      );
    }
  }

  private empresaDe(req: Autenticado): number {
    if (!req.user.companyId) {
      throw new BadRequestException(
        'Entra con un usuario de una empresa para ver la bitácora del equipo.',
      );
    }
    return req.user.companyId;
  }
}
