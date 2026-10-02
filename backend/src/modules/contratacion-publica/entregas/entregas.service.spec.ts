import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DriveService } from '../../personal/services/drive.service';
import { CPEntidadesService } from '../entidades/entidades.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { GmailMailService } from '../../mail/gmail-mail.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { Actor, EntregasService } from './entregas.service';

const fecha = (t: string) => new Date(`${t}T00:00:00Z`);

const entidad = { id: 7, nombre: 'Municipio de Prueba' };

/** Una entrega tal como la devuelve `cargarEntrega` (con solicitud y responsables). */
function entrega(over: Record<string, unknown> = {}) {
  return {
    id: 11,
    solicitudId: 3,
    nombre: 'Planilla IESS',
    descripcion: null,
    departmentId: null,
    fechaLimite: fecha('2026-09-25'),
    estado: 'PENDIENTE',
    responsables: [{ entregaId: 11, userId: 4 }],
    solicitud: {
      id: 3,
      entidadId: 7,
      anio: 2026,
      mes: 9,
      estado: 'ENVIADA',
      createdBy: 1,
      entidad,
    },
    ...over,
  };
}

/** Una solicitud tal como la devuelve `cargarSolicitud`. */
function solicitud(over: Record<string, unknown> = {}) {
  return {
    id: 3,
    entidadId: 7,
    anio: 2026,
    mes: 9,
    estado: 'BORRADOR',
    enviadaAt: null,
    createdBy: 1,
    entidad,
    entregas: [] as any[],
    ...over,
  };
}

const entregaDeSolicitud = (
  id: number,
  nombre: string,
  responsables: number[],
  limite = '2026-09-25',
) => ({
  id,
  nombre,
  descripcion: null,
  departmentId: null,
  department: null,
  fechaLimite: fecha(limite),
  estado: 'PENDIENTE',
  origen: null,
  url: null,
  motivoRechazo: null,
  entregadoPorNombre: null,
  entregadoAt: null,
  revisadoPorNombre: null,
  revisadoAt: null,
  responsables: responsables.map((userId) => ({
    userId,
    user: { id: userId, fullName: `Persona ${userId}` },
  })),
});

