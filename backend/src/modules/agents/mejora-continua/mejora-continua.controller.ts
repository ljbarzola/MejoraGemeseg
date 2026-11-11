import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { timingSafeEqual } from 'crypto';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { MejoraContinuaService, UsuarioSolicitante } from './mejora-continua.service';

type Cuerpo = Record<string, unknown>;

function quienEs(req: { user: { userId: number; companyId?: number | null } }): UsuarioSolicitante {
  return { userId: req.user.userId, companyId: req.user.companyId ?? null };
}

/**
 * Pantalla Sistemas → Mejora continua. Se gatea con SISTEMAS (como el resto de
 * Sistemas): ver las propuestas es «view»; decidir, pasar a en curso o hecha es «write».
 */
@Controller('admin/mejora-continua')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class MejoraContinuaAdminController {
  constructor(private readonly servicio: MejoraContinuaService) {}

  @Get()
  @Section('SISTEMAS', 'view')
  panel(@Req() req: any) {
    return this.servicio.panel(quienEs(req));
  }

  @Get('tarjeta')
  @Section('SISTEMAS', 'view')
  tarjeta(@Req() req: any) {
    return this.servicio.tarjetaDashboard(quienEs(req));
  }

  @Post(':id/decision')
  @HttpCode(200)
  @Section('SISTEMAS', 'write')
  async decidir(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Cuerpo,
  ) {
    const decisor = await this.servicio.decisorDe(req.user.userId);
    return this.servicio.decidir(
      id,
      String(body.accion ?? ''),
      { motivo: body.motivo, comentario: body.comentario },
      decisor,
      quienEs(req),
    );
  }

  @Post(':id/progreso')
  @HttpCode(200)
  @Section('SISTEMAS', 'write')
  async progreso(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Cuerpo,
  ) {
    const decisor = await this.servicio.decisorDe(req.user.userId);
    return this.servicio.cambiarProgreso(
      id,
      String(body.estado ?? ''),
      { horasAhorradasMes: body.horasAhorradasMes },
      decisor,
      quienEs(req),
    );
  }

  @Get(':id/brief')
  @Section('SISTEMAS', 'view')
  brief(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.servicio.brief(id, quienEs(req));
  }
}

function comparar(recibido: string | undefined, esperado: string | undefined): void {
  // Sin la variable configurada el endpoint no existe (mismo patrón que CRON_SECRET).
  if (!esperado) throw new NotFoundException();
  if (!recibido) throw new UnauthorizedException();
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
}

/**
 * Puerta de las rutinas de Claude (lunes y viernes). Sin sesión de usuario: se protege con
 * la clave MEJORA_CONTINUA_KEY (cabecera `x-mejora-key`). Esa clave SOLO sirve para leer la
 * memoria y dejar propuestas o resúmenes; NO puede aprobar ni rechazar nada. Decidir desde una
 * sesión interactiva de Claude exige otra clave distinta (MEJORA_CONTINUA_DECISION_KEY) que
 * las rutinas nunca reciben: así el «human in the loop» no se puede saltar desde una rutina.
 */
@Controller('mejora-continua')
export class MejoraContinuaRutinasController {
  constructor(private readonly servicio: MejoraContinuaService) {}

  @Get('memoria')
  memoria(@Headers('x-mejora-key') clave?: string) {
    comparar(clave, process.env.MEJORA_CONTINUA_KEY);
    return this.servicio.memoria();
  }

  @Post('propuestas')
  @HttpCode(200)
  propuestas(
    @Headers('x-mejora-key') clave: string | undefined,
    @Body() body: Cuerpo,
    @Query('dryRun') dryRun?: string,
  ) {
    comparar(clave, process.env.MEJORA_CONTINUA_KEY);
    return this.servicio.recibirPropuestas(body ?? {}, { dryRun: dryRun === 'true' });
  }

  @Post('cierre')
  @HttpCode(200)
  cierre(
    @Headers('x-mejora-key') clave: string | undefined,
    @Body() body: Cuerpo,
    @Query('dryRun') dryRun?: string,
  ) {
    comparar(clave, process.env.MEJORA_CONTINUA_KEY);
    return this.servicio.recibirCierre(body ?? {}, { dryRun: dryRun === 'true' });
  }

  @Post('propuestas/:id/revision')
  @HttpCode(200)
  revision(
    @Headers('x-mejora-key') clave: string | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Cuerpo,
  ) {
    comparar(clave, process.env.MEJORA_CONTINUA_KEY);
    return this.servicio.revisarPlan(id, body ?? {});
  }

  // Desde una sesión interactiva de Claude: Leidy dice «aprueba la 2» y Claude lo deja registrado.
  @Post('propuestas/:id/decision')
  @HttpCode(200)
  decisionDesdeClaude(
    @Headers('x-mejora-decision-key') clave: string | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Cuerpo,
  ) {
    comparar(clave, process.env.MEJORA_CONTINUA_DECISION_KEY);
    return this.servicio.decidir(
      id,
      String(body?.accion ?? ''),
      { motivo: body?.motivo, comentario: body?.comentario },
      { id: null, nombre: 'Decidido desde Claude (a pedido de la persona)' },
    );
  }

  @Get('propuestas/:id/brief')
  brief(
    @Headers('x-mejora-decision-key') clave: string | undefined,
    @Param('id', ParseIntPipe) id: number,
  ) {
    comparar(clave, process.env.MEJORA_CONTINUA_DECISION_KEY);
    return this.servicio.brief(id);
  }
}
