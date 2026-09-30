import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ALL_SECTIONS } from '../permissions/permissions.service';
import { findUnknownHeadings } from '../ai/knowledge-base.util';

@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly prisma: PrismaService) {}

  async get(companyId: number | null) {
    if (!companyId) throw new ForbiddenException('Requiere una empresa asociada');
    const kb = await this.prisma.companyKnowledgeBase.findUnique({
      where: { companyId },
    });
    return { content: kb?.content || '' };
  }

  async update(companyId: number | null, userId: number, content: string) {
    if (!companyId) throw new ForbiddenException('Requiere una empresa asociada');

    await this.prisma.companyKnowledgeBase.upsert({
      where: { companyId },
      create: { companyId, content, updatedByUserId: userId },
      update: { content, updatedByUserId: userId },
    });

    const warnings = findUnknownHeadings(
      content,
      ALL_SECTIONS.map((s) => s.key),
    );

    return { content, warnings };
  }
}