describe('EntregasService', () => {
  let prisma: any;
  let notifications: { create: jest.Mock };
  let mail: { sendMail: jest.Mock };
  let drive: {
    getConfig: jest.Mock;
    findChildFolderByName: jest.Mock;
    getFileMetadata: jest.Mock;
    downloadFileBuffer: jest.Mock;
  };
  let permissions: { getCompanyUserIdsWithWriteAccess: jest.Mock };
  let service: EntregasService;

  const admin: Actor = { userId: 1, companyId: 1, puedeEscribir: true };
  const ana: Actor = { userId: 4, companyId: 1, puedeEscribir: false };

  beforeEach(() => {
    prisma = {
      cPEntidadPublica: { findFirst: jest.fn().mockResolvedValue(entidad) },
      cPSolicitudMensual: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      cPEntregaDocumento: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      cPEntregaHistorial: { create: jest.fn(), findMany: jest.fn() },
      cPEntregaResponsable: { deleteMany: jest.fn(), createMany: jest.fn() },
      user: {
        findMany: jest.fn(),
        findUnique: jest
          .fn()
          .mockResolvedValue({ fullName: 'Ana Responsable' }),
      },
      department: { findUnique: jest.fn() },
      notificationConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    notifications = { create: jest.fn().mockResolvedValue({}) };
    mail = { sendMail: jest.fn().mockResolvedValue(undefined) };
    drive = {
      getConfig: jest.fn(),
      findChildFolderByName: jest.fn(),
      getFileMetadata: jest.fn(),
      downloadFileBuffer: jest.fn(),
    };
    // Personal de CP con permiso de escribir (1 = quien armó la solicitud).
    permissions = {
      getCompanyUserIdsWithWriteAccess: jest.fn().mockResolvedValue([1, 2]),
    };
    service = new EntregasService(
      prisma,
      drive as unknown as DriveService,
      { carpetaDeEntidad: jest.fn() } as unknown as CPEntidadesService,
      notifications as unknown as NotificationsService,
      mail as unknown as GmailMailService,
      permissions as unknown as PermissionsService,
    );
  });

  describe('crearSolicitud', () => {
    it('rechaza una segunda solicitud del mismo mes y entidad', async () => {
      prisma.cPSolicitudMensual.findUnique.mockResolvedValue({ id: 1 });
      await expect(
        service.crearSolicitud(7, { anio: 2026, mes: 9 }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('pide empezar en blanco si no hay una solicitud anterior que copiar', async () => {
      prisma.cPSolicitudMensual.findUnique.mockResolvedValue(null);
      prisma.cPSolicitudMensual.findFirst.mockResolvedValue(null);
      await expect(
        service.crearSolicitud(
          7,
          { anio: 2026, mes: 9, copiarMesAnterior: true },
          admin,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('al copiar traslada la fecha al mes nuevo y deja fuera a quien ya no está activo', async () => {
      prisma.cPSolicitudMensual.findUnique.mockResolvedValue(null);
      // 1ª llamada: la solicitud anterior a copiar. 2ª: obtenerSolicitud de la recién creada.
      prisma.cPSolicitudMensual.findFirst
        .mockResolvedValueOnce({
          entregas: [
            {
              nombre: 'Factura',
              descripcion: 'del mes',
              departmentId: 2,
              orden: 0,
              fechaLimite: fecha('2026-08-31'),
              responsables: [
                { userId: 4, user: { isActive: true, companyId: 1 } },
                { userId: 5, user: { isActive: false, companyId: 1 } },
                { userId: 6, user: { isActive: true, companyId: 99 } },
              ],
            },
          ],
        })
        .mockResolvedValueOnce(solicitud({ id: 9, mes: 9 }));

      const tx = {
        cPSolicitudMensual: { create: jest.fn().mockResolvedValue({ id: 9 }) },
        cPEntregaDocumento: { create: jest.fn().mockResolvedValue({}) },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      await service.crearSolicitud(
        7,
        { anio: 2026, mes: 9, copiarMesAnterior: true },
        admin,
      );

      const data = tx.cPEntregaDocumento.create.mock.calls[0][0].data;
      expect(data.fechaLimite.toISOString().slice(0, 10)).toBe('2026-09-30'); // 31 de agosto -> fin de septiembre
      expect(data.responsables.create).toEqual([{ userId: 4 }]);
      expect(data.solicitudId).toBe(9);
    });
  });

  describe('enviarSolicitud', () => {
    it('no envía una solicitud sin documentos', async () => {
      prisma.cPSolicitudMensual.findFirst.mockResolvedValue(solicitud());
      await expect(service.enviarSolicitud(3, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('no envía si algún documento no tiene responsable, y dice cuál', async () => {
      prisma.cPSolicitudMensual.findFirst.mockResolvedValue(
        solicitud({
          entregas: [
            entregaDeSolicitud(1, 'Planilla', [4]),
            entregaDeSolicitud(2, 'Factura', []),
          ],
        }),
      );
      await expect(service.enviarSolicitud(3, admin)).rejects.toThrow(
        /Factura/,
      );
      expect(prisma.cPSolicitudMensual.update).not.toHaveBeenCalled();
    });

    it('no vuelve a enviar una solicitud ya enviada', async () => {
      prisma.cPSolicitudMensual.findFirst.mockResolvedValue(
        solicitud({
          estado: 'ENVIADA',
          entregas: [entregaDeSolicitud(1, 'Planilla', [4])],
        }),
      );
      await expect(service.enviarSolicitud(3, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('avisa una sola vez a cada persona, aunque tenga varios documentos', async () => {
      const completa = solicitud({
        entregas: [
          entregaDeSolicitud(1, 'Planilla', [4, 5], '2026-09-25'),
          entregaDeSolicitud(2, 'Factura', [4], '2026-09-20'),
        ],
      });
      prisma.cPSolicitudMensual.findFirst.mockResolvedValue(completa);

      await service.enviarSolicitud(3, admin);

      expect(prisma.cPSolicitudMensual.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ estado: 'ENVIADA' }),
        }),
      );
      const avisados = notifications.create.mock.calls
        .map((c) => c[0].userId)
        .sort();
      expect(avisados).toEqual([4, 5]);
      const aviso4 = notifications.create.mock.calls.find(
        (c) => c[0].userId === 4,
      )![0];
      expect(aviso4.message).toContain('2 documento(s)');
      expect(aviso4.message).toContain('20/09/2026'); // el más próximo
      expect(aviso4.link).toBe('/contratacion-publica/entidades/7?solicitud=3');
    });
  });

  describe('entregar', () => {
    const dto = {
      origen: 'ENLACE' as const,
      url: 'https://drive.google.com/file/d/abc/view',
    };

    beforeEach(() => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(entrega());
      prisma.cPSolicitudMensual.findFirst.mockResolvedValue(
        solicitud({
          estado: 'ENVIADA',
          entregas: [entregaDeSolicitud(11, 'Planilla IESS', [4])],
        }),
      );
    });

    it('lo puede entregar quien es responsable', async () => {
      await service.entregar(11, dto, ana);
      expect(prisma.cPEntregaDocumento.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 11 },
          data: expect.objectContaining({
            estado: 'ENTREGADO',
            url: dto.url,
            origen: 'ENLACE',
            entregadoPorId: 4,
          }),
        }),
      );
    });

    it('avisa a todo el personal de CP que revisa (no al que entrega)', async () => {
      await service.entregar(11, dto, ana);
      const avisados = notifications.create.mock.calls.map((c) => c[0].userId);
      expect(avisados.sort()).toEqual([1, 2]);
      expect(avisados).not.toContain(4);
    });

    it('si quien entrega es de CP, no se avisa a sí mismo', async () => {
      await service.entregar(11, dto, admin);
      const avisados = notifications.create.mock.calls.map((c) => c[0].userId);
      expect(avisados).toEqual([2]);
    });

    it('el aviso al equipo es solo por campana: no manda correos', async () => {
      await service.entregar(11, dto, ana);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('si no se puede consultar al equipo, igual avisa a quien armó la solicitud', async () => {
      permissions.getCompanyUserIdsWithWriteAccess.mockRejectedValue(new Error('x'));
      await service.entregar(11, dto, ana);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1 }),
      );
    });

    it('anota la entrega en el historial junto con el cambio de estado', async () => {
      await service.entregar(11, dto, ana);
      expect(prisma.cPEntregaHistorial.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entregaId: 11,
          accion: 'ENTREGADO',
          origen: 'ENLACE',
          usuarioId: 4,
        }),
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('lo rechaza si la persona no es responsable y no es de Contratación Pública', async () => {
      const otra: Actor = { userId: 99, companyId: 1, puedeEscribir: false };
      await expect(service.entregar(11, dto, otra)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.cPEntregaDocumento.update).not.toHaveBeenCalled();
    });

    it('el personal de Contratación Pública puede entregar por otra persona', async () => {
      await expect(service.entregar(11, dto, admin)).resolves.toBeDefined();
    });

    it('rechaza un enlace que no es una dirección web', async () => {
      await expect(
        service.entregar(11, { ...dto, url: 'mi-carpeta' }, ana),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza entregar en una solicitud que todavía es borrador', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(
        entrega({ solicitud: { ...entrega().solicitud, estado: 'BORRADOR' } }),
      );
      await expect(service.entregar(11, dto, ana)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('no deja cambiar un documento ya aprobado', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(
        entrega({ estado: 'APROBADO' }),
      );
      await expect(service.entregar(11, dto, ana)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('al entregar de nuevo un documento rechazado se limpia el motivo y la revisión', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(
        entrega({ estado: 'RECHAZADO' }),
      );
      await service.entregar(11, dto, ana);
      expect(prisma.cPEntregaDocumento.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          motivoRechazo: null,
          revisadoPorId: null,
          revisadoAt: null,
        }),
      );
    });
  });

  describe('aprobar / rechazar', () => {
    beforeEach(() => {
      prisma.cPSolicitudMensual.findFirst.mockResolvedValue(
        solicitud({
          estado: 'ENVIADA',
          entregas: [entregaDeSolicitud(11, 'Planilla IESS', [4])],
        }),
      );
    });

    it('solo se aprueba lo que ya fue entregado', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(
        entrega({ estado: 'PENDIENTE' }),
      );
      await expect(service.aprobar(11, admin)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(
        entrega({ estado: 'ENTREGADO' }),
      );
      await service.aprobar(11, admin);
      expect(prisma.cPEntregaDocumento.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ estado: 'APROBADO', revisadoPorId: 1 }),
      );
    });

    it('rechazar guarda el motivo y avisa a los responsables con el motivo', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(
        entrega({ estado: 'ENTREGADO' }),
      );
      await service.rechazar(11, { motivo: '  Es del mes pasado ' }, admin);
      expect(prisma.cPEntregaDocumento.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          estado: 'RECHAZADO',
          motivoRechazo: 'Es del mes pasado',
        }),
      );
      const aviso = notifications.create.mock.calls[0][0];
      expect(aviso.userId).toBe(4);
      expect(aviso.message).toContain('Es del mes pasado');
    });

    it('aprobar y rechazar quedan en el historial (el rechazo con su motivo)', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(
        entrega({ estado: 'ENTREGADO' }),
      );
      await service.aprobar(11, admin);
      expect(prisma.cPEntregaHistorial.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ accion: 'APROBADO', motivo: null, usuarioId: 1 }),
      });
      await service.rechazar(11, { motivo: ' Ilegible ' }, admin);
      expect(prisma.cPEntregaHistorial.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ accion: 'RECHAZADO', motivo: 'Ilegible' }),
      });
    });

    it('un documento aprobado todavía se puede rechazar (para reabrirlo)', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(
        entrega({ estado: 'APROBADO' }),
      );
      await expect(
        service.rechazar(11, { motivo: 'Faltaba una firma' }, admin),
      ).resolves.toBeDefined();
    });

    it('no se rechaza algo que nadie ha entregado', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(
        entrega({ estado: 'PENDIENTE' }),
      );
      await expect(
        service.rechazar(11, { motivo: 'x' }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('actualizarEntrega (con la solicitud ya enviada)', () => {
    beforeEach(() => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(
        entrega({ responsables: [{ userId: 4 }, { userId: 5 }] }),
      );
      prisma.cPSolicitudMensual.findFirst.mockResolvedValue(
        solicitud({ estado: 'ENVIADA' }),
      );
      prisma.$transaction.mockImplementation((cb: any) =>
        cb({
          cPEntregaDocumento: prisma.cPEntregaDocumento,
          cPEntregaResponsable: prisma.cPEntregaResponsable,
        }),
      );
    });

    it('avisa a quien se agrega, quita a quien sale y avisa del cambio de fecha a quien se queda', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 5 }, { id: 6 }]);

      await service.actualizarEntrega(
        11,
        { fechaLimite: '2026-10-15', responsableIds: [5, 6] },
        admin,
      );

      expect(prisma.cPEntregaResponsable.deleteMany).toHaveBeenCalledWith({
        where: { entregaId: 11, userId: { in: [4] } },
      });
      expect(prisma.cPEntregaResponsable.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [{ entregaId: 11, userId: 6 }] }),
      );
      const porUsuario = Object.fromEntries(
        notifications.create.mock.calls.map((c) => [c[0].userId, c[0].title]),
      );
      expect(porUsuario[6]).toBe('Nuevo documento por entregar'); // se agregó
      expect(porUsuario[5]).toBe('Cambió una fecha de entrega'); // se quedó
      expect(porUsuario[4]).toBeUndefined(); // salió
    });

    it('sin cambio de fecha ni de personas no avisa a nadie', async () => {
      await service.actualizarEntrega(
        11,
        { nombre: 'Planilla IESS (corregida)' },
        admin,
      );
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('un cambio de fecha reinicia el recordatorio', async () => {
      await service.actualizarEntrega(11, { fechaLimite: '2026-10-30' }, admin);
      expect(prisma.cPEntregaDocumento.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ ultimoRecordatorioAt: null }),
      );
    });

    it('rechaza a una persona que ya no está disponible', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 5 }]); // pidió 5 y 999, solo existe el 5
      await expect(
        service.actualizarEntrega(11, { responsableIds: [5, 999] }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listarSolicitudes', () => {
    const filas = [
      {
        id: 3,
        anio: 2026,
        mes: 9,
        estado: 'ENVIADA',
        entregas: [
          {
            estado: 'APROBADO',
            fechaLimite: fecha('2026-09-25'),
            responsables: [{ userId: 4 }],
          },
          {
            estado: 'PENDIENTE',
            fechaLimite: fecha('2020-01-01'),
            responsables: [{ userId: 5 }],
          },
        ],
      },
      {
        id: 2,
        anio: 2026,
        mes: 8,
        estado: 'ENVIADA',
        entregas: [
          {
            estado: 'PENDIENTE',
            fechaLimite: fecha('2026-08-25'),
            responsables: [{ userId: 5 }],
          },
        ],
      },
    ];

    it('el personal de CP ve el avance de todo', async () => {
      prisma.cPSolicitudMensual.findMany.mockResolvedValue(filas);
      const r = await service.listarSolicitudes(7, admin);
      expect(r.solicitudes.map((s) => [s.id, s.total, s.aprobadas])).toEqual([
        [3, 2, 1],
        [2, 1, 0],
      ]);
      expect(r.solicitudes[0].vencidas).toBe(1);
    });

    it('quien solo entrega ve solo sus documentos, y no ve los meses donde no tiene nada', async () => {
      prisma.cPSolicitudMensual.findMany.mockResolvedValue(filas);
      const r = await service.listarSolicitudes(7, ana);
      expect(r.solicitudes.map((s) => [s.id, s.total])).toEqual([[3, 1]]);
      // y nunca pide borradores
      expect(
        prisma.cPSolicitudMensual.findMany.mock.calls[0][0].where.estado,
      ).toBe('ENVIADA');
    });
  });

  describe('avisar', () => {
    it('un fallo al notificar no interrumpe la acción principal', async () => {
      notifications.create.mockRejectedValue(new Error('base caída'));
      await expect(
        service.avisar([4], 1, {
          titulo: 't',
          mensaje: 'm',
          link: '/x',
          correo: false,
        }),
      ).resolves.toBeUndefined();
    });

    it('sin correo de envío configurado avisa solo dentro del sistema y no envía nada', async () => {
      prisma.notificationConfig.findUnique.mockResolvedValue(null);
      await service.avisar([4], 1, {
        titulo: 't',
        mensaje: 'm',
        link: '/x',
        correo: true,
      });
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('con correo configurado, un destinatario que falla no impide los demás', async () => {
      prisma.notificationConfig.findUnique.mockResolvedValue({
        senderEmail: 'rrhh@x.com',
        senderName: 'RRHH',
      });
      prisma.user.findMany.mockResolvedValue([
        { email: 'a@x.com', fullName: 'A' },
        { email: 'b@x.com', fullName: 'B' },
      ]);
      mail.sendMail
        .mockRejectedValueOnce(new Error('rebotó'))
        .mockResolvedValueOnce(undefined);
      await service.avisar([4, 5], 1, {
        titulo: 't',
        mensaje: 'm',
        link: '/x',
        correo: true,
      });
      expect(mail.sendMail).toHaveBeenCalledTimes(2);
    });

    it('no repite la notificación si la misma persona viene dos veces', async () => {
      await service.avisar([4, 4], 1, {
        titulo: 't',
        mensaje: 'm',
        link: '/x',
        correo: false,
      });
      expect(notifications.create).toHaveBeenCalledTimes(1);
    });
  });
});

