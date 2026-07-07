import { Controller, Get, Patch, Delete, Param, Body, Query, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TasksService } from './tasks.service';
import { UpdateTaskDto } from './dto/update-task.dto';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('my-tasks')
  @UseGuards(AuthGuard('jwt'))
  findMyTasks(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('assignedToMe') assignedToMe?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.tasksService.findMyTasks(req.user.userId, {
      status,
      assignedToMe: assignedToMe === 'true',
      projectId: projectId ? +projectId : undefined,
    });
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tasksService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
    @Req() req: any,
  ) {
    return this.tasksService.update(id, dto, req.user.userId, req.user.role);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.tasksService.remove(id, req.user.userId, req.user.role);
  }
}
