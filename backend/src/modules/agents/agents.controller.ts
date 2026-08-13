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
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AgentsService } from './agents.service';
import { CreateAgentDto, UpdateAgentDto } from './dto/agent.dto';

@Controller('admin/agents')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  findAll() {
    return this.agentsService.findAll();
  }

  @Get('catalog')
  findAllAgents() {
    return this.agentsService.findAllAgents();
  }

  @Get('assignments')
  findAllAssignments() {
    return this.agentsService.findAllAssignments();
  }

  @Get('user/:userId')
  findByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.agentsService.findByUser(userId);
  }

  @Post()
  create(@Body() dto: CreateAgentDto) {
    return this.agentsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAgentDto) {
    return this.agentsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.agentsService.remove(id);
  }

  @Post(':id/assign/:userId')
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.agentsService.assignToUser(id, userId);
  }

  @Delete(':id/assign/:userId')
  unassign(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.agentsService.unassignFromUser(id, userId);
  }
}

@Controller('agents')
export class AgentsUserController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get('available')
  @UseGuards(AuthGuard('jwt'))
  getAvailable(@Req() req: any) {
    return this.agentsService.getAvailableForUser(req.user.userId);
  }
}
