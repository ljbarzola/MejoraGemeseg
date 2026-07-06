import { PrismaService } from '../../prisma/prisma.service';

export class AiProcessor {
  constructor(private prisma: PrismaService) {}

  async executeQuery(intent: string, params: any, userId: number): Promise<string> {
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
      default:
        return '';
    }
  }

  private async listProjects(userId: number): Promise<string> {
    const projects = await this.prisma.project.findMany({
      where: {
        OR: [
          { createdById: userId },
          { members: { some: { userId } } },
        ],
      },
      include: {
        _count: { select: { tasks: true, members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (projects.length === 0) return 'No participas en ningún proyecto actualmente.';

    const list = projects.map((p) =>
      `- ${p.name} [${p.status}] (${p._count.tasks} tareas, ${p._count.members} miembros)`
    ).join('\n');

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
        _count: { select: { createdProjects: true, projectMemberships: true, assignedTasks: true } },
      },
    });

    if (!user) return 'No se encontró información del usuario.';

    return [
      `Nombre: ${user.fullName}`,
      `Correo: ${user.email}`,
      `Rol sistema: ${user.role}`,
      `Cargo: ${user.position || 'No definido'}`,
      `Departamento: ${user.department?.name || 'No asignado'}`,
      `Proyectos creados: ${user._count.createdProjects}`,
      `Proyectos como miembro: ${user._count.projectMemberships}`,
      `Tareas asignadas: ${user._count.assignedTasks}`,
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
    const tasks = await this.prisma.task.findMany({
      where: { assigneeId: userId },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (tasks.length === 0) return 'No tienes tareas asignadas actualmente.';

    const list = tasks.map((t) =>
      `- ${t.title} [${t.status}] (${t.project.name})${t.dueDate ? ` - vence ${t.dueDate.toLocaleDateString('es-EC')}` : ''}`
    ).join('\n');

    return `Tus tareas:\n${list}`;
  }
}
