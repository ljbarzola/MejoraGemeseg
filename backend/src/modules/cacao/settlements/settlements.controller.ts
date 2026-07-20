import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CacaoSettlementsService } from './settlements.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';

@Controller('cacao/settlements')
export class CacaoSettlementsController {
  constructor(private readonly service: CacaoSettlementsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Req() req: any) {
    return this.service.findAll(req.user.companyId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateSettlementDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId, req.user.userId);
  }
}
