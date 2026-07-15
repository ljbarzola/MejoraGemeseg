import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateUserDto, @Req() req: any) {
    return this.usersService.create(dto, req.user.companyId);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Req() req: any, @Query() query: { role?: string; isActive?: string; search?: string }) {
    return this.usersService.findAll(req.user.companyId, query);
  }

  @Get('stats')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  getStats(@Req() req: any) {
    return this.usersService.getStats(req.user.companyId);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  getMe(@Req() req: any) {
    return this.usersService.getMe(req.user.userId);
  }

  @Patch('me/active-agent')
  @UseGuards(AuthGuard('jwt'))
  setActiveAgent(@Req() req: any, @Body() body: { agentId: number | null }) {
    return this.usersService.setActiveAgent(req.user.userId, body.agentId);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  async findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const user = await this.usersService.findOne(id);
    if (req.user.companyId && user.companyId !== req.user.companyId) {
      throw new ForbiddenException('No tienes acceso a este usuario');
    }
    return user;
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto, @Req() req: any) {
    const user = await this.usersService.findOne(id);
    if (req.user.companyId && user.companyId !== req.user.companyId) {
      throw new ForbiddenException('No puedes editar usuarios de otra empresa');
    }
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const user = await this.usersService.findOne(id);
    if (req.user.companyId && user.companyId !== req.user.companyId) {
      throw new ForbiddenException('No puedes eliminar usuarios de otra empresa');
    }
    return this.usersService.remove(id);
  }
}
