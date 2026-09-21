import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { SurveyService } from './services/survey.service';
import { CreateSurveyDto, SubmitSurveyResponseDto } from './dto/survey.dto';

@Controller('personal/surveys')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  // ==================== GESTIÓN (RRHH) ====================

  @Get()
  @Section('RRHH', 'view')
  findAll(@Req() req: any) {
    return this.surveyService.findAll(req.user.companyId);
  }

  @Post()
  @Section('RRHH', 'write')
  create(@Body() body: CreateSurveyDto, @Req() req: any) {
    return this.surveyService.create(body, req.user.companyId, req.user.userId);
  }

  @Get(':id')
  @Section('RRHH', 'view')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.surveyService.findOne(id, req.user.companyId);
  }

  @Get(':id/results')
  @Section('RRHH', 'view')
  getResults(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.surveyService.getResults(id, req.user.companyId);
  }

  @Get(':id/individual-results')
  @Section('RRHH', 'view')
  getIndividualResults(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.surveyService.getIndividualResults(id, req.user.companyId);
  }

  @Patch(':id/close')
  @Section('RRHH', 'write')
  close(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.surveyService.close(id, req.user.companyId);
  }

  @Delete(':id')
  @Section('RRHH', 'write')
  delete(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.surveyService.delete(id, req.user.companyId);
  }

  // ==================== LADO DEL DESTINATARIO (sin @Section: cualquier
  // empleado con cuenta puede tener encuestas pendientes) ====================

  @Get('pending/mine')
  findPending(@Req() req: any) {
    return this.surveyService.findPendingForUser(req.user.companyId, req.user.userId);
  }

  @Get(':id/respond')
  getForRespondent(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.surveyService.getForRespondent(id, req.user.companyId, req.user.userId);
  }

  @Post(':id/respond')
  submitResponse(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SubmitSurveyResponseDto,
    @Req() req: any,
  ) {
    return this.surveyService.submitResponse(id, body, req.user.companyId, req.user.userId);
  }
}
