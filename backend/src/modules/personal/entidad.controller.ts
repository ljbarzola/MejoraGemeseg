import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { EntidadService } from './services/entidad.service';
import { RequisitoDocumentoService } from './services/requisito-documento.service';
import { AsignacionGuardiaService } from './services/asignacion-guardia.service';
import { CumplimientoEntidadService } from './services/cumplimiento-entidad.service';
import { AlertaVencimientoService } from './services/alerta-vencimiento.service';
import { GuardiaContactoService } from './services/guardia-contacto.service';
import { GuardiaFichaPersonalService } from './services/guardia-ficha-personal.service';
import type { UpdateGuardiaFichaPersonalInput } from './services/guardia-ficha-personal.service';
import { PersonalFieldDefinitionService } from './services/personal-field-definition.service';
import { AdministrativeStaffFichaService } from './services/administrative-staff-ficha.service';
import type { UpdateAdministrativeStaffFichaInput } from './services/administrative-staff-ficha.service';
import { CreateEntidadDto, UpdateEntidadDto } from './dto/entidad.dto';
import {
  CreateRequisitoDocumentoDto,
  UpdateRequisitoDocumentoDto,
} from './dto/requisito-documento.dto';
import { CreateAsignacionGuardiaDto } from './dto/asignacion-guardia.dto';
import {
  CreatePersonalFieldDefinitionDto,
  UpdatePersonalFieldDefinitionDto,
} from './dto/personal-field-definition.dto';

