import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { CacaoReceivablesService } from './receivables.service';

@Controller('cacao/receivables')
export class CacaoReceivablesController {
  constructor(private readonly service: CacaoReceivablesService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Req() req: any, @Query() query: { status?: string }) {
    return this.service.findAll(req.user.companyId, query);
  }

  @Post(':id/receive')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  receive(@Param('id', ParseIntPipe) id: number, @Body() body: { amount: number; method: string; reference?: string }, @Req() req: any) {
    return this.service.receive(id, body.amount, body.method, body.reference, req.user.companyId);
  }
}
