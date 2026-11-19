import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TasksService } from './tasks.service';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';

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
      sinProyecto: projectId === 'none',
      projectId:
        projectId && projectId !== 'none' && !isNaN(+projectId)
          ? +projectId
          : undefined,
    });
  }

  // Crea una tarea con proyecto (projectId) o «Sin proyecto» (sin projectId).
  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(
    @Body() dto: CreateTaskDto & { projectId?: number | null },
    @Req() req: any,
  ) {
    const { projectId, ...datos } = dto;
    return this.tasksService.create(
      projectId ? Number(projectId) : null,
      datos as CreateTaskDto,
      req.user.userId,
      req.user.role,
      req.user.companyId ?? null,
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.tasksService.findOne(id, {
      userId: req.user.userId,
      role: req.user.role,
      companyId: req.user.companyId ?? null,
    });
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
    @Req() req: any,
  ) {
    return this.tasksService.update(
      id,
      dto,
      req.user.userId,
      req.user.role,
      req.user.companyId ?? null,
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.tasksService.remove(
      id,
      req.user.userId,
      req.user.role,
      req.user.companyId ?? null,
    );
  }
}
