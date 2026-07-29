import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CacaoShipmentsService } from './shipments.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';

@Controller('cacao/shipments')
export class CacaoShipmentsController {
  constructor(private readonly service: CacaoShipmentsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Req() req: any) {
    return this.service.findAll(req.user.companyId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateShipmentDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId, req.user.userId);
  }
}
