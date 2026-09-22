import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// `alwaysEnabled`  = la EMPRESA la tiene activa siempre (no hace falta que un
//                     super admin la encienda).
// `siempreVisible` = además, NO se puede negar usuario por usuario. Son la
//                     pantalla de inicio y los canales abiertos a cualquier
//                     empleado; negárselos a alguien lo dejaba sin ningún
//                     lugar a donde entrar (ver el bucle de redirección del
//                     2026-09-22 en .agents/modules/recursos-humanos.md).
//                     Quejas y Encuestas ya estaban abiertas a nivel de ruta.
export const ALL_SECTIONS = [
  { key: 'DASHBOARD', label: 'Inicio', alwaysEnabled: true, siempreVisible: true },
  { key: 'PROJECTS', label: 'Proyectos', alwaysEnabled: true, siempreVisible: true },
  { key: 'ADMIN', label: 'Administración', alwaysEnabled: true },
  { key: 'TOOLS', label: 'Herramientas', alwaysEnabled: true },
  { key: 'CACAO', label: 'Cacao', alwaysEnabled: false },
  { key: 'COMPANY_SETTINGS', label: 'Mi Empresa', alwaysEnabled: false },
  { key: 'COMPANIES', label: 'Empresas', alwaysEnabled: false },
  { key: 'CUSTODIAS', label: 'Custodias', alwaysEnabled: false },
  { key: 'RRHH', label: 'Recursos Humanos', alwaysEnabled: false },
  { key: 'VENTAS', label: 'Ventas y CRM', alwaysEnabled: false },
  // alwaysEnabled: Herramientas y Agentes vivían sueltas en el menú como
  // secciones siempre activas (TOOLS/AGENTS) hasta que se agruparon dentro de
  // Sistemas. Si Sistemas fuera opt-in, esas dos pantallas quedarían
  // inalcanzables para toda empresa existente hasta que un super admin
  // activara la sección a mano — que es exactamente lo que pasó al publicarla.
  { key: 'SISTEMAS', label: 'Sistemas', alwaysEnabled: true },
];

/** Secciones que no se pueden negar usuario por usuario (ver ALL_SECTIONS). */
export const SECCIONES_SIEMPRE_VISIBLES: string[] = ALL_SECTIONS.filter(
  (s) => (s as { siempreVisible?: boolean }).siempreVisible,
).map((s) => s.key);

export function esSeccionSiempreVisible(section: string): boolean {
  return SECCIONES_SIEMPRE_VISIBLES.includes(section);
}

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  isSuperAdmin(user: any): boolean {
    return user.role === 'ADMIN' && !user.companyId;
  }

  async getCompanySections(companyId: number) {
    const db = await this.prisma.companySection.findMany({
      where: { companyId },
      select: { section: true, fixedForAll: true },
    });
    const dbSections = db.map((s) => s.section);
    const fijasEnBd = new Set(
      db.filter((s) => s.fixedForAll).map((s) => s.section),
    );
    return ALL_SECTIONS.map((s) => {
      const siempre = esSeccionSiempreVisible(s.key);
      return {
        ...s,
        enabled: s.alwaysEnabled || dbSections.includes(s.key),
        // Fija = o el producto la define así en código, o la empresa la marcó.
        fixedForAll: siempre || fijasEnBd.has(s.key),
        // Las de código no se pueden desmarcar desde la app.
        fixedLockedByCode: siempre,
      };
    });
  }

  /** Secciones que esta empresa marcó como visibles para todos, más las fijas por código. */
  async getFixedSections(companyId: number): Promise<string[]> {
    const rows = await this.prisma.companySection.findMany({
      where: { companyId, fixedForAll: true },
      select: { section: true },
    });
    return [
      ...new Set([...SECCIONES_SIEMPRE_VISIBLES, ...rows.map((r) => r.section)]),
    ];
  }

  /**
   * Marca qué secciones ve todo el mundo en esta empresa. Solo aplica a
   * secciones HABILITADAS: marcar como fija una que la empresa no tiene
   * contratada no significaría nada.
   */
  async setFixedSections(companyId: number, sections: string[]) {
    const habilitadas = (await this.getCompanySections(companyId))
      .filter((s) => s.enabled)
      .map((s) => s.key);
    const aFijar = new Set(sections.filter((s) => habilitadas.includes(s)));

    await this.prisma.$transaction([
      this.prisma.companySection.updateMany({
        where: { companyId },
        data: { fixedForAll: false },
      }),
      this.prisma.companySection.updateMany({
        where: { companyId, section: { in: [...aFijar] } },
        data: { fixedForAll: true },
      }),
    ]);

    return this.getCompanySections(companyId);
  }

  async setCompanySections(companyId: number, sections: string[]) {
    const alwaysOn = ALL_SECTIONS.filter((s) => s.alwaysEnabled).map(
      (s) => s.key,
    );
    const allowed = [...new Set([...alwaysOn, ...sections])];

    // Antes esto borraba TODAS las filas y las volvía a crear, lo que perdía
    // `fixedForAll` en cada guardado del super admin. Ahora se borran solo las
    // que salen y se crean solo las que entran.
    await this.prisma.companySection.deleteMany({
      where: { companyId, section: { notIn: allowed } },
    });
    if (allowed.length > 0) {
      await this.prisma.companySection.createMany({
        data: allowed.map((section) => ({ companyId, section })),
        skipDuplicates: true,
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
      return {
        isSuperAdmin: true,
        sections: ALL_SECTIONS.map((s) => s.key),
        permissions: [],
        fixedSections: ALL_SECTIONS.map((s) => s.key),
      };
    }
    const companySections = await this.getCompanySections(companyId);
    const enabledSections = companySections
      .filter((s) => s.enabled)
      .map((s) => s.key);
    const userPerms = await this.getUserPermissions(userId);
    return {
      isSuperAdmin: false,
      sections: enabledSections,
      permissions: userPerms,
      // El frontend las trata como vistas siempre, sin mirar UserPermission.
      fixedSections: companySections
        .filter((s) => s.enabled && s.fixedForAll)
        .map((s) => s.key),
    };
  }
}
