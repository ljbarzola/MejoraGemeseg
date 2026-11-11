import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { timingSafeEqual } from 'crypto';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { VigilanteService } from './vigilante.service';
import { GuardarVigilanteConfigDto } from './dto/guardar-vigilante-config.dto';

interface AuthedRequest {
  user: { userId: number; companyId: number };
}

/** Configuración del vigilante y simulación, para RRHH. */
@Controller('personal/vigilante-vencimientos')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class VigilanteController {
  constructor(private readonly service: VigilanteService) {}

  @Get('config')
  @Section('RRHH', 'view')
  config(@Req() req: AuthedRequest) {
    return this.service.getConfig(req.user.companyId);
  }

  @Put('config')
  @Section('RRHH', 'write')
  guardar(@Body() dto: GuardarVigilanteConfigDto, @Req() req: AuthedRequest) {
    return this.service.guardarConfig(req.user.companyId, req.user.userId, dto);
  }

  /** «Probar ahora»: deja un aviso de prueba solo en la campana de quien lo pulsa. */
  @Post('probar')
  @HttpCode(200)
  @Section('RRHH', 'view')
  probar(@Req() req: AuthedRequest) {
    return this.service.probar(req.user.companyId, req.user.userId);
  }
}

/**
 * Punto de entrada para Cloud Scheduler (una vez al día, 7:00 hora de Ecuador). Mismo patrón que
 * TaskRemindersCronController: sin sesión de usuario, protegido con el secreto compartido CRON_SECRET
 * (header `x-cron-secret`); sin CRON_SECRET el endpoint no existe. `?dryRun=true` calcula todo sin
 * dejar ninguna campana.
 */
@Controller('personal/vencimientos-cron')
export class VigilanteCronController {
  constructor(private readonly service: VigilanteService) {}

  @Post('run')
  @HttpCode(200)
  ejecutar(@Headers('x-cron-secret') recibido?: string, @Query('dryRun') dryRun?: string) {
    const esperado = process.env.CRON_SECRET;
    if (!esperado) throw new NotFoundException();
    if (!recibido || !this.iguales(recibido, esperado)) throw new UnauthorizedException();
    return this.service.procesar({ dryRun: dryRun === 'true' });
  }

  private iguales(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }
}
