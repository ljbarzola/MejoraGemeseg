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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VentasTemplatesService } from './ventas-templates.service';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';

@Controller('ventas/templates')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class VentasTemplatesController {
  constructor(private readonly templatesService: VentasTemplatesService) {}

  @Get()
  @Section('VENTAS', 'view')
  list(@Req() req: any) {
    return this.templatesService.listTemplates(req.user.companyId);
  }

  @Get(':id')
  @Section('VENTAS', 'view')
  get(@Param('id') id: string, @Req() req: any) {
    return this.templatesService.getTemplate(+id, req.user.companyId);
  }

  @Post()
  @Section('VENTAS', 'write')
  create(@Req() req: any, @Body() body: any) {
    return this.templatesService.createTemplate(
      req.user.companyId,
      req.user.userId,
      body,
    );
  }

  @Patch(':id')
  @Section('VENTAS', 'write')
  update(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.templatesService.updateTemplate(+id, req.user.companyId, body);
  }

  @Delete(':id')
  @Section('VENTAS', 'write')
  delete(@Param('id') id: string, @Req() req: any) {
    return this.templatesService.deleteTemplate(+id, req.user.companyId);
  }

  @Post(':id/download-drive')
  @Section('VENTAS', 'write')
  downloadDrive(@Param('id') id: string, @Req() req: any) {
    return this.templatesService.downloadFromDrive(+id, req.user.companyId);
  }

  @Post(':id/detect-variables')
  @Section('VENTAS', 'write')
  detectVariables(@Param('id') id: string, @Req() req: any) {
    return this.templatesService.detectVariables(+id, req.user.companyId);
  }

  @Post(':id/fields')
  @Section('VENTAS', 'write')
  saveFields(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { fields: any[] },
  ) {
    return this.templatesService.saveFields(
      +id,
      req.user.companyId,
      body.fields,
    );
  }

}
