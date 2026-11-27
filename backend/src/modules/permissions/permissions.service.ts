import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  asegurarCustodiasEnOperaciones,
  asegurarSeccionOperaciones,
} from './operaciones-seccion.schema';
import { asegurarSistemasPorEmpresa } from './sistemas-seccion.schema';
import { cerrarUsuariosSinPermisos } from './permisos-usuarios.schema';

// `alwaysEnabled`  = la EMPRESA la tiene activa siempre (no hace falta que un
//                     super admin la encienda).
// `siempreVisible` = además, NO se puede negar usuario por usuario. Son la
//                     pantalla de inicio y los canales abiertos a cualquier
//                     empleado; negárselos a alguien lo dejaba sin ningún
//                     lugar a donde entrar (ver el bucle de redirección del
//                     2026-09-22 en .agents/modules/recursos-humanos.md).
//                     Quejas y Encuestas ya estaban abiertas a nivel de ruta.
export const ALL_SECTIONS = [
  {
    key: 'DASHBOARD',
    label: 'Inicio',
    alwaysEnabled: true,
    siempreVisible: true,
  },
  {
    key: 'PROJECTS',
    label: 'Proyectos',
    alwaysEnabled: true,
    siempreVisible: true,
  },
  { key: 'ADMIN', label: 'Administración', alwaysEnabled: true },
  { key: 'CACAO', label: 'Cacao', alwaysEnabled: false },
  // Mi Empresa (marca y colores): módulo por defecto desde 2026-11-26. Toda empresa, incluso recién
  // creada y sin módulos, necesita poder poner su logo y sus colores desde el primer día.
  { key: 'COMPANY_SETTINGS', label: 'Mi Empresa', alwaysEnabled: true },
  { key: 'COMPANIES', label: 'Empresas', alwaysEnabled: false },
  // Custodias ya NO es una sección (2026-11-18): los viajes son parte de Operaciones y los gobierna
  // OPERACIONES (asegurarCustodiasEnOperaciones la enciende donde estaba Custodias). Las filas
  // 'CUSTODIAS' que queden en CompanySection/UserPermission se ignoran.
  { key: 'RRHH', label: 'Recursos Humanos', alwaysEnabled: false },
  { key: 'VENTAS', label: 'Ventas y CRM', alwaysEnabled: false },
  {
    key: 'CONTRATACION_PUBLICA',
    label: 'Contratación Pública',
    alwaysEnabled: false,
  },
  // Operaciones (2026-11-05): lo que antes colgaba de Contratación Pública (contratos, horarios,
  // bitácoras de guardianía) y sirve a cualquier cliente, público o privado. Las empresas que ya
  // tenían Contratación Pública la reciben encendida una sola vez (operaciones-seccion.schema.ts).
  { key: 'OPERACIONES', label: 'Operaciones', alwaysEnabled: false },
  // Herramientas ya NO es una sección (2026-10-06): quedó huérfana al fusionarse
  // en Sistemas y seguía apareciendo en Permisos usuarios sin gobernar nada. Las
  // filas UserPermission 'TOOLS' que ya existan en la base se ignoran.
  //
  // Sistemas se activa por empresa, como Cacao o Ventas (2026-11-26). Antes era
  // `alwaysEnabled` porque Herramientas y Agentes vivían sueltas en el menú
  // como secciones siempre activas y, al agruparse en Sistemas, volverla opt-in
  // las dejaba inalcanzables hasta que un super admin la activara a mano. Pero
  // es la pantalla interna de TI de Gemeseg (claves de licencia, agentes,
  // tickets): no debe estar a un permiso de distancia de cada empresa cliente.
  // `asegurarSistemasPorEmpresa` la deja encendida solo donde ya se usaba (GEMESEG).
  { key: 'SISTEMAS', label: 'Sistemas', alwaysEnabled: false },
  // Bitácora del equipo (2026-10-27): apagada por empresa (un super admin la
  // enciende, y hasta entonces NO se registra nada de esa empresa) y cerrada por
  // defecto (solo ve la bitácora de todo el equipo quien tenga fila de permiso).
  // Cada persona ve siempre su propia hoja, sin necesitar permiso.
  { key: 'BITACORA', label: 'Bitácora del equipo', alwaysEnabled: false },
  // Contabilidad (2026-11-16): el dinero que antes vivía mezclado en Custodias (tarifas, nómina,
  // roles de pago). Apagada por empresa y cerrada por defecto: quien ve los viajes (Operaciones) NO ve dinero
  // a menos que tenga además su propia fila de permiso aquí.
  { key: 'CONTABILIDAD', label: 'Contabilidad', alwaysEnabled: false },
  // Marketing: apagado por empresa y cerrado por defecto (sin fila de permiso no se entra).
  { key: 'MARKETING', label: 'Marketing', alwaysEnabled: false },
  // Buzón de Quejas y Encuestas (2026-11-26): el super administrador las asigna a cada empresa. Si la
  // empresa las tiene, las ve TODA su gente (`abiertaSiActiva`); si no, nadie. Antes se veían siempre.
  { key: 'QUEJAS', label: 'Buzón de Quejas y Sugerencias', alwaysEnabled: false, abiertaSiActiva: true },
  { key: 'ENCUESTAS', label: 'Encuestas', alwaysEnabled: false, abiertaSiActiva: true },
];

