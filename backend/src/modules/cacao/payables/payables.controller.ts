import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CacaoPayablesService } from './payables.service';

@Controller('cacao/payables')
export class CacaoPayablesController {
  constructor(private readonly service: CacaoPayablesService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Req() req: any, @Query() query: { status?: string }) {
    return this.service.findAll(req.user.companyId, query);
  }

  @Post(':id/pay')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  pay(@Param('id', ParseIntPipe) id: number, @Body() body: { amount: number; method: string; reference?: string }, @Req() req: any) {
    return this.service.pay(id, body.amount, body.method, body.reference, req.user.companyId);
  }
}
