import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../../common/guards/section-permission.guard';
import { Section } from '../../../common/decorators/section.decorator';
import { CacaoKardexService } from './kardex.service';

@Controller('cacao/kardex')
export class CacaoKardexController {
  constructor(private readonly service: CacaoKardexService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  findAll(@Req() req: any, @Query() query: { lotId?: string }) {
    return this.service.findAll(req.user.companyId, query);
  }

  @Get(':lotId')
  @UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
  @Section('CACAO', 'view')
  findByLot(@Param('lotId', ParseIntPipe) lotId: number, @Req() req: any) {
    return this.service.findByLot(lotId, req.user.companyId);
  }
}
