import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CacaoUnitConfigService } from './unit-config.service';

@Controller('cacao/unit-config')
export class CacaoUnitConfigController {
  constructor(private readonly service: CacaoUnitConfigService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Req() req: any) {
    return this.service.findAll(req.user.companyId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Body() body: { name: string; displayName: string; kgPerUnit: number; isDefault?: boolean }, @Req() req: any) {
    return this.service.create({ ...body, companyId: req.user.companyId });
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.service.update(Number(id), body, req.user.companyId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  delete(@Param('id') id: string, @Req() req: any) {
    return this.service.delete(Number(id), req.user.companyId);
  }
}
