import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { BitacoraExtensionService } from './bitacora-extension.service';
import { BitacoraHorasService } from './bitacora-horas.service';
import { BitacoraNotasService } from './bitacora-notas.service';
import { BitacoraResumenService } from './bitacora-resumen.service';
import { CambiarActivacionDto } from './dto/cambiar-activacion.dto';
import { AnotarDeudaDto, ResolverExtraDto } from './dto/horas.dto';
import {
  ActualizarNotaDto,
  CrearNotaDto,
  GenerarResumenDto,
  GuardarSitiosSensiblesDto,
} from './dto/notas.dto';
import { GuardarHorarioDto } from './dto/guardar-horario.dto';

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
    private readonly extension: BitacoraExtensionService,
    private readonly horas: BitacoraHorasService,
    private readonly notas: BitacoraNotasService,
    private readonly resumen: BitacoraResumenService,
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
    const visible = estado.empresaActiva && estado.registrada;
    const hoja = visible
      ? await this.bitacora.hojaDe(req.user.userId, dia)
      : null;
    const [notas, resumen] = visible
      ? await Promise.all([
          this.notas.listar(req.user.userId, dia),
          this.resumen.obtener(req.user.userId, dia),
        ])
      : [[], null];
    return { ...estado, fecha: dia, hoja, notas, resumen };
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

  /** Días y horas en los que la extensión del navegador registra. Administradores y gerentes. */
  @Get('horario')
  horario(@Req() req: Autenticado) {
    return this.extension.obtenerHorario(req.user);
  }

  @Put('horario')
  guardarHorario(@Req() req: Autenticado, @Body() dto: GuardarHorarioDto) {
    return this.extension.guardarHorario(req.user, dto);
  }

  // ───────────────────────── Bolsa de horas (tiempo extra y horas que se deben) ─────────────────────────

  /** Mi saldo, mi tiempo extra y lo que debo. Cualquier persona con la hoja activada. */
  @Get('horas/mi-estado')
  horasMiEstado(@Req() req: Autenticado) {
    return this.horas.estadoPersona(req.user);
  }

  @Post('horas/iniciar')
  horasIniciar(@Req() req: Autenticado) {
    return this.horas.iniciar(req.user);
  }

  @Post('horas/terminar')
  horasTerminar(@Req() req: Autenticado) {
    return this.horas.terminar(req.user);
  }

  /** Anota horas que se deben. La persona las suyas; administradores y gerentes, las de su equipo. */
  @Post('horas/deudas')
  horasAnotarDeuda(@Req() req: Autenticado, @Body() dto: AnotarDeudaDto) {
    return this.horas.anotarDeuda(req.user, dto);
  }

  @Delete('horas/deudas/:id')
  horasAnularDeuda(
    @Req() req: Autenticado,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.horas.anularDeuda(req.user, id);
  }

  /** Saldo del equipo y tiempo extra por aprobar. Administradores y gerentes. */
  @Get('horas/equipo')
  horasEquipo(@Req() req: Autenticado) {
    return this.horas.resumenEquipo(req.user);
  }

  @Put('horas/extras/:id')
  horasResolver(
    @Req() req: Autenticado,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolverExtraDto,
  ) {
    return this.horas.resolverExtra(req.user, id, dto.aprobar, dto.nota);
  }

  /** Extensiones vinculadas a la persona que consulta. */
  @Get('extension')
  estadoExtension(@Req() req: Autenticado) {
    return this.extension.estadoPersona(req.user);
  }

  /** Código de un solo uso (10 minutos) para vincular la extensión. */
  @Post('extension/codigo')
  codigoExtension(@Req() req: Autenticado) {
    return this.extension.crearCodigo(req.user);
  }

  /** La persona desvincula todas sus extensiones. */
  @Delete('extension')
  desvincularExtension(@Req() req: Autenticado) {
    return this.extension.revocarTodas(req.user);
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
      notas: await this.notas.listar(persona.id, dia),
      resumen: await this.resumen.obtener(persona.id, dia),
    };
  }

  // ───────────────────────── Anotaciones de la persona y resumen del día ─────────────────────────

  @Post('notas')
  crearNota(@Req() req: Autenticado, @Body() dto: CrearNotaDto) {
    return this.notas.crear(req.user, dto);
  }

  @Put('notas/:id')
  editarNota(
    @Req() req: Autenticado,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarNotaDto,
  ) {
    return this.notas.editar(req.user, id, dto);
  }

  @Delete('notas/:id')
  eliminarNota(
    @Req() req: Autenticado,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.notas.eliminar(req.user, id);
  }

  /**
   * Genera (o reutiliza) el resumen de un día. La propia persona lo hace sin permiso especial; el de
   * otra persona exige el mismo permiso explícito de «Ver» la bitácora del equipo y deja constancia.
   */
  @Post('resumen')
  async generarResumen(
    @Req() req: Autenticado,
    @Body() dto: GenerarResumenDto,
  ) {
    const dia = this.bitacora.resolverFecha(dto.fecha);
    if (!dto.userId || dto.userId === req.user.userId) {
      const estado = await this.bitacora.estado(req.user);
      if (!estado.empresaActiva || !estado.registrada) {
        throw new ForbiddenException(
          'Tu hoja del día no está activada, así que no hay nada que resumir.',
        );
      }
      return this.resumen.generar({
        userId: req.user.userId,
        companyId: req.user.companyId as number,
        fecha: dia,
        quien: { userId: req.user.userId, nombre: null },
      });
    }
    const companyId = this.empresaDe(req);
    await this.exigirPermisoExplicito(req.user.userId);
    const persona = await this.bitacora.personaDeLaEmpresa(
      companyId,
      dto.userId,
    );
    await this.bitacora.registrarConsulta(req.user.userId, persona.id, dia);
    return this.resumen.generar({
      userId: persona.id,
      companyId,
      fecha: dia,
      quien: { userId: req.user.userId, nombre: null },
    });
  }

  /** Dominios donde la extensión guarda solo el dominio (por defecto + los de la empresa). Administradores y gerentes. */
  @Get('sitios-sensibles')
  sitiosSensibles(@Req() req: Autenticado) {
    return this.extension.obtenerSitiosSensibles(req.user);
  }

  @Put('sitios-sensibles')
  guardarSitiosSensibles(
    @Req() req: Autenticado,
    @Body() dto: GuardarSitiosSensiblesDto,
  ) {
    return this.extension.guardarSitiosSensibles(req.user, dto.dominios);
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