/**
 * Secciones que, una vez asignadas a la empresa, ve todo el mundo en ella (no se niegan usuario por
 * usuario). A diferencia de `siempreVisible`, la empresa tiene que tenerlas activas.
 */
export const SECCIONES_ABIERTAS_SI_ACTIVA: string[] = ALL_SECTIONS.filter(
  (s) => (s as { abiertaSiActiva?: boolean }).abiertaSiActiva,
).map((s) => s.key);

/**
 * Administración y Mi Empresa nunca se le cierran al ADMINISTRADOR de una empresa (si no, podría
 * quedarse sin forma de volver a abrirlas). Para Gerente y usuarios normales mandan sus casillas.
 */
export const SECCIONES_BASE_DEL_ADMIN: string[] = ['ADMIN', 'COMPANY_SETTINGS'];

export function esAdminDeEmpresaEnSeccionBase(
  user: { role: string; companyId: number | null },
  section: string,
): boolean {
  return (
    user.role === 'ADMIN' && !!user.companyId && SECCIONES_BASE_DEL_ADMIN.includes(section)
  );
}

/** Secciones que no se pueden negar usuario por usuario (ver ALL_SECTIONS). */
export const SECCIONES_SIEMPRE_VISIBLES: string[] = ALL_SECTIONS.filter(
  (s) => (s as { siempreVisible?: boolean }).siempreVisible,
).map((s) => s.key);

export interface UsuarioAcceso {
  id: number;
  companyId: number;
  fullName: string;
  email: string;
  companyName: string | null;
}

export type UsuarioExcluido = Omit<UsuarioAcceso, 'companyId'> & { motivo: string };

export function esSeccionSiempreVisible(section: string): boolean {
  return SECCIONES_SIEMPRE_VISIBLES.includes(section);
}

/**
 * Secciones cerradas por defecto: una persona SIN fila de UserPermission no
 * tiene acceso (en el resto, sin fila = permitido, para no dejar fuera a los
 * usuarios antiguos que nunca tuvieron permisos cargados).
 *
 * Sistemas expone claves de licencia (Herramientas), agentes de IA, base de
 * conocimiento y tickets de todas las empresas: no debe abrirse por omisión.
 * Herramientas es una pantalla de Sistemas, no una sección aparte. Crear un
 * ticket sigue abierto a cualquiera (ese endpoint no usa guard de sección).
 */
export const SECCIONES_CERRADAS_POR_DEFECTO: string[] = [
  'SISTEMAS',
  'BITACORA',
  'CONTABILIDAD',
  'MARKETING',
];

/** Una fila de permiso de una sección que ya no existe (TOOLS, CUSTODIAS) se ignora. */
export const esSeccionVigente = (p: { section: string }) =>
  ALL_SECTIONS.some((a) => a.key === p.section);

/** ¿Qué pasa con una sección cuando la persona no tiene fila de permiso? */
export function permiteSinFila(section: string): boolean {
  return !SECCIONES_CERRADAS_POR_DEFECTO.includes(section);
}

