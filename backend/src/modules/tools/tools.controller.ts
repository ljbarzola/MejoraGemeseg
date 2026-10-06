import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { ToolsService } from './tools.service';
import { CreateToolDto } from './dto/create-tool.dto';
import { AssignToolDto } from './dto/assign-tool.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

// Herramientas es una sub-pantalla de Sistemas (/sistemas/herramientas), no una
// sección propia: se gatea con SISTEMAS igual que Agentes y Soporte (decisión
// 2026-10-06). Antes exigía rol ADMIN a secas, y quien tenía Sistemas sin ser
// admin entraba a la pantalla y recibía 403 en todos sus datos.
@Controller('tools')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  @Get()
  @Section('SISTEMAS', 'view')
  findAllTools() {
    return this.toolsService.findAllTools();
  }

  @Post()
  @Section('SISTEMAS', 'write')
  createTool(@Body() dto: CreateToolDto) {
    return this.toolsService.createTool(dto);
  }

  @Delete(':id')
  @Section('SISTEMAS', 'write')
  removeTool(@Param('id', ParseIntPipe) id: number) {
    return this.toolsService.removeTool(id);
  }

  @Get('assignments')
  @Section('SISTEMAS', 'view')
  findAllAssignments(
    @Query('tool') toolFilter?: string,
    @Query('user') userFilter?: string,
  ) {
    return this.toolsService.findAllAssignments(toolFilter, userFilter);
  }

  @Get('users')
  @Section('SISTEMAS', 'view')
  getUsersWithTools() {
    return this.toolsService.getUsersWithTools();
  }

  @Post('assign')
  @Section('SISTEMAS', 'write')
  assignTool(@Body() dto: AssignToolDto, @Req() req: any) {
    return this.toolsService.assignTool(dto, req.user.userId);
  }

  @Patch('assign/:id')
  @Section('SISTEMAS', 'write')
  updateAssignment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssignmentDto,
    @Req() req: any,
  ) {
    return this.toolsService.updateAssignment(id, dto, req.user.userId);
  }

  @Delete('assign/:id')
  @Section('SISTEMAS', 'write')
  removeAssignment(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.toolsService.removeAssignment(id, req.user.userId);
  }

  @Get('assign/:id/audit')
  @Section('SISTEMAS', 'view')
  getAuditLog(@Param('id', ParseIntPipe) id: number) {
    return this.toolsService.getAuditLog(id);
  }
}
