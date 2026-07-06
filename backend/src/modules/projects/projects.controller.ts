import { Controller, Get, Post, Patch, Delete, Body, Query, Param, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProjectsService } from './projects.service';
import { TasksService } from '../tasks/tasks.service';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsDto } from './dto/list-projects.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly tasksService: TasksService,
  ) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Body() dto: CreateProjectDto, @Req() req: any) {
    return this.projectsService.create(dto, req.user.userId, req.user.role);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Req() req: any, @Query() query: ListProjectsDto) {
    return this.projectsService.findAll(req.user.userId, req.user.role, query);
  }

  @Get('admin/stats')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminStats() {
    return this.projectsService.getAdminStats();
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateProjectDto,
    @Req() req: any,
  ) {
    return this.projectsService.update(id, dto, req.user.userId, req.user.role);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.projectsService.remove(id, req.user.userId, req.user.role);
  }

  @Get(':projectId/tasks')
  @UseGuards(AuthGuard('jwt'))
  getProjectTasks(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.tasksService.findByProject(projectId);
  }

  @Post(':projectId/tasks')
  @UseGuards(AuthGuard('jwt'))
  createTask(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateTaskDto,
    @Req() req: any,
  ) {
    return this.tasksService.create(projectId, dto, req.user.userId, req.user.role);
  }

  @Get(':projectId/members')
  @UseGuards(AuthGuard('jwt'))
  getProjectMembers(@Param('projectId', ParseIntPipe) projectId: number) {
    return this.tasksService.getProjectMembers(projectId);
  }

  @Post(':projectId/members')
  @UseGuards(AuthGuard('jwt'))
  addMember(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: { userId: number; role: string },
    @Req() req: any,
  ) {
    return this.projectsService.addMember(projectId, body.userId, body.role, req.user.userId, req.user.role);
  }

  @Delete(':projectId/members/:userId')
  @UseGuards(AuthGuard('jwt'))
  removeMember(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: any,
  ) {
    return this.projectsService.removeMember(projectId, userId, req.user.userId, req.user.role);
  }

  @Patch(':projectId/members/:userId/role')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  updateMemberRole(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { role: string },
    @Req() req: any,
  ) {
    return this.projectsService.updateMemberRole(projectId, userId, body.role, req.user.userId, req.user.role);
  }
}
