import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CacaoReceptionsService } from './receptions.service';
import { CreateReceptionDto } from './dto/create-reception.dto';

@Controller('cacao/receptions')
export class CacaoReceptionsController {
  constructor(private readonly service: CacaoReceptionsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  findAll(
    @Req() req: any,
    @Query() query: { supplierId?: string; from?: string; to?: string },
  ) {
    return this.service.findAll(req.user.companyId, query);
  }

  @Get('qualities')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  findQualities() {
    return this.service.findQualities();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard, SectionPermissionGuard)
  @Roles(UserRole.ADMIN)
  @Section('CACAO', 'write')
  create(@Body() dto: CreateReceptionDto, @Req() req: any) {
    return this.service.create(dto, req.user.companyId, req.user.userId);
  }
}