@Controller('personal')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class EntidadController {
  constructor(
    private readonly entidadService: EntidadService,
    private readonly requisitoDocumentoService: RequisitoDocumentoService,
    private readonly asignacionGuardiaService: AsignacionGuardiaService,
    private readonly cumplimientoEntidadService: CumplimientoEntidadService,
    private readonly alertaVencimientoService: AlertaVencimientoService,
    private readonly guardiaContactoService: GuardiaContactoService,
    private readonly guardiaFichaPersonalService: GuardiaFichaPersonalService,
    private readonly personalFieldDefinitionService: PersonalFieldDefinitionService,
    private readonly administrativeStaffFichaService: AdministrativeStaffFichaService,
  ) {}

  // ENTIDADES

  @Get('entidades')
  @Section('RRHH', 'view')
  findAllEntidades(@Req() req: any) {
    return this.entidadService.findAll(req.user.companyId);
  }

  @Post('entidades')
  @Section('RRHH', 'write')
  createEntidad(@Body() body: CreateEntidadDto, @Req() req: any) {
    return this.entidadService.create(req.user.companyId, body);
  }

  @Patch('entidades/:id')
  @Section('RRHH', 'write')
  updateEntidad(
    @Param('id') id: string,
    @Body() body: UpdateEntidadDto,
    @Req() req: any,
  ) {
    return this.entidadService.update(+id, req.user.companyId, body);
  }

  @Delete('entidades/:id')
  @Section('RRHH', 'write')
  removeEntidad(@Param('id') id: string, @Req() req: any) {
    return this.entidadService.remove(+id, req.user.companyId);
  }

  // REQUISITOS DE DOCUMENTO

  @Get('requisitos-documento')
  @Section('RRHH', 'view')
  findAllRequisitos(
    @Req() req: any,
    @Query('aplicaA') aplicaA?: string,
    @Query('entidadId') entidadId?: string,
  ) {
    return this.requisitoDocumentoService.findAll(req.user.companyId, {
      aplicaA,
      entidadId: entidadId ? +entidadId : undefined,
    });
  }

  @Post('requisitos-documento')
  @Section('RRHH', 'write')
  createRequisito(@Body() body: CreateRequisitoDocumentoDto, @Req() req: any) {
    return this.requisitoDocumentoService.create(req.user.companyId, body);
  }

  @Patch('requisitos-documento/:id')
  @Section('RRHH', 'write')
  updateRequisito(
    @Param('id') id: string,
    @Body() body: UpdateRequisitoDocumentoDto,
    @Req() req: any,
  ) {
    return this.requisitoDocumentoService.update(+id, req.user.companyId, body);
  }

  @Delete('requisitos-documento/:id')
  @Section('RRHH', 'write')
  removeRequisito(@Param('id') id: string, @Req() req: any) {
    return this.requisitoDocumentoService.remove(+id, req.user.companyId);
  }

  // ASIGNACIONES DE GUARDIAS

  @Get('asignaciones')
  @Section('RRHH', 'view')
  findAllAsignaciones(
    @Req() req: any,
    @Query('cedula') cedula?: string,
    @Query('entidadId') entidadId?: string,
    @Query('activasOnly') activasOnly?: string,
  ) {
    return this.asignacionGuardiaService.findAll(req.user.companyId, {
      cedula,
      entidadId: entidadId ? +entidadId : undefined,
      activasOnly: activasOnly === 'true',
    });
  }

  @Post('asignaciones')
  @Section('RRHH', 'write')
  createAsignacion(@Body() body: CreateAsignacionGuardiaDto, @Req() req: any) {
    return this.asignacionGuardiaService.create(
      req.user.companyId,
      req.user.userId,
      body,
    );
  }

  @Get('asignaciones/guardia/:cedula/historial')
  @Section('RRHH', 'view')
  getHistorial(@Param('cedula') cedula: string, @Req() req: any) {
    return this.asignacionGuardiaService.getHistorial(
      cedula,
      req.user.companyId,
    );
  }

  @Patch('asignaciones/:id/finalizar')
  @Section('RRHH', 'write')
  finalizarAsignacion(
    @Param('id') id: string,
    @Body() body: { fechaFin?: string },
    @Req() req: any,
  ) {
    return this.asignacionGuardiaService.finalizar(
      +id,
      req.user.companyId,
      body?.fechaFin ? new Date(body.fechaFin) : undefined,
    );
  }

  @Delete('asignaciones/:id')
  @Section('RRHH', 'write')
  removeAsignacion(@Param('id') id: string, @Req() req: any) {
    return this.asignacionGuardiaService.remove(+id, req.user.companyId);
  }

  // CUMPLIMIENTO

  @Get('cumplimiento-entidades')
  @Section('RRHH', 'view')
  getComplianceOverview(@Req() req: any) {
    return this.cumplimientoEntidadService.getComplianceOverview(
      req.user.companyId,
    );
  }

  @Get('cumplimiento-entidades/:cedula')
  @Section('RRHH', 'view')
  getComplianceForGuardia(@Param('cedula') cedula: string, @Req() req: any) {
    return this.cumplimientoEntidadService.getComplianceForGuardia(
      req.user.companyId,
      cedula,
    );
  }

  // CONTACTO DEL GUARDIA (correo para recordatorios — desacoplado de
  // AsignacionGuardia, que pasó a ser un historial auto-generado por Drive)

  @Get('guardia-contacto/:cedula')
  @Section('RRHH', 'view')
  getGuardiaContacto(@Param('cedula') cedula: string, @Req() req: any) {
    return this.guardiaContactoService.get(req.user.companyId, cedula);
  }

  @Patch('guardia-contacto/:cedula')
  @Section('RRHH', 'write')
  setGuardiaContacto(
    @Param('cedula') cedula: string,
    @Body() body: { email: string },
    @Req() req: any,
  ) {
    return this.guardiaContactoService.upsert(
      req.user.companyId,
      cedula,
      body?.email,
    );
  }

  // FICHA PERSONAL (datos editables desde la app — teléfono, dirección,
  // contacto de emergencia, etc. — fuente de la verdad del .json que se
  // crea/actualiza en la carpeta del guardia al sincronizar Drive).

  @Get('guardia-ficha/:cedula')
  @Section('RRHH', 'view')
  getGuardiaFicha(@Param('cedula') cedula: string, @Req() req: any) {
    return this.guardiaFichaPersonalService.get(req.user.companyId, cedula);
  }

  @Patch('guardia-ficha/:cedula')
  @Section('RRHH', 'write')
  setGuardiaFicha(
    @Param('cedula') cedula: string,
    @Body() body: UpdateGuardiaFichaPersonalInput,
    @Req() req: any,
  ) {
    return this.guardiaFichaPersonalService.upsert(
      req.user.companyId,
      cedula,
      body,
    );
  }

  // CAMPOS PERSONALIZADOS DE LA FICHA PERSONAL (creables desde la UI por
  // cualquier usuario con acceso al módulo, sin requerir cambio de código)

  @Get('personal-field-definitions')
  @Section('RRHH', 'view')
  findAllPersonalFieldDefinitions(
    @Req() req: any,
    @Query('scope') scope?: string,
  ) {
    return this.personalFieldDefinitionService.findAll(
      req.user.companyId,
      scope,
    );
  }

  @Post('personal-field-definitions')
  @Section('RRHH', 'write')
  createPersonalFieldDefinition(
    @Body() body: CreatePersonalFieldDefinitionDto,
    @Req() req: any,
  ) {
    return this.personalFieldDefinitionService.create(
      req.user.companyId,
      body,
    );
  }

  @Patch('personal-field-definitions/:id')
  @Section('RRHH', 'write')
  updatePersonalFieldDefinition(
    @Param('id') id: string,
    @Body() body: UpdatePersonalFieldDefinitionDto,
    @Req() req: any,
  ) {
    return this.personalFieldDefinitionService.update(
      +id,
      req.user.companyId,
      body,
    );
  }

  @Delete('personal-field-definitions/:id')
  @Section('RRHH', 'write')
  removePersonalFieldDefinition(@Param('id') id: string, @Req() req: any) {
    return this.personalFieldDefinitionService.remove(+id, req.user.companyId);
  }

  // FICHA DE PERSONAL ADMINISTRATIVO (datos editables desde la app —
  // departamento, fecha de ingreso, estado, contacto, etc.)

  @Get('administrativo-ficha/:cedula')
  @Section('RRHH', 'view')
  getAdministrativoFicha(@Param('cedula') cedula: string, @Req() req: any) {
    return this.administrativeStaffFichaService.get(
      req.user.companyId,
      cedula,
    );
  }

  @Patch('administrativo-ficha/:cedula')
  @Section('RRHH', 'write')
  setAdministrativoFicha(
    @Param('cedula') cedula: string,
    @Body() body: UpdateAdministrativeStaffFichaInput,
    @Req() req: any,
  ) {
    return this.administrativeStaffFichaService.upsert(
      req.user.companyId,
      cedula,
      body,
    );
  }

  // RECORDATORIOS DE VENCIMIENTO (envío manual, personalizado por guardia —
  // no hay cron automático: RRHH decide a quién y cuándo notificar).

  @Post('cumplimiento-entidades/guardia/:cedula/enviar-recordatorio')
  @Section('RRHH', 'write')
  enviarRecordatorio(
    @Param('cedula') cedula: string,
    @Body() body: { medio: string },
    @Req() req: any,
  ) {
    return this.alertaVencimientoService.enviarRecordatorio(
      req.user.companyId,
      cedula,
      body?.medio,
    );
  }
}
