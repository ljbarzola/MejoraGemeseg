import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
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
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  create(
    @Body()
    body: {
      name: string;
      displayName: string;
      kgPerUnit: number;
      isDefault?: boolean;
    },
    @Req() req: any,
  ) {
    return this.service.create({ ...body, companyId: req.user.companyId });
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.service.update(Number(id), body, req.user.companyId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  delete(@Param('id') id: string, @Req() req: any) {
    return this.service.delete(Number(id), req.user.companyId);
  }
}
