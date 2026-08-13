import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const ALL_SECTIONS = [
  { key: 'DASHBOARD', label: 'Dashboard', alwaysEnabled: true },
  { key: 'PROJECTS', label: 'Proyectos', alwaysEnabled: true },
  { key: 'ADMIN', label: 'Administración', alwaysEnabled: true },
  { key: 'TOOLS', label: 'Herramientas', alwaysEnabled: true },
  { key: 'AGENTS', label: 'Agentes de IA', alwaysEnabled: true },
  { key: 'CACAO', label: 'Cacao', alwaysEnabled: false },
  { key: 'COMPANY_SETTINGS', label: 'Mi Empresa', alwaysEnabled: false },
  { key: 'COMPANIES', label: 'Empresas', alwaysEnabled: false },
  { key: 'CUSTODIAS', label: 'Custodias', alwaysEnabled: false },
  { key: 'PERSONAL', label: 'Personal', alwaysEnabled: false },
  { key: 'VENTAS', label: 'Ventas y CRM', alwaysEnabled: false },
];

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  isSuperAdmin(user: any): boolean {
    return user.role === 'ADMIN' && !user.companyId;
  }

  async getCompanySections(companyId: number) {
    const db = await this.prisma.companySection.findMany({
      where: { companyId },
      select: { section: true },
    });
    const dbSections = db.map((s) => s.section);
    return ALL_SECTIONS.map((s) => ({
      ...s,
      enabled: s.alwaysEnabled || dbSections.includes(s.key),
    }));
  }

  async setCompanySections(companyId: number, sections: string[]) {
    const alwaysOn = ALL_SECTIONS.filter((s) => s.alwaysEnabled).map((s) => s.key);
    const allowed = [...new Set([...alwaysOn, ...sections])];

    await this.prisma.companySection.deleteMany({ where: { companyId } });
    if (allowed.length > 0) {
      await this.prisma.companySection.createMany({
        data: allowed.map((section) => ({ companyId, section })),
      });
    }
    return this.getCompanySections(companyId);
  }

  async getUserPermissions(userId: number) {
    const perms = await this.prisma.userPermission.findMany({
      where: { userId },
      select: { section: true, canView: true, canWrite: true },
    });
    return perms;
  }

  async getUserPermissionsForCompany(companyId: number) {
    const users = await this.prisma.user.findMany({
      where: { companyId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        permissions: {
          select: { section: true, canView: true, canWrite: true },
        },
      },
      orderBy: { fullName: 'asc' },
    });
    return users;
  }

  async setUserPermissions(
    userId: number,
    permissions: { section: string; canView: boolean; canWrite: boolean }[],
  ) {
    await this.prisma.userPermission.deleteMany({ where: { userId } });
    if (permissions.length > 0) {
      await this.prisma.userPermission.createMany({
        data: permissions.map((p) => ({
          userId,
          section: p.section,
          canView: p.canView,
          canWrite: p.canWrite,
        })),
      });
    }
    return this.getUserPermissions(userId);
  }

  async getMyPermissions(userId: number, companyId: number | null) {
    if (!companyId) {
      return { isSuperAdmin: true, sections: ALL_SECTIONS.map((s) => s.key), permissions: [] };
    }
    const companySections = await this.getCompanySections(companyId);
    const enabledSections = companySections.filter((s) => s.enabled).map((s) => s.key);
    const userPerms = await this.getUserPermissions(userId);
    return {
      isSuperAdmin: false,
      sections: enabledSections,
      permissions: userPerms,
    };
  }
}
