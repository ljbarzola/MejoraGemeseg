import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PersonalService } from './personal.service';
import { KanbanService } from './services/kanban.service';
import { CandidateService } from './services/candidate.service';
import { ContractService } from './services/contract.service';
import { CertificationService } from './services/certification.service';
import { LogService } from './services/log.service';
import { CreateKanbanColumnDto, UpdateKanbanColumnDto, ReorderKanbanDto } from './dto/kanban.dto';
import { CreateCandidateDto, UpdateCandidateDto, MoveCandidateDto } from './dto/candidate.dto';
import { CreateContractTemplateDto, UpdateContractDto, GenerateContractDto } from './dto/contract.dto';
import { CreateCertificationDto, UpdateCertificationDto } from './dto/certification.dto';
import { CreateLogTemplateDto, CreateLogEntryDto } from './dto/log.dto';

@Controller('personal')
@UseGuards(AuthGuard('jwt'))
export class PersonalController {
  constructor(
    private readonly personalService: PersonalService,
    private readonly kanbanService: KanbanService,
    private readonly candidateService: CandidateService,
    private readonly contractService: ContractService,
    private readonly certificationService: CertificationService,
    private readonly logService: LogService
  ) {}

  @Get('dashboard')
  getDashboard(@Req() req: any) {
    return this.personalService.getDashboard(req.user.companyId);
  }

  @Get('kanban/columns')
  getColumns(@Req() req: any) {
    return this.kanbanService.getColumns(req.user.companyId);
  }

  @Post('kanban/columns')
  createColumn(@Body() body: CreateKanbanColumnDto, @Req() req: any) {
    return this.kanbanService.createColumn(body, req.user.companyId);
  }

  @Patch('kanban/columns/:id')
  updateColumn(@Param('id') id: string, @Body() body: UpdateKanbanColumnDto, @Req() req: any) {
    return this.kanbanService.updateColumn(+id, body, req.user.companyId);
  }

  @Delete('kanban/columns/:id')
  deleteColumn(@Param('id') id: string, @Req() req: any) {
    return this.kanbanService.deleteColumn(+id, req.user.companyId);
  }

  @Post('kanban/reorder')
  reorderColumns(@Body() body: ReorderKanbanDto, @Req() req: any) {
    return this.kanbanService.reorderColumns(body.columns, req.user.companyId);
  }

  @Get('candidates')
  getCandidates(@Req() req: any, @Query('columnId') columnId?: string) {
    return this.candidateService.findAll(req.user.companyId, columnId ? +columnId : undefined);
  }

  @Get('candidates/:id')
  getCandidate(@Param('id') id: string, @Req() req: any) {
    return this.candidateService.findOne(+id, req.user.companyId);
  }

  @Post('candidates')
  createCandidate(@Body() body: CreateCandidateDto, @Req() req: any) {
    return this.candidateService.create(body, req.user.companyId, req.user.userId);
  }

  @Patch('candidates/:id')
  updateCandidate(@Param('id') id: string, @Body() body: UpdateCandidateDto, @Req() req: any) {
    return this.candidateService.update(+id, body, req.user.companyId);
  }

  @Patch('candidates/:id/move')
  moveCandidate(@Param('id') id: string, @Body() body: MoveCandidateDto, @Req() req: any) {
    return this.candidateService.move(+id, body.columnId, req.user.companyId, req.user.userId);
  }

  @Get('candidates/:id/history')
  getCandidateHistory(@Param('id') id: string, @Req() req: any) {
    return this.candidateService.getHistory(+id, req.user.companyId);
  }

  @Get('contracts/templates')
  getTemplates(@Req() req: any) {
    return this.contractService.getTemplates(req.user.companyId);
  }

  @Post('contracts/templates')
  createTemplate(@Body() body: CreateContractTemplateDto, @Req() req: any) {
    return this.contractService.createTemplate(body, req.user.companyId, req.user.userId);
  }

  @Delete('contracts/templates/:id')
  deleteTemplate(@Param('id') id: string, @Req() req: any) {
    return this.contractService.deleteTemplate(+id, req.user.companyId);
  }

  @Post('contracts/generate')
  generateContract(@Body() body: GenerateContractDto, @Req() req: any) {
    return this.contractService.generateContract(body.candidateId, body.templateId, req.user.companyId, req.user.userId);
  }

  @Get('contracts')
  getContracts(@Req() req: any) {
    return this.contractService.getContracts(req.user.companyId);
  }

  @Patch('contracts/:id')
  updateContract(@Param('id') id: string, @Body() body: UpdateContractDto, @Req() req: any) {
    return this.contractService.updateContract(+id, body, req.user.companyId);
  }

  @Get('certifications')
  getCertifications(@Req() req: any) {
    return this.certificationService.findAll(req.user.companyId);
  }

  @Post('certifications')
  createCertification(@Body() body: CreateCertificationDto, @Req() req: any) {
    return this.certificationService.create(body, req.user.companyId, req.user.userId);
  }

  @Patch('certifications/:id')
  updateCertification(@Param('id') id: string, @Body() body: UpdateCertificationDto, @Req() req: any) {
    return this.certificationService.update(+id, body, req.user.companyId);
  }

  @Delete('certifications/:id')
  deleteCertification(@Param('id') id: string, @Req() req: any) {
    return this.certificationService.delete(+id, req.user.companyId);
  }

  @Get('certifications/alerts')
  getCertificationAlerts(@Req() req: any) {
    return this.certificationService.getAlerts(req.user.companyId);
  }

  @Get('logs/templates')
  getLogTemplates(@Req() req: any) {
    return this.logService.getTemplates(req.user.companyId);
  }

  @Post('logs/templates')
  createLogTemplate(@Body() body: CreateLogTemplateDto, @Req() req: any) {
    return this.logService.createTemplate(body, req.user.companyId, req.user.userId);
  }

  @Delete('logs/templates/:id')
  deleteLogTemplate(@Param('id') id: string, @Req() req: any) {
    return this.logService.deleteTemplate(+id, req.user.companyId);
  }

  @Get('logs/entries')
  getLogEntries(@Req() req: any) {
    return this.logService.getEntries(req.user.companyId);
  }

  @Post('logs/entries')
  createLogEntry(@Body() body: CreateLogEntryDto, @Req() req: any) {
    return this.logService.createEntry(body, req.user.companyId, req.user.userId);
  }

  @Delete('logs/entries/:id')
  deleteLogEntry(@Param('id') id: string, @Req() req: any) {
    return this.logService.deleteEntry(+id, req.user.companyId);
  }

}
