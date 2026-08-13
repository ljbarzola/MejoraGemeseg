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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { ToolsService } from './tools.service';
import { CreateToolDto } from './dto/create-tool.dto';
import { AssignToolDto } from './dto/assign-tool.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

@Controller('tools')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  @Get()
  findAllTools() {
    return this.toolsService.findAllTools();
  }

  @Post()
  createTool(@Body() dto: CreateToolDto) {
    return this.toolsService.createTool(dto);
  }

  @Delete(':id')
  removeTool(@Param('id', ParseIntPipe) id: number) {
    return this.toolsService.removeTool(id);
  }

  @Get('assignments')
  findAllAssignments(
    @Query('tool') toolFilter?: string,
    @Query('user') userFilter?: string,
  ) {
    return this.toolsService.findAllAssignments(toolFilter, userFilter);
  }

  @Get('users')
  getUsersWithTools() {
    return this.toolsService.getUsersWithTools();
  }

  @Post('assign')
  assignTool(@Body() dto: AssignToolDto, @Req() req: any) {
    return this.toolsService.assignTool(dto, req.user.userId);
  }

  @Patch('assign/:id')
  updateAssignment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssignmentDto,
    @Req() req: any,
  ) {
    return this.toolsService.updateAssignment(id, dto, req.user.userId);
  }

  @Delete('assign/:id')
  removeAssignment(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.toolsService.removeAssignment(id, req.user.userId);
  }

  @Get('assign/:id/audit')
  getAuditLog(@Param('id', ParseIntPipe) id: number) {
    return this.toolsService.getAuditLog(id);
  }
}