@Injectable()
export class PermissionsService implements OnModuleInit {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enciende OPERACIONES (una sola vez) donde ya estaba Contratación Pública. Si falla no tumba el
   * servidor —no es indispensable para arrancar—, pero se deja en el registro porque sin él
   * Operaciones queda apagada hasta que un super administrador la encienda.
   */
  async onModuleInit(): Promise<void> {
    try {
      const hecho = await asegurarSeccionOperaciones(
        this.prisma as unknown as Parameters<typeof asegurarSeccionOperaciones>[0],
      );
      if (hecho) {
        this.logger.log('Sección OPERACIONES encendida donde ya estaba Contratación Pública.');
      }
      const custodias = await asegurarCustodiasEnOperaciones(
        this.prisma as unknown as Parameters<typeof asegurarCustodiasEnOperaciones>[0],
      );
      if (custodias) {
        this.logger.log('Sección OPERACIONES encendida donde estaba Custodias (Custodias ya no es una sección).');
      }
    } catch (err) {
      this.logger.error(
        'No se pudo preparar la sección OPERACIONES; hay que encenderla por empresa en Permisos.',
        err instanceof Error ? err.stack : String(err),
      );
    }

    // Sistemas pasa a activarse por empresa: se deja encendida solo en GEMESEG (una sola vez). Si falla
    // no tumba el servidor; mientras no corra, las empresas conservan las filas que ya tenían.
    try {
      const hecho = await asegurarSistemasPorEmpresa(
        this.prisma as unknown as Parameters<typeof asegurarSistemasPorEmpresa>[0],
      );
      if (hecho) {
        this.logger.log('Sección SISTEMAS dejada solo en la empresa interna (gemeseg).');
      }
    } catch (err) {
      this.logger.error(
        'No se pudo ajustar la sección SISTEMAS por empresa; sigue como estaba hasta el próximo arranque.',
        err instanceof Error ? err.stack : String(err),
      );
    }

    // Usuarios antiguos sin permisos guardados: se cierran una sola vez (ver permisos-usuarios.schema.ts).
    try {
      const hecho = await cerrarUsuariosSinPermisos(
        this.prisma as unknown as Parameters<typeof cerrarUsuariosSinPermisos>[0],
        ALL_SECTIONS.map((s) => s.key),
      );
      if (hecho) {
        this.logger.log('Usuarios sin permisos guardados cerrados; Quejas y Encuestas asignadas donde hay RRHH.');
      }
    } catch (err) {
      this.logger.error(
        'No se pudieron cerrar los usuarios sin permisos; siguen como estaban hasta el próximo arranque.',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  isSuperAdmin(user: any): boolean {
    return user.role === 'ADMIN' && !user.companyId;
  }

  /**
   * Misma semántica que SectionPermissionGuard, expuesta como método para
   * rutas cuya sección requerida no se puede fijar con @Section porque
   * depende de la petición (ver decorador NoSectionCheck).
   */
  async hasSectionAccess(
    user: { userId: number; role: string; companyId: number | null },
    section: string,
    access: 'view' | 'write' = 'view',
  ): Promise<boolean> {
    if (this.isSuperAdmin(user)) return true;
    if (!user.companyId) return false;

    const companySections = await this.getCompanySections(user.companyId);
    const enabled = companySections.some(
      (s) => s.key === section && s.enabled,
    );
    if (!enabled) return false;

    if (esSeccionSiempreVisible(section)) return true;
    if (esAdminDeEmpresaEnSeccionBase(user, section)) return true;
    const fijas = await this.getFixedSections(user.companyId);
    if (fijas.includes(section)) return true;

    const perms = await this.getUserPermissions(user.userId);
    const perm = perms.find((p) => p.section === section);
    if (!perm) return permiteSinFila(section);

    return access === 'write' ? perm.canWrite : perm.canView;
  }

  /**
   * Quién puede VER al menos una de las secciones dadas, y quién queda fuera
   * con su motivo. Misma regla que `hasSectionAccess`, pero en lote para no
   * consultar usuario por usuario: la empresa tiene la sección habilitada y el
   * usuario no la tiene negada (sin fila en UserPermission = tiene acceso; una
   * sección fija para todos no se puede negar). Los super admin quedan fuera
   * porque no tienen empresa y las notificaciones la exigen.
   */
  async evaluarAccesoSecciones(
    sections: string[],
    excludeUserId?: number,
  ): Promise<{ destinatarios: UsuarioAcceso[]; excluidos: UsuarioExcluido[] }> {
    const validas = sections.filter((s) => ALL_SECTIONS.some((a) => a.key === s));
    if (validas.length === 0) return { destinatarios: [], excluidos: [] };

    const [users, companySections] = await Promise.all([
      this.prisma.user.findMany({
        select: {
          id: true,
          companyId: true,
          isActive: true,
          fullName: true,
          email: true,
          company: { select: { name: true } },
          permissions: {
            where: { section: { in: validas } },
            select: { section: true, canView: true },
          },
        },
      }),
      this.prisma.companySection.findMany({
        select: { companyId: true, section: true, fixedForAll: true },
      }),
    ]);

    const habilitadas = new Map<number, Set<string>>();
    const fijas = new Map<number, Set<string>>();
    for (const cs of companySections) {
      if (!habilitadas.has(cs.companyId)) habilitadas.set(cs.companyId, new Set());
      habilitadas.get(cs.companyId)!.add(cs.section);
      if (cs.fixedForAll) {
        if (!fijas.has(cs.companyId)) fijas.set(cs.companyId, new Set());
        fijas.get(cs.companyId)!.add(cs.section);
      }
    }

    const destinatarios: UsuarioAcceso[] = [];
    const excluidos: UsuarioExcluido[] = [];
    for (const u of users) {
      const base = {
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        companyName: u.company?.name ?? null,
      };
      const excluir = (motivo: string) => excluidos.push({ ...base, motivo });

      if (u.id === excludeUserId) { excluir('Eres tú: quien publica no recibe el aviso'); continue; }
      if (u.companyId === null) { excluir('Super administrador: no tiene empresa y los avisos la necesitan'); continue; }
      if (!u.isActive) { excluir('Cuenta inactiva'); continue; }

      const companyId = u.companyId;
      let negada = false;
      const tieneAcceso = validas.some((section) => {
        const alwaysEnabled = ALL_SECTIONS.find((a) => a.key === section)?.alwaysEnabled;
        if (!alwaysEnabled && !habilitadas.get(companyId)?.has(section)) return false;
        if (esSeccionSiempreVisible(section) || SECCIONES_ABIERTAS_SI_ACTIVA.includes(section) || fijas.get(companyId)?.has(section)) return true;
        const perm = u.permissions.find((p) => p.section === section);
        if (perm && !perm.canView) negada = true;
        return perm ? perm.canView : permiteSinFila(section);
      });
      if (tieneAcceso) {
        destinatarios.push({ ...base, companyId });
      } else {
        excluir(
          negada
            ? 'Tiene negado ese módulo en sus permisos de usuario'
            : 'Su empresa no tiene activo ese módulo',
        );
      }
    }
    return { destinatarios, excluidos };
  }

  /** Solo quienes reciben (ver `evaluarAccesoSecciones`). */
  async getUsersWithSectionAccess(
    sections: string[],
    excludeUserId?: number,
  ): Promise<UsuarioAcceso[]> {
    return (await this.evaluarAccesoSecciones(sections, excludeUserId)).destinatarios;
  }

  /**
   * Personas ACTIVAS, de TODAS las empresas, que tienen la sección marcada
   * EXPLÍCITAMENTE con "Escribir" en Permisos usuarios (p. ej. el equipo que
   * gestiona los tickets de Sistemas, que atiende a todas las empresas).
   *
   * A propósito NO usa la regla permisiva del guard (sin fila = acceso): quien no
   * tiene fila no aparece marcado en esa pantalla, y avisarle sería avisar a
   * gente que nadie eligió. Por eso hace falta una fila con `canWrite` (y la
   * empresa debe tener la sección activa). Los super admin quedan fuera porque no
   * tienen empresa y las notificaciones la exigen.
   */
  async getUsersWithExplicitSectionWrite(
    section: string,
    excludeUserId?: number,
  ): Promise<UsuarioAcceso[]> {
    const def = ALL_SECTIONS.find((a) => a.key === section);
    if (!def) return [];

    const [users, companySections] = await Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true, companyId: { not: null } },
        select: {
          id: true,
          companyId: true,
          fullName: true,
          email: true,
          company: { select: { name: true } },
          permissions: { where: { section }, select: { canWrite: true } },
        },
      }),
      this.prisma.companySection.findMany({
        where: { section },
        select: { companyId: true },
      }),
    ]);
    const habilitadas = new Set(companySections.map((c) => c.companyId));

    const resultado: UsuarioAcceso[] = [];
    for (const u of users) {
      if (u.id === excludeUserId || u.companyId === null) continue;
      if (!def.alwaysEnabled && !habilitadas.has(u.companyId)) continue;
      // Solo con fila explícita y "Escribir" marcado.
      if (!u.permissions[0]?.canWrite) continue;
      resultado.push({
        id: u.id,
        companyId: u.companyId,
        fullName: u.fullName,
        email: u.email,
        companyName: u.company?.name ?? null,
      });
    }
    return resultado;
  }

  /**
   * Ids de las personas ACTIVAS de la empresa que pueden ESCRIBIR en la sección
   * (p. ej. el personal de Contratación Pública que revisa documentos). Misma
   * regla que `hasSectionAccess(…, 'write')`: la empresa tiene la sección
   * activa y el usuario no la tiene en solo lectura (sin fila en
   * UserPermission = puede escribir; una sección fija para todos no se puede
   * restringir). Sirve para avisar al equipo y no solo a una persona.
   */
  async getCompanyUserIdsWithWriteAccess(
    companyId: number,
    section: string,
  ): Promise<number[]> {
    const habilitada = (await this.getCompanySections(companyId)).some(
      (s) => s.key === section && s.enabled,
    );
    if (!habilitada) return [];
    const sinRestriccion =
      esSeccionSiempreVisible(section) ||
      (await this.getFixedSections(companyId)).includes(section);

    const users = await this.prisma.user.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        permissions: { where: { section }, select: { canWrite: true } },
      },
    });
    return users
      .filter(
        (u) =>
          sinRestriccion || u.permissions.length === 0 || u.permissions[0].canWrite,
      )
      .map((u) => u.id);
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
      const abierta = SECCIONES_ABIERTAS_SI_ACTIVA.includes(s.key);
      const siempre = esSeccionSiempreVisible(s.key) || abierta;
      return {
        ...s,
        enabled: s.alwaysEnabled || dbSections.includes(s.key),
        // Fija = o el producto la define así en código, o la empresa la marcó.
        fixedForAll: siempre || fijasEnBd.has(s.key),
        // Las de código no se pueden desmarcar desde la app.
        fixedLockedByCode: siempre,
        // Sin fila de permiso: ¿la persona entra o no? Lo necesita la pantalla
        // de Permisos Usuarios para mostrar lo que de verdad puede hacer.
        cerradaPorDefecto: !permiteSinFila(s.key),
      };
    });
  }

  /** Secciones que esta empresa marcó como visibles para todos, más las fijas por código. */
  async getFixedSections(companyId: number): Promise<string[]> {
    const rows = await this.prisma.companySection.findMany({
      where: { companyId, fixedForAll: true },
      select: { section: true },
    });
    // Las «abiertas si activa» cuentan solo cuando la empresa las tiene asignadas.
    const activas = await this.prisma.companySection.findMany({
      where: { companyId, section: { in: SECCIONES_ABIERTAS_SI_ACTIVA } },
      select: { section: true },
    });
    return [
      ...new Set([
        ...SECCIONES_SIEMPRE_VISIBLES,
        ...rows.map((r) => r.section),
        ...activas.map((r) => r.section),
      ]),
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

    // Qué módulos ya tenía, para saber cuáles ENTRAN con este guardado.
    const previas = await this.prisma.companySection.findMany({
      where: { companyId },
      select: { section: true },
    });
    const yaEstaban = new Set((previas ?? []).map((s) => s.section));

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

    // Los módulos que el super administrador acaba de activar se le dan de una
    // vez al administrador de la empresa (2026-11-26). Los «de siempre» (Inicio,
    // Proyectos, Administración, Mi Empresa…) no cuentan: nunca se «activan».
    const nuevas = allowed.filter(
      (key) =>
        !yaEstaban.has(key) &&
        ALL_SECTIONS.some((a) => a.key === key && !a.alwaysEnabled),
    );
    await this.darSeccionesAAdministradores(companyId, nuevas);

    return this.getCompanySections(companyId);
  }

  /**
   * Da vista y escritura sobre `secciones` a cada ADMIN de la empresa. Es solo
   * añadir: si el administrador ya tenía una fila para esa sección (incluso
   * negada a propósito) no se toca, y los demás usuarios no reciben nada.
   * Hace falta porque Marketing, Contabilidad y Bitácora son «cerradas por
   * defecto»: sin fila propia nadie las ve, ni el administrador de la empresa.
   */
  private async darSeccionesAAdministradores(
    companyId: number,
    secciones: string[],
  ): Promise<void> {
    if (secciones.length === 0) return;
    const admins = await this.prisma.user.findMany({
      where: { companyId, role: 'ADMIN' },
      select: { id: true },
    });
    if (!admins?.length) return;
    await this.prisma.userPermission.createMany({
      data: admins.flatMap((a) =>
        secciones.map((section) => ({
          userId: a.id,
          section,
          canView: true,
          canWrite: true,
        })),
      ),
      skipDuplicates: true,
    });
  }

  async getUserPermissions(userId: number) {
    const perms = await this.prisma.userPermission.findMany({
      where: { userId },
      select: { section: true, canView: true, canWrite: true },
    });
    return perms.filter(esSeccionVigente);
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
    // Las filas de secciones que ya no existen (TOOLS, CUSTODIAS) se ignoran: no se cuentan
    // («12/11 secciones») ni se muestran.
    return users.map((u) => ({ ...u, permissions: u.permissions.filter(esSeccionVigente) }));
  }

  /**
   * Quien edita los permisos de una persona debe ser de su misma empresa (el
   * super administrador, de cualquiera). Antes solo se verificaba el rol: un
   * ADMIN de la empresa A que conociera el id de un usuario de la B le
   * cambiaba los permisos.
   */
  async assertPuedeGestionarUsuario(
    userId: number,
    actor: { role: string; companyId: number | null; userId?: number },
  ): Promise<void> {
    const objetivo = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true, role: true },
    });
    if (!objetivo) throw new NotFoundException('Usuario no encontrado');
    if (this.isSuperAdmin(actor)) return;
    if (!actor.companyId || objetivo.companyId !== actor.companyId) {
      throw new ForbiddenException('No tienes acceso a este usuario');
    }
    // Quien no es administrador (un Gerente con «Administración» activa) no toca a los administradores
    // ni sus propios permisos: si no, podría darse a sí mismo o a otro más poder del que le corresponde.
    if (actor.role !== 'ADMIN') {
      if (objetivo.role === 'ADMIN') {
        throw new ForbiddenException('Solo un administrador puede cambiar los permisos de otro administrador');
      }
      if (actor.userId !== undefined && actor.userId === userId) {
        throw new ForbiddenException('No puedes cambiar tus propios permisos');
      }
    }
  }

  /**
   * Quien no es administrador solo puede dar acceso a lo que él mismo puede ver (y escribir solo lo que
   * él mismo puede escribir). El administrador de empresa y el super administrador no tienen tope.
   */
  async assertPuedeOtorgar(
    actor: { userId: number; role: string; companyId: number | null },
    permissions: { section: string; canView: boolean; canWrite: boolean }[],
  ): Promise<void> {
    if (this.isSuperAdmin(actor) || actor.role === 'ADMIN') return;
    for (const p of permissions) {
      if (!p.canView && !p.canWrite) continue;
      if (!(await this.hasSectionAccess(actor, p.section, 'view')) ||
          (p.canWrite && !(await this.hasSectionAccess(actor, p.section, 'write')))) {
        throw new ForbiddenException('No puedes dar acceso a un módulo al que tú no tienes acceso');
      }
    }
  }

  async setUserPermissions(
    userId: number,
    permissions: { section: string; canView: boolean; canWrite: boolean }[],
  ) {
    const validas = permissions.filter((p) => ALL_SECTIONS.some((a) => a.key === p.section));
    await this.prisma.userPermission.deleteMany({ where: { userId } });
    if (validas.length > 0) {
      await this.prisma.userPermission.createMany({
        data: validas.map((p) => ({
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
    // En las secciones cerradas por defecto, "sin fila" significa SIN acceso.
    // El frontend ya trata una fila como la palabra final, así que se la damos
    // explícita en vez de enseñarle esta regla a `usePermissions`.
    for (const section of SECCIONES_CERRADAS_POR_DEFECTO) {
      if (!userPerms.some((p) => p.section === section)) {
        userPerms.push({ section, canView: false, canWrite: false });
      }
    }
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
