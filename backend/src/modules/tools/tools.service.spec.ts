import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ToolsService } from './tools.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ToolsService — aislamiento por empresa', () => {
  let prisma: {
    tool: { findMany: jest.Mock; findUnique: jest.Mock; delete: jest.Mock };
    toolAssignment: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    toolAuditLog: { findMany: jest.Mock; create: jest.Mock };
    user: { findMany: jest.Mock; findUnique: jest.Mock };
  };
  let service: ToolsService;

  const adminA = { role: 'ADMIN', companyId: 1 };
  const superAdmin = { role: 'ADMIN', companyId: null };

  beforeEach(() => {
    prisma = {
      tool: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      toolAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      toolAuditLog: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    };
    service = new ToolsService(prisma as unknown as PrismaService);
  });

  it('findAllAssignments filtra por la empresa de quien pregunta', async () => {
    await service.findAllAssignments(adminA);
    expect(prisma.toolAssignment.findMany.mock.calls[0][0].where.user).toEqual({ companyId: 1 });
  });

  it('findAllAssignments combina el filtro de empresa con el de texto', async () => {
    await service.findAllAssignments(adminA, undefined, 'ana');
    const where = prisma.toolAssignment.findMany.mock.calls[0][0].where;
    expect(where.user.companyId).toBe(1);
    expect(where.user.OR).toHaveLength(2);
  });

  it('el super administrador ve todas las empresas', async () => {
    await service.findAllAssignments(superAdmin);
    expect(prisma.toolAssignment.findMany.mock.calls[0][0].where.user).toEqual({});
  });

  it('getUsersWithTools solo lista personas de la empresa', async () => {
    await service.getUsersWithTools(adminA);
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ isActive: true, companyId: 1 });
  });

  it('findAllTools cuenta solo las asignaciones de la propia empresa', async () => {
    await service.findAllTools(adminA);
    const include = prisma.tool.findMany.mock.calls[0][0].include;
    expect(include._count.select.assignments.where.user).toEqual({ companyId: 1 });
  });

  it('assignTool rechaza asignar a una persona de otra empresa', async () => {
    prisma.tool.findUnique.mockResolvedValue({ id: 1, name: 'Office' });
    prisma.user.findUnique.mockResolvedValue({ id: 9, companyId: 2, fullName: 'Otra' });
    await expect(
      service.assignTool({ toolId: 1, userId: 9 } as any, adminA, 1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.toolAssignment.create).not.toHaveBeenCalled();
  });

  it.each([
    ['updateAssignment', (s: ToolsService) => s.updateAssignment(5, { version: '2' } as any, adminA, 1)],
    ['removeAssignment', (s: ToolsService) => s.removeAssignment(5, adminA, 1)],
    ['getAuditLog', (s: ToolsService) => s.getAuditLog(5, adminA)],
  ])('%s rechaza una asignación de otra empresa y no toca nada', async (_n, llamar) => {
    prisma.toolAssignment.findUnique.mockResolvedValue({
      id: 5,
      tool: { name: 'Office' },
      user: { companyId: 2, fullName: 'Otra' },
    });
    await expect(llamar(service)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.toolAssignment.update).not.toHaveBeenCalled();
    expect(prisma.toolAssignment.delete).not.toHaveBeenCalled();
    expect(prisma.toolAuditLog.findMany).not.toHaveBeenCalled();
  });

  it('el super administrador puede operar sobre asignaciones de cualquier empresa', async () => {
    prisma.toolAssignment.findUnique.mockResolvedValue({
      id: 5,
      tool: { name: 'Office' },
      user: { companyId: 2, fullName: 'Otra' },
    });
    await expect(service.removeAssignment(5, superAdmin, 1)).resolves.toBeDefined();
    expect(prisma.toolAssignment.delete).toHaveBeenCalled();
  });

  it('removeTool se rechaza (409) si otras empresas tienen la herramienta asignada', async () => {
    prisma.tool.findUnique.mockResolvedValue({ id: 3, name: 'Office' });
    prisma.toolAssignment.count.mockResolvedValue(2);
    await expect(service.removeTool(3, adminA)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.tool.delete).not.toHaveBeenCalled();
  });

  it('removeTool se permite si solo la usa la propia empresa', async () => {
    prisma.tool.findUnique.mockResolvedValue({ id: 3, name: 'Office' });
    prisma.toolAssignment.count.mockResolvedValue(0);
    await service.removeTool(3, adminA);
    expect(prisma.tool.delete).toHaveBeenCalledWith({ where: { id: 3 } });
  });
});
