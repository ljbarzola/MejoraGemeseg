import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AgentsService } from './agents.service';
import { CreateAgentDto, UpdateAgentDto } from './dto/agent.dto';

@Controller('admin/agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll() {
    return this.agentsService.findAll();
  }

  @Get('user/:userId')
  @UseGuards(AuthGuard('jwt'))
  findByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.agentsService.findByUser(userId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Body() dto: CreateAgentDto) {
    return this.agentsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAgentDto) {
    return this.agentsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.agentsService.remove(id);
  }

  @Post(':id/assign/:userId')
  @UseGuards(AuthGuard('jwt'))
  assign(@Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number) {
    return this.agentsService.assignToUser(id, userId);
  }

  @Delete(':id/assign/:userId')
  @UseGuards(AuthGuard('jwt'))
  unassign(@Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number) {
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
