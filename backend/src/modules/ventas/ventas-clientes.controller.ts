import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { VentasClientesService } from './ventas-clientes.service';
import {
  CreateSalesClientDto,
  UpdateSalesClientDto,
  CreateSalesClientFieldDto,
} from './dto/client.dto';

@Controller('ventas/clientes')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class VentasClientesController {
  constructor(private readonly clientesService: VentasClientesService) {}

  @Get('fields')
  @Section('VENTAS', 'view')
  listFields(@Req() req: any) {
    return this.clientesService.listFields(req.user.companyId);
  }

  @Post('fields')
  @Section('VENTAS', 'write')
  addField(@Req() req: any, @Body() dto: CreateSalesClientFieldDto) {
    return this.clientesService.addField(req.user.companyId, dto);
  }

  @Delete('fields/:id')
  @Section('VENTAS', 'write')
  deleteField(@Req() req: any, @Param('id') id: string) {
    return this.clientesService.deleteField(req.user.companyId, +id);
  }

  @Get()
  @Section('VENTAS', 'view')
  list(@Req() req: any) {
    return this.clientesService.listClients(req.user.companyId);
  }

  @Get(':id')
  @Section('VENTAS', 'view')
  getOne(@Req() req: any, @Param('id') id: string) {
    return this.clientesService.getClient(req.user.companyId, +id);
  }

  @Post()
  @Section('VENTAS', 'write')
  create(@Req() req: any, @Body() dto: CreateSalesClientDto) {
    return this.clientesService.createClient(
      req.user.companyId,
      req.user.userId,
      dto,
    );
  }

  @Patch(':id')
  @Section('VENTAS', 'write')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateSalesClientDto,
  ) {
    return this.clientesService.updateClient(req.user.companyId, +id, dto);
  }

  @Delete(':id')
  @Section('VENTAS', 'write')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.clientesService.deleteClient(req.user.companyId, +id);
  }
}