describe('EntregasService: historial, vista previa y bandejas', () => {
  let prisma: any;
  let drive: any;
  let service: EntregasService;

  const admin: Actor = { userId: 1, companyId: 1, puedeEscribir: true };
  const ana: Actor = { userId: 4, companyId: 1, puedeEscribir: false };
  const otra: Actor = { userId: 99, companyId: 1, puedeEscribir: false };

  const subida = (over: Record<string, unknown> = {}) =>
    entrega({
      estado: 'ENTREGADO',
      origen: 'ARCHIVO',
      url: 'https://drive.google.com/file/d/ARCH1/view',
      ...over,
    });

  beforeEach(() => {
    prisma = {
      cPEntidadPublica: {
        findFirst: jest.fn().mockResolvedValue({ ...entidad, driveFolderId: 'ENT' }),
      },
      cPEntregaDocumento: { findFirst: jest.fn(), findMany: jest.fn() },
      cPEntregaHistorial: { findMany: jest.fn() },
    };
    drive = {
      findChildFolderByName: jest.fn().mockResolvedValue({ id: 'MES', name: '2026-09' }),
      getFileMetadata: jest.fn().mockResolvedValue({
        id: 'ARCH1',
        name: 'Planilla.pdf',
        mimeType: 'application/pdf',
        size: 1000,
        parents: ['MES'],
        trashed: false,
      }),
      downloadFileBuffer: jest.fn().mockResolvedValue(Buffer.from('PDF')),
    };
    service = new EntregasService(
      prisma,
      drive as unknown as DriveService,
      {} as unknown as CPEntidadesService,
      { create: jest.fn() } as unknown as NotificationsService,
      { sendMail: jest.fn() } as unknown as GmailMailService,
      { getCompanyUserIdsWithWriteAccess: jest.fn() } as unknown as PermissionsService,
    );
  });

  describe('obtenerArchivo', () => {
    it('sirve el archivo subido con su tipo real', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(subida());
      const r = await service.obtenerArchivo(11, admin);
      expect(r.mimeType).toBe('application/pdf');
      expect(r.nombre).toBe('Planilla.pdf');
      expect(r.buffer.toString()).toBe('PDF');
      expect(drive.findChildFolderByName).toHaveBeenCalledWith('ENT', '2026-09');
    });

    it('lo puede ver quien es responsable del documento', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(subida());
      await expect(service.obtenerArchivo(11, ana)).resolves.toBeDefined();
    });

    it('no lo ve quien no es responsable ni es de CP', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(subida());
      await expect(service.obtenerArchivo(11, otra)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(drive.downloadFileBuffer).not.toHaveBeenCalled();
    });

    it('un enlace externo no se sirve por el servidor', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(
        subida({ origen: 'ENLACE', url: 'https://drive.google.com/file/d/ARCH1/view' }),
      );
      await expect(service.obtenerArchivo(11, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(drive.downloadFileBuffer).not.toHaveBeenCalled();
    });

    it('un archivo que no está en la carpeta del mes no se sirve (no es lector universal de Drive)', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(subida());
      drive.getFileMetadata.mockResolvedValue({
        id: 'ARCH1',
        name: 'Ajeno.pdf',
        mimeType: 'application/pdf',
        size: 10,
        parents: ['OTRA-CARPETA'],
        trashed: false,
      });
      await expect(service.obtenerArchivo(11, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(drive.downloadFileBuffer).not.toHaveBeenCalled();
    });

    it('un archivo en la papelera no se sirve', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(subida());
      drive.getFileMetadata.mockResolvedValue({
        id: 'ARCH1', name: 'x.pdf', mimeType: 'application/pdf',
        size: 10, parents: ['MES'], trashed: true,
      });
      await expect(service.obtenerArchivo(11, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('si la entidad todavía no tiene carpeta en Drive, no se sirve', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(subida());
      prisma.cPEntidadPublica.findFirst.mockResolvedValue({ ...entidad, driveFolderId: null });
      await expect(service.obtenerArchivo(11, admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('historial', () => {
    it('devuelve la línea de tiempo en orden y solo a quien corresponde', async () => {
      prisma.cPEntregaDocumento.findFirst.mockResolvedValue(subida());
      prisma.cPEntregaHistorial.findMany.mockResolvedValue([
        { id: 1, accion: 'ENTREGADO', motivo: null, origen: 'ARCHIVO', usuarioNombre: 'Ana', createdAt: new Date() },
      ]);
      const h = await service.historial(11, ana);
      expect(h).toHaveLength(1);
      expect(prisma.cPEntregaHistorial.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entregaId: 11 } }),
      );
      await expect(service.historial(11, otra)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('bandejas', () => {
    const fila = (id: number, estado: string, limite: string) => ({
      id,
      nombre: `Doc ${id}`,
      descripcion: null,
      estado,
      fechaLimite: new Date(`${limite}T00:00:00Z`),
      motivoRechazo: estado === 'RECHAZADO' ? 'Ilegible' : null,
      origen: null,
      url: null,
      entregadoPorNombre: null,
      entregadoAt: null,
      revisadoPorNombre: null,
      revisadoAt: null,
      department: null,
      solicitud: { id: 3, anio: 2026, mes: 9, entidad: { id: 7, nombre: 'Municipio de Prueba' } },
    });

    it('mis documentos: rechazados primero, luego vencidos, luego por fecha', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-20T15:00:00Z'));
      prisma.cPEntregaDocumento.findMany.mockResolvedValue([
        fila(1, 'PENDIENTE', '2026-09-30'),
        fila(2, 'PENDIENTE', '2026-09-10'), // vencido
        fila(3, 'RECHAZADO', '2026-09-28'),
        fila(4, 'PENDIENTE', '2026-09-22'),
      ]);
      const r = await service.misDocumentos(ana);
      jest.useRealTimers();
      expect(r.map((x: { id: number }) => x.id)).toEqual([3, 2, 4, 1]);
      expect(prisma.cPEntregaDocumento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            responsables: { some: { userId: 4 } },
            estado: { in: ['PENDIENTE', 'RECHAZADO'] },
          }),
        }),
      );
    });

    it('por revisar: solo lo entregado, de la empresa, lo más antiguo primero', async () => {
      prisma.cPEntregaDocumento.findMany.mockResolvedValue([fila(1, 'ENTREGADO', '2026-09-30')]);
      const r = await service.porRevisar(admin);
      expect(r[0]).toEqual(expect.objectContaining({ id: 1, entidadNombre: 'Municipio de Prueba' }));
      expect(prisma.cPEntregaDocumento.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { estado: 'ENTREGADO', solicitud: { companyId: 1, estado: 'ENVIADA' } },
          orderBy: [{ entregadoAt: 'asc' }, { id: 'asc' }],
        }),
      );
    });
  });
});
