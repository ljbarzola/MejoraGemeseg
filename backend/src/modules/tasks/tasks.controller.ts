import { Controller, Get, Post, Patch, Body, Param, UseGuards, Req } from '@nestjs/common';
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
  findByProject(@Param('projectId') projectId: string) {
    return this.tasksService.findByProject(+projectId);
  }

  @Get('tasks/:id')
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id') id: string) {
    return this.tasksService.findOne(+id);
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
}
