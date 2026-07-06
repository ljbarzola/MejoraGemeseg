import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { ToolsService } from './tools.service';
import { CreateToolDto } from './dto/create-tool.dto';
import { AssignToolDto } from './dto/assign-tool.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

@Controller('tools')
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAllTools() {
    return this.toolsService.findAllTools();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  createTool(@Body() dto: CreateToolDto) {
    return this.toolsService.createTool(dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  removeTool(@Param('id', ParseIntPipe) id: number) {
    return this.toolsService.removeTool(id);
  }

  @Get('assignments')
  @UseGuards(AuthGuard('jwt'))
  findAllAssignments(
    @Query('tool') toolFilter?: string,
    @Query('user') userFilter?: string,
  ) {
    return this.toolsService.findAllAssignments(toolFilter, userFilter);
  }

  @Get('users')
  @UseGuards(AuthGuard('jwt'))
  getUsersWithTools() {
    return this.toolsService.getUsersWithTools();
  }

  @Post('assign')
  @UseGuards(AuthGuard('jwt'))
  assignTool(@Body() dto: AssignToolDto, @Req() req: any) {
    return this.toolsService.assignTool(dto, req.user.userId);
  }

  @Patch('assign/:id')
  @UseGuards(AuthGuard('jwt'))
  updateAssignment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssignmentDto,
    @Req() req: any,
  ) {
    return this.toolsService.updateAssignment(id, dto, req.user.userId);
  }

  @Delete('assign/:id')
  @UseGuards(AuthGuard('jwt'))
  removeAssignment(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.toolsService.removeAssignment(id, req.user.userId);
  }

  @Get('assign/:id/audit')
  @UseGuards(AuthGuard('jwt'))
  getAuditLog(@Param('id', ParseIntPipe) id: number) {
    return this.toolsService.getAuditLog(id);
  }
}
