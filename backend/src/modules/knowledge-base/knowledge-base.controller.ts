import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SectionPermissionGuard } from '../../common/guards/section-permission.guard';
import { Section } from '../../common/decorators/section.decorator';
import { KnowledgeBaseService } from './knowledge-base.service';
import { UpdateKnowledgeBaseDto } from './dto/update-knowledge-base.dto';

// Documento institucional que Agente Gemeseg usa como contexto (ver
// backend/src/modules/ai/knowledge-base.util.ts para cómo se filtra por
// sección de permisos). Es una sub-pantalla de Sistemas (/sistemas/base-
// conocimiento), igual que Agentes de IA — mismo criterio (2026-09-29): el
// control de acceso real es la sección SISTEMAS (view para leer, write para
// guardar), no el rol de la cuenta. Antes exigía @Roles(ADMIN) a secas, lo
// que dejaba fuera a cualquier Employee/Manager con permiso de escritura en
// SISTEMAS.
@Controller('company-knowledge-base')
@UseGuards(AuthGuard('jwt'), SectionPermissionGuard)
export class KnowledgeBaseController {
  constructor(private readonly service: KnowledgeBaseService) {}

  @Get()
  @Section('SISTEMAS', 'view')
  get(@Req() req: any) {
    return this.service.get(req.user.companyId);
  }

  @Put()
  @Section('SISTEMAS', 'write')
  update(@Body() dto: UpdateKnowledgeBaseDto, @Req() req: any) {
    return this.service.update(req.user.companyId, req.user.userId, dto.content);
  }
}
