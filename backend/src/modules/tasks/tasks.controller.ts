import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('projects/:projectId/tasks')
  @UseGuards(AuthGuard('jwt'))
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTaskDto,
    @Req() req: any,
  ) {
    return this.tasksService.create(+projectId, dto, req.user.userId);
  }

  @Get('projects/:projectId/tasks')
  @UseGuards(AuthGuard('jwt'))
  findByProject(
    @Param('projectId') projectId: string,
    @Req() req: any,
  ) {
    return this.tasksService.findByProject(+projectId, req.user.userId);
  }

  @Get('projects/:projectId/members')
  @UseGuards(AuthGuard('jwt'))
  getProjectMembers(
    @Param('projectId') projectId: string,
    @Req() req: any,
  ) {
    return this.tasksService.getProjectMembers(+projectId, req.user.userId);
  }

  @Get('tasks/:id')
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.tasksService.findOne(+id, req.user.userId);
  }

  @Patch('tasks/:id')
  @UseGuards(AuthGuard('jwt'))
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @Req() req: any,
  ) {
    return this.tasksService.update(+id, dto, req.user.userId);
  }

  @Delete('tasks/:id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id') id: string, @Req() req: any) {
    return this.tasksService.remove(+id, req.user.userId);
  }
}
