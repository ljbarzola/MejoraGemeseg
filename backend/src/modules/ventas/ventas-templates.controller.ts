import {
  Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VentasTemplatesService } from './ventas-templates.service';

@Controller('ventas/templates')
@UseGuards(AuthGuard('jwt'))
export class VentasTemplatesController {
  constructor(private readonly templatesService: VentasTemplatesService) {}

  @Get()
  list(@Req() req: any) {
    return this.templatesService.listTemplates(req.user.companyId);
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: any) {
    return this.templatesService.getTemplate(+id, req.user.companyId);
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.templatesService.createTemplate(req.user.companyId, req.user.userId, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.templatesService.updateTemplate(+id, req.user.companyId, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: any) {
    return this.templatesService.deleteTemplate(+id, req.user.companyId);
  }

  @Post(':id/download-drive')
  downloadDrive(@Param('id') id: string, @Req() req: any) {
    return this.templatesService.downloadFromDrive(+id, req.user.companyId);
  }

  @Post(':id/detect-variables')
  detectVariables(@Param('id') id: string, @Req() req: any) {
    return this.templatesService.detectVariables(+id, req.user.companyId);
  }

  @Post(':id/fields')
  saveFields(@Param('id') id: string, @Req() req: any, @Body() body: { fields: any[] }) {
    return this.templatesService.saveFields(+id, req.user.companyId, body.fields);
  }

  @Post(':id/sync-boldsign')
  syncBoldSign(@Param('id') id: string, @Req() req: any) {
    return this.templatesService.syncToBoldSign(+id, req.user.companyId);
  }
}
