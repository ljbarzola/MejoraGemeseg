import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Qué sección de permisos es dueña de cada intención — AiService la consulta
// antes de ejecutar cualquier intención aquí abajo (ver canUseIntent en
// ai.service.ts). `null` = sin dueño de sección, se ejecuta igual que hoy sin
// verificar nada (las 5 intenciones originales de Proyectos/Tareas/Usuario:
// PROJECTS es siempre visible para cualquier usuario de todos modos, y esto
// es una continuación deliberada del comportamiento previo, no un hueco
// nuevo introducido por este cambio).
export const INTENT_SECTION: Record<string, string | null> = {
  list_projects: null,
  count_tasks_by_status: null,
  user_info: null,
  project_summary: null,
  list_my_tasks: null,
  cacao_resumen: 'CACAO',
  custodias_resumen: 'CUSTODIAS',
  rrhh_resumen_personal: 'RRHH',
  ventas_resumen: 'VENTAS',
};

@Injectable()
export class AiProcessor {
  constructor(private prisma: PrismaService) {}

  async executeQuery(
    intent: string,
    params: any,
    userId: number,
    companyId?: number | null,
  ): Promise<string> {
    switch (intent) {
      case 'list_projects':
        return this.listProjects(userId);
      case 'count_tasks_by_status':
        return this.countTasksByStatus(params.projectId);
      case 'user_info':
        return this.userInfo(userId);
      case 'project_summary':
        return this.projectSummary(params.projectId);
      case 'list_my_tasks':
        return this.listMyTasks(userId);
      case 'cacao_resumen':
        return this.cacaoResumen(companyId);
      case 'custodias_resumen':
        return this.custodiasResumen(companyId);
      case 'rrhh_resumen_personal':
        return this.rrhhResumenPersonal(companyId);
      case 'ventas_resumen':
        return this.ventasResumen(companyId);
      default:
        return '';
    }
  }

  private async cacaoResumen(companyId?: number | null): Promise<string> {
    if (!companyId) return 'No hay empresa asociada para consultar Cacao.';
    const [recepciones30d, lotesAbiertos, lotesCerrados] = await Promise.all([
      this.prisma.cacaoReception.count({
        where: {
          companyId,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.cacaoLot.count({ where: { companyId, status: 'OPEN' } }),
      this.prisma.cacaoLot.count({ where: { companyId, status: 'CLOSED' } }),
    ]);
    return [
      `Recepciones de cacao (últimos 30 días): ${recepciones30d}`,
      `Lotes abiertos: ${lotesAbiertos}`,
      `Lotes cerrados: ${lotesCerrados}`,
    ].join('\n');
  }

  private async custodiasResumen(companyId?: number | null): Promise<string> {
    if (!companyId) return 'No hay empresa asociada para consultar Custodias.';
    const porEstado = await this.prisma.custodia.groupBy({
      by: ['estado'],
      where: { companyId },
      _count: { id: true },
    });
    if (porEstado.length === 0) return 'No hay custodias registradas.';
    const lista = porEstado.map((c) => `${c.estado}: ${c._count.id}`).join(', ');
    return `Custodias por estado: ${lista}`;
  }

  private async rrhhResumenPersonal(companyId?: number | null): Promise<string> {
    if (!companyId) return 'No hay empresa asociada para consultar RRHH.';
    const [totalPersonal, vacantesAbiertas] = await Promise.all([
      this.prisma.guardiaFichaPersonal.count({ where: { companyId } }),
      this.prisma.jobPosition.count({
        where: { companyId, estado: 'ABIERTA' },
      }),
    ]);
    return [
      `Personal con ficha registrada: ${totalPersonal}`,
      `Vacantes abiertas: ${vacantesAbiertas}`,
    ].join('\n');
  }

  private async ventasResumen(companyId?: number | null): Promise<string> {
    if (!companyId) return 'No hay empresa asociada para consultar Ventas.';
    const porEstado = await this.prisma.lead.groupBy({
      by: ['status'],
      where: { companyId },
      _count: { id: true },
      _sum: { estimatedValue: true },
    });
    if (porEstado.length === 0) return 'No hay leads registrados.';
    const lista = porEstado
      .map(
        (l) =>
          `${l.status}: ${l._count.id} (valor estimado $${(l._sum.estimatedValue || 0).toFixed(2)})`,
      )
      .join(', ');
    return `Leads por estado: ${lista}`;
  }

  private async listProjects(userId: number): Promise<string> {
    const projects = await this.prisma.project.findMany({
      where: {
        OR: [{ createdById: userId }, { members: { some: { userId } } }],
      },
      include: {
        _count: { select: { tasks: true, members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (projects.length === 0)
      return 'No participas en ningún proyecto actualmente.';

    const list = projects
      .map(
        (p) =>
          `- ${p.name} [${p.status}] (${p._count.tasks} tareas, ${p._count.members} miembros)`,
      )
      .join('\n');

    return `Tus proyectos:\n${list}`;
  }

  private async countTasksByStatus(projectId?: number): Promise<string> {
    const where = projectId ? { projectId } : {};
    const tasks = await this.prisma.task.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    });

    if (tasks.length === 0) return 'No hay tareas registradas.';

    const counts = tasks.map((t) => `${t.status}: ${t._count.id}`).join(', ');
    return `Tareas por estado: ${counts}`;
  }

  private async userInfo(userId: number): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: true,
        roleRelation: true,
        _count: {
          select: {
            createdProjects: true,
            projectMemberships: true,
            taskAssignees: true,
          },
        },
      },
    });

    if (!user) return 'No se encontró información del usuario.';

    return [
      `Nombre: ${user.fullName}`,
      `Correo: ${user.email}`,
      `Rol sistema: ${user.role}`,
      `Cargo: ${user.position || 'No definido'}`,
      `Departamento: ${user.departmentId ? 'Asignado' : 'No asignado'}`,
      `Proyectos creados: ${user._count.createdProjects}`,
      `Proyectos como miembro: ${user._count.projectMemberships}`,
      `Tareas asignadas: ${user._count.taskAssignees}`,
    ].join('\n');
  }

  private async projectSummary(projectId?: number): Promise<string> {
    if (!projectId) return 'Necesito el ID del proyecto para darte un resumen.';

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: { select: { tasks: true, members: true } },
        members: { include: { user: { select: { fullName: true } } } },
      },
    });

    if (!project) return 'Proyecto no encontrado.';

    const members = project.members.map((m) => m.user.fullName).join(', ');
    return [
      `Proyecto: ${project.name}`,
      `Estado: ${project.status}`,
      `Descripción: ${project.description || 'Sin descripción'}`,
      `Tareas: ${project._count.tasks}`,
      `Miembros: ${members}`,
    ].join('\n');
  }

  private async listMyTasks(userId: number): Promise<string> {
    const taskAssignees = await this.prisma.taskAssignee.findMany({
      where: { userId },
      include: {
        task: {
          include: { project: { select: { name: true } } },
        },
      },
      orderBy: { task: { createdAt: 'desc' } },
      take: 10,
    });

    if (taskAssignees.length === 0)
      return 'No tienes tareas asignadas actualmente.';

    const list = taskAssignees
      .map(
        (ta) =>
          `- ${ta.task.title} [${ta.task.status}] (${ta.task.project.name})${ta.task.endDate ? ` - hasta ${ta.task.endDate.toLocaleDateString('es-EC')}` : ''}`,
      )
      .join('\n');

    return `Tus tareas:\n${list}`;
  }
}
