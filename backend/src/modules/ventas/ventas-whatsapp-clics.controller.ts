import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { VentasWhatsappClicsService } from './ventas-whatsapp-clics.service';
import { VentasLeadsService } from './ventas-leads.service';
import { EnlazarCodigoDto, EscribioDto } from './dto/whatsapp-clic.dto';
import { LimitePorIp } from './whatsapp-clics.util';

// Registro del clic desde el navegador de quien visita la landing: SIN sesión. Lo protege la clave pública
// de la landing (no la X-API-KEY secreta), el formato del código, el CORS de esta ruta (solo los dominios
// de las landings, ver main.ts) y un límite por IP.
@Controller('ventas/whatsapp')
export class VentasWhatsappClicPublicoController {
  private readonly limite = new LimitePorIp();

  constructor(private readonly clics: VentasWhatsappClicsService) {}

  @Post('clic')
  @HttpCode(200)
  registrar(@Req() req: any, @Body() body: any) {
    const reenviada = (req.headers?.['x-forwarded-for'] ?? '').toString().split(',')[0].trim();
    const ip = reenviada || req.ip || 'desconocida';
    if (!this.limite.permitir(ip)) {
      throw new HttpException('Demasiadas solicitudes', HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.clics.registrar((body?.site_key ?? '').toString().trim(), body ?? {});
  }
}

// Lista de clics (ventana de «Llegó un WhatsApp» y del Dashboard), «Llegó un WhatsApp» y Configuración → Conexiones (la clave pública que lleva el
// script de las landings y cuántos clics llegaron).
@Controller('ventas/whatsapp-clics')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class VentasWhatsappClicsController {
  constructor(
    private readonly clics: VentasWhatsappClicsService,
    private readonly leads: VentasLeadsService,
  ) {}

  // Cada clic con el punto del recorrido en que va (clic, escribió, etapa de su oportunidad, venta, perdida).
  @Get()
  @Section('VENTAS', 'view')
  listar(@Req() req: any) {
    return this.clics.listar(req.user.companyId);
  }

  // «Llegó un WhatsApp»: busca el clic de un código (antes de crear el posible cliente).
  @Get('buscar')
  @Section('VENTAS', 'view')
  buscar(@Req() req: any, @Query('codigo') codigo: string) {
    return this.clics.buscarPorCodigo(req.user.companyId, codigo);
  }

  // «Escribió»: el vendedor vio llegar el mensaje con el código y da los datos de contacto. Nace el posible cliente
  // con fuente WhatsApp y la atribución del clic (el mismo camino que el «Código del mensaje» de Nuevo posible cliente).
  @Post(':id/escribio')
  @Section('VENTAS', 'write')
  async escribio(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EscribioDto,
  ) {
    const codigo = await this.clics.codigoLibre(req.user.companyId, id);
    const lead = await this.leads.crearManual(req.user.companyId, req.user.userId, {
      ...dto,
      channel: 'WHATSAPP',
      codigoMensaje: codigo,
    });
    return { success: true, leadId: lead.id };
  }

  // «Enlazar código» a un posible cliente que ya existe (el código apareció después de crearlo).
  @Post('enlazar')
  @HttpCode(200)
  @Section('VENTAS', 'write')
  enlazar(@Req() req: any, @Body() dto: EnlazarCodigoDto) {
    return this.clics.enlazarALead(req.user.companyId, req.user.userId, dto.leadId, dto.codigo);
  }

  // Las ciudades (Guayaquil, Loja...) con sus números de WhatsApp, y los números con clics que aún no tienen ciudad.
  @Get('ciudades')
  @Section('VENTAS', 'view')
  ciudades(@Req() req: any) {
    return this.clics.ciudadesDeLanding(req.user.companyId);
  }

  @Put('ciudades')
  @Section('VENTAS', 'write')
  guardarCiudades(@Req() req: any, @Body() body: { ciudades?: unknown }) {
    return this.clics.guardarCiudades(req.user.companyId, body?.ciudades);
  }

  // La clave se crea la primera vez que se pide.
  @Get('clave')
  @Section('VENTAS', 'view')
  clave(@Req() req: any) {
    return this.clics.resumenDeLanding(req.user.companyId);
  }
}
