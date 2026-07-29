import { Controller, Get, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CacaoLotsService } from './lots.service';

@Controller('cacao/lots')
export class CacaoLotsController {
  constructor(private readonly service: CacaoLotsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Req() req: any, @Query() query: { status?: string; qualityId?: string; supplierId?: string }) {
    return this.service.findAll(req.user.companyId, query);
  }

  @Get('next-code')
  @UseGuards(AuthGuard('jwt'))
  nextCode(@Req() req: any) {
    return this.service.getNextCode(req.user.companyId);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.findOne(id, req.user.companyId);
  }
}
