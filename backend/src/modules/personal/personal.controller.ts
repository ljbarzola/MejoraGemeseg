import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PersonalService } from './personal.service';
import { ContractService } from './services/contract.service';
import { TrainingService } from './services/training.service';
import { PersonalAlertsService } from './services/personal-alerts.service';
import {
  CreateContractTemplateDto,
  UpdateContractTemplateDto,
  SaveContractFieldsDto,
  UpdateContractDto,
  GenerateContractDto,
} from './dto/contract.dto';
import {
  CreateTrainingDto,
  UpdateTrainingDto,
  AddTrainingAttachmentDto,
  SetTrainingCompletedDto,
} from './dto/training.dto';

@Controller('personal')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
@Section('RRHH', 'view')
export class PersonalController {
  constructor(
    private readonly personalService: PersonalService,
    private readonly contractService: ContractService,
    private readonly trainingService: TrainingService,
    private readonly personalAlertsService: PersonalAlertsService,
  ) {}

  @Get('dashboard')
  getDashboard(@Req() req: any) {
    return this.personalService.getDashboard(req.user.companyId);
  }

  @Get('contracts/system-fields')
  getContractSystemFields() {
    return this.contractService.getSystemFields();
  }

  @Get('contracts/templates')
  getTemplates(@Req() req: any) {
    return this.contractService.getTemplates(req.user.companyId);
  }

  @Get('contracts/templates/types')
  getContractTemplateTypes(@Req() req: any) {
    return this.contractService.getUsedTypes(req.user.companyId);
  }

  @Get('contracts/templates/:id')
  getTemplate(@Param('id') id: string, @Req() req: any) {
    return this.contractService.getTemplate(+id, req.user.companyId);
  }

  @Post('contracts/templates')
  @Section('RRHH', 'write')
  createTemplate(@Body() body: CreateContractTemplateDto, @Req() req: any) {
    return this.contractService.createTemplate(
      body,
      req.user.companyId,
      req.user.userId,
    );
  }

  @Patch('contracts/templates/:id')
  @Section('RRHH', 'write')
  updateTemplate(
    @Param('id') id: string,
    @Body() body: UpdateContractTemplateDto,
    @Req() req: any,
  ) {
    return this.contractService.updateTemplate(+id, req.user.companyId, body);
  }

  @Post('contracts/templates/:id/download-drive')
  @Section('RRHH', 'write')
  downloadTemplateFromDrive(@Param('id') id: string, @Req() req: any) {
    return this.contractService.downloadFromDrive(+id, req.user.companyId);
  }

  @Get('contracts/templates/:id/detect-variables')
  detectTemplateVariables(@Param('id') id: string, @Req() req: any) {
    return this.contractService.detectVariables(+id, req.user.companyId);
  }

  @Post('contracts/templates/:id/fields')
  @Section('RRHH', 'write')
  saveTemplateFields(
    @Param('id') id: string,
    @Body() body: SaveContractFieldsDto,
    @Req() req: any,
  ) {
    return this.contractService.saveFields(
      +id,
      req.user.companyId,
      body.fields,
    );
  }

  @Delete('contracts/templates/:id')
  @Section('RRHH', 'write')
  deleteTemplate(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.contractService.deleteTemplate(id, req.user.companyId);
  }

  @Get('contracts/autofill')
  getContractAutofill(
    @Req() req: any,
    @Query('templateId') templateId: string,
    @Query('cedula') cedula: string,
    @Query('nombreGuardia') nombreGuardia: string,
  ) {
    return this.contractService.getAutofill(
      +templateId,
      req.user.companyId,
      cedula,
      nombreGuardia || '',
    );
  }

  @Post('contracts/generate')
  @Section('RRHH', 'write')
  generateContract(@Body() body: GenerateContractDto, @Req() req: any) {
    return this.contractService.generateContract(
      body,
      req.user.companyId,
      req.user.userId,
    );
  }

  @Get('contracts')
  getContracts(@Req() req: any) {
    return this.contractService.getContracts(req.user.companyId);
  }

  @Patch('contracts/:id')
  @Section('RRHH', 'write')
  updateContract(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateContractDto,
    @Req() req: any,
  ) {
    return this.contractService.updateContract(id, body, req.user.companyId);
  }

  @Get('trainings')
  getTrainings(@Req() req: any) {
    return this.trainingService.findAll(req.user.companyId);
  }

  @Post('trainings/upload')
  @Section('RRHH', 'write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadTrainingFile(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    return this.trainingService.uploadFile(req.user.companyId, file);
  }

  @Post('trainings')
  @Section('RRHH', 'write')
  createTraining(@Body() body: CreateTrainingDto, @Req() req: any) {
    return this.trainingService.create(body, req.user.companyId, req.user.userId);
  }

  @Patch('trainings/:id')
  @Section('RRHH', 'write')
  updateTraining(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTrainingDto,
    @Req() req: any,
  ) {
    return this.trainingService.update(id, body, req.user.companyId);
  }

  @Delete('trainings/:id')
  @Section('RRHH', 'write')
  deleteTraining(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.trainingService.delete(id, req.user.companyId);
  }

  @Post('trainings/:id/attachments')
  @Section('RRHH', 'write')
  addTrainingAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AddTrainingAttachmentDto,
    @Req() req: any,
  ) {
    return this.trainingService.addAttachment(id, body, req.user.companyId);
  }

  @Delete('trainings/:id/attachments/:attachmentId')
  @Section('RRHH', 'write')
  removeTrainingAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @Req() req: any,
  ) {
    return this.trainingService.removeAttachment(id, attachmentId, req.user.companyId);
  }

  @Patch('trainings/:id/completed')
  @Section('RRHH', 'write')
  setTrainingCompleted(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetTrainingCompletedDto,
    @Req() req: any,
  ) {
    return this.trainingService.setCompleted(id, body.completed, req.user.companyId, req.user.userId);
  }

  // Alertas de capacitaciones (vencidas y por vencer), consumidas desde el
  // dashboard de Personal.
  @Get('alerts')
  getAlerts(@Req() req: any) {
    return this.personalAlertsService.getAlerts(req.user.companyId);
  }
}
