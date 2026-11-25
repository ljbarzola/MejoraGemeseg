import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BadRequestException } from '@nestjs/common';
import { Section } from '../../common/decorators/section.decorator';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { MarketingService } from './marketing.service';
import {
  CreateCampaignDto,
  RegenerarDto,
  UpdateMarketingSettingDto,
  UpdatePieceDto,
} from './dto/create-campaign.dto';

@Controller('marketing')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class MarketingController {
  constructor(private readonly service: MarketingService) {}

  private empresa(req: any): number {
    if (!req.user.companyId) {
      throw new BadRequestException('Entra con un usuario de una empresa para usar Marketing.');
    }
    return req.user.companyId;
  }

  @Get('configuracion')
  @Section('MARKETING', 'view')
  configuracion(@Req() req: any) {
    return this.service.obtenerSetting(this.empresa(req));
  }

  @Put('configuracion')
  @Section('MARKETING', 'write')
  guardarConfiguracion(@Req() req: any, @Body() dto: UpdateMarketingSettingDto) {
    return this.service.guardarSetting(this.empresa(req), dto);
  }

  @Get('piezas/:id')
  @Section('MARKETING', 'view')
  verPieza(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.detalle(this.empresa(req), id);
  }

  @Patch('piezas/:id')
  @Section('MARKETING', 'write')
  editarPieza(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePieceDto) {
    return this.service.actualizarPieza(this.empresa(req), id, dto);
  }

  @Post('piezas/:id/descartar')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  descartarPieza(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.descartarPieza(this.empresa(req), id);
  }

  @Get('piezas/:id/archivo')
  @Section('MARKETING', 'view')
  async archivoPieza(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Res() res: any) {
    const archivo = await this.service.archivoDePieza(this.empresa(req), id);
    res.setHeader('Content-Type', archivo.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(archivo.buffer);
  }

  @Post('piezas/:id/imagen')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  generarImagen(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.generarImagen(this.empresa(req), id, req.user.userId);
  }

  @Get()
  @Section('MARKETING', 'view')
  listar(@Req() req: any) {
    return this.service.listar(this.empresa(req));
  }

  @Post()
  @HttpCode(200)
  @Section('MARKETING', 'write')
  crear(@Req() req: any, @Body() dto: CreateCampaignDto) {
    return this.service.crear(this.empresa(req), req.user.userId, dto);
  }

  @Get('biblioteca')
  @Section('MARKETING', 'view')
  biblioteca(@Req() req: any, @Query('estado') estado?: string) {
    return this.service.listarPiezas(this.empresa(req), estado);
  }

  @Get('envios')
  @Section('MARKETING', 'view')
  listarEnvios(@Req() req: any) {
    return this.service.listarEnvios(this.empresa(req));
  }

  @Post('envios/:id/omitir')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  omitirEnvio(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.omitirEnvio(this.empresa(req), id);
  }

  @Get(':id/envios')
  @Section('MARKETING', 'view')
  enviosDeCampana(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.listarEnvios(this.empresa(req), id);
  }

  @Post(':id/preparar-envios')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  prepararEnvios(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.prepararEnvios(this.empresa(req), id, req.user.userId);
  }

  @Get(':id')
  @Section('MARKETING', 'view')
  detalle(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.detalle(this.empresa(req), id);
  }

  @Post(':id/aprobar')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  aprobar(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.aprobarTodo(this.empresa(req), id, req.user.userId);
  }

  @Post(':id/regenerar')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  regenerar(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: RegenerarDto) {
    return this.service.regenerar(this.empresa(req), id, req.user.userId, dto.feedback);
  }

  @Post(':id/desaprobar')
  @HttpCode(200)
  @Section('MARKETING', 'write')
  desaprobar(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.service.desaprobar(this.empresa(req), id);
  }
}
