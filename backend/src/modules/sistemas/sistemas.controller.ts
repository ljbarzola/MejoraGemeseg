import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SistemasService } from './sistemas.service';
import {
  CreateTicketSoporteDto,
  UpdateTicketSoporteEstadoDto,
} from './dto/ticket-soporte.dto';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';

@Controller('sistemas/tickets')
@UseGuards(AuthGuard('jwt'))
export class SistemasController {
  private readonly logger = new Logger(SistemasController.name);

  constructor(private readonly service: SistemasService) {}

  // Sin guard de sección a propósito: cualquier usuario autenticado debe poder
  // reportar un problema a Sistemas, tenga o no acceso al módulo Sistemas.
  @Post()
  async create(@Body() dto: CreateTicketSoporteDto, @Req() req: any) {
    try {
      return await this.service.createTicket(
        req.user.companyId ?? null,
        req.user.userId,
        dto,
      );
    } catch (err: any) {
      this.logger.error(`Error al crear ticket: ${err.message}`, err.stack);
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        'No se pudo crear el ticket. Verifica los datos e intenta de nuevo.',
      );
    }
  }

  @Get()
  @UseGuards(SectionPermissionGuard)
  @Section('SISTEMAS', 'view')
  async findAll() {
    try {
      return await this.service.findAll();
    } catch (err: any) {
      this.logger.error(`Error al listar tickets: ${err.message}`, err.stack);
      throw new BadRequestException('No se pudieron cargar los tickets.');
    }
  }

  @Patch(':id/estado')
  @UseGuards(SectionPermissionGuard)
  @Section('SISTEMAS', 'write')
  async updateEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketSoporteEstadoDto,
  ) {
    try {
      return await this.service.updateEstado(id, dto.estado);
    } catch (err: any) {
      this.logger.error(`Error al actualizar ticket: ${err.message}`, err.stack);
      throw new BadRequestException('No se pudo actualizar el ticket.');
    }
  }
}
