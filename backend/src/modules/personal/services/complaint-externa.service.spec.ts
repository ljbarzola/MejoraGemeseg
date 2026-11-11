import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ComplaintExternaService } from './complaint-externa.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { SubmitPublicComplaintDto } from '../dto/complaint-externa.dto';

// Hoy en Ecuador (UTC-5), igual que el servicio.
function diaEcuador(offsetDias = 0): string {
  const ms = Date.now() - 5 * 3_600_000 + offsetDias * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

const OPCIONES = [
  { id: 1, companyId: 7, kind: 'TIPO', label: 'Acoso o discriminación', order: 0 },
  { id: 2, companyId: 7, kind: 'TIPO', label: 'Otro', order: 1 },
  { id: 3, companyId: 7, kind: 'SEDE', label: 'Guayaquil', order: 0 },
  { id: 4, companyId: 7, kind: 'SEDE', label: 'Loja', order: 1 },
];

function dtoBase(
  extra: Partial<SubmitPublicComplaintDto> = {},
): SubmitPublicComplaintDto {
  return {
    tipo: 'Otro',
    sede: 'Guayaquil',
    fechaInduccion: diaEcuador(-1),
    description: 'No me explicaron el reglamento.',
    anonima: true,
    aceptaPrivacidad: true,
    ...extra,
  };
}

describe('ComplaintExternaService', () => {
  let prisma: any;
  let notifications: { create: jest.Mock };
  let permissions: { getCompanyUserIdsWithWriteAccess: jest.Mock };
  let service: ComplaintExternaService;

  beforeEach(() => {
    prisma = {
      complaintPublicSetting: {
        findFirst: jest.fn().mockResolvedValue({ companyId: 7 }),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      complaintPublicOption: {
        findMany: jest.fn().mockResolvedValue(OPCIONES),
        findFirst: jest.fn(),
        count: jest.fn(),
        createMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      complaintStage: {
        findFirst: jest.fn().mockResolvedValue({ key: 'RECIBIDA' }),
      },
      complaint: {
        create: jest.fn().mockResolvedValue({ id: 99 }),
      },
    };
    notifications = { create: jest.fn().mockResolvedValue(undefined) };
    permissions = {
      getCompanyUserIdsWithWriteAccess: jest.fn().mockResolvedValue([1, 2]),
    };
    service = new ComplaintExternaService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      permissions as unknown as PermissionsService,
    );
  });

  describe('formularioPublico', () => {
    it('devuelve solo etiquetas de tipos y sedes de la empresa activa', async () => {
      const r = await service.formularioPublico();
      expect(r).toEqual({
        tipos: ['Acoso o discriminación', 'Otro'],
        sedes: ['Guayaquil', 'Loja'],
      });
    });

    it('responde «no disponible» si ninguna empresa lo tiene activo', async () => {
      prisma.complaintPublicSetting.findFirst.mockResolvedValue(null);
      await expect(service.formularioPublico()).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('enviar', () => {
    it('crea una queja EXTERNA anónima sin autor ni contacto aunque el navegador mande datos', async () => {
      const r = await service.enviar(
        dtoBase({
          contactoEmail: 'no@guardar.com',
          contactoTelefono: '0991112222',
          contactoNombre: 'Nadie',
        }),
      );
      expect(r).toEqual({ ok: true, id: 99 });
      const data = prisma.complaint.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        origen: 'EXTERNA',
        isAnonymous: true,
        submittedBy: null,
        companyId: 7,
        status: 'RECIBIDA',
        tipo: 'Otro',
        sede: 'Guayaquil',
        contactoNombre: null,
        contactoEmail: null,
        contactoTelefono: null,
      });
    });

    it('guarda el contacto (correo en minúsculas) cuando NO es anónima', async () => {
      await service.enviar(
        dtoBase({
          anonima: false,
          contactoNombre: ' Ana ',
          contactoEmail: 'Ana@Correo.COM',
        }),
      );
      const data = prisma.complaint.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        isAnonymous: false,
        submittedBy: null,
        contactoNombre: 'Ana',
        contactoEmail: 'ana@correo.com',
        contactoTelefono: null,
      });
    });

    it('guarda las personas involucradas recortadas, o null si vienen vacías', async () => {
      await service.enviar(dtoBase({ personasInvolucradas: '  Instructor de turno ' }));
      expect(prisma.complaint.create.mock.calls[0][0].data.personasInvolucradas).toBe(
        'Instructor de turno',
      );
      await service.enviar(dtoBase({ personasInvolucradas: '   ' }));
      expect(prisma.complaint.create.mock.calls[1][0].data.personasInvolucradas).toBeNull();
    });

    it('exige aceptar la política de privacidad', async () => {
      await expect(
        service.enviar(dtoBase({ aceptaPrivacidad: false })),
      ).rejects.toThrow('política de privacidad');
      expect(prisma.complaint.create).not.toHaveBeenCalled();
    });

    it('si el campo trampa de robots trae algo, responde ok pero no guarda nada', async () => {
      const r = await service.enviar(dtoBase({ sitioWeb: 'http://spam' }));
      expect(r).toEqual({ ok: true });
      expect(prisma.complaint.create).not.toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('rechaza si el formulario no está activo', async () => {
      prisma.complaintPublicSetting.findFirst.mockResolvedValue(null);
      await expect(service.enviar(dtoBase())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza un tipo o una sede que no están en la lista de la empresa', async () => {
      await expect(service.enviar(dtoBase({ tipo: 'Inventado' }))).rejects.toThrow('tipo de queja');
      await expect(service.enviar(dtoBase({ sede: 'Quito' }))).rejects.toThrow('sede');
    });

    it('rechaza fecha de inducción futura, mal escrita o de hace más de 5 años', async () => {
      await expect(
        service.enviar(dtoBase({ fechaInduccion: diaEcuador(3) })),
      ).rejects.toThrow('futura');
      await expect(
        service.enviar(dtoBase({ fechaInduccion: '10/11/2026' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.enviar(dtoBase({ fechaInduccion: diaEcuador(-365 * 6) })),
      ).rejects.toThrow('año');
    });

    it('pide correo o teléfono cuando no es anónima, y valida su formato', async () => {
      await expect(service.enviar(dtoBase({ anonima: false }))).rejects.toThrow('correo o un teléfono');
      await expect(
        service.enviar(dtoBase({ anonima: false, contactoEmail: 'malo' })),
      ).rejects.toThrow('correo');
      await expect(
        service.enviar(dtoBase({ anonima: false, contactoTelefono: 'abc' })),
      ).rejects.toThrow('teléfono');
    });

    it('rechaza una descripción de menos de 5 caracteres', async () => {
      await expect(service.enviar(dtoBase({ description: ' hola ' }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza si la empresa no tiene etapa inicial de quejas', async () => {
      prisma.complaintStage.findFirst.mockResolvedValue(null);
      await expect(service.enviar(dtoBase())).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.complaint.create).not.toHaveBeenCalled();
    });

    it('avisa en la campana a cada persona de RRHH con escritura', async () => {
      await service.enviar(dtoBase());
      expect(permissions.getCompanyUserIdsWithWriteAccess).toHaveBeenCalledWith(7, 'RRHH');
      expect(notifications.create).toHaveBeenCalledTimes(2);
      expect(notifications.create.mock.calls[0][0]).toMatchObject({
        userId: 1,
        companyId: 7,
        title: 'Nueva queja externa',
        link: '/rrhh/quejas/gestion',
      });
    });

    it('si la campana falla, la queja ya quedó guardada y no se pierde', async () => {
      notifications.create.mockRejectedValue(new Error('campana caída'));
      await expect(service.enviar(dtoBase())).resolves.toEqual({ ok: true, id: 99 });
      expect(prisma.complaint.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('configuración de RRHH', () => {
    it('no deja activarlo si otra empresa ya lo recibe', async () => {
      prisma.complaintPublicSetting.findFirst.mockResolvedValue({ companyId: 99, enabled: true });
      await expect(service.setEnabled(7, true)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.complaintPublicSetting.upsert).not.toHaveBeenCalled();
    });

    it('no deja activarlo sin etapa inicial en el tablero', async () => {
      prisma.complaintPublicSetting.findFirst.mockResolvedValue(null);
      prisma.complaintStage.findFirst.mockResolvedValue(null);
      await expect(service.setEnabled(7, true)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('la primera vez siembra Guayaquil y Loja y los tipos base', async () => {
      prisma.complaintPublicSetting.findFirst.mockResolvedValue(null);
      prisma.complaintPublicOption.count.mockResolvedValue(0);
      jest.spyOn(service, 'getConfig').mockResolvedValue({} as never);
      await service.setEnabled(7, true);
      const data = prisma.complaintPublicOption.createMany.mock.calls[0][0].data;
      expect(data.filter((o: any) => o.kind === 'SEDE').map((o: any) => o.label)).toEqual([
        'Guayaquil',
        'Loja',
      ]);
      expect(data.filter((o: any) => o.kind === 'TIPO').length).toBeGreaterThanOrEqual(4);
      expect(prisma.complaintPublicSetting.upsert).toHaveBeenCalledWith({
        where: { companyId: 7 },
        create: { companyId: 7, enabled: true },
        update: { enabled: true },
      });
    });

    it('no vuelve a sembrar si la empresa ya tiene opciones, y apagarlo no exige nada', async () => {
      prisma.complaintPublicSetting.findFirst.mockResolvedValue(null);
      prisma.complaintPublicOption.count.mockResolvedValue(4);
      jest.spyOn(service, 'getConfig').mockResolvedValue({} as never);
      await service.setEnabled(7, true);
      expect(prisma.complaintPublicOption.createMany).not.toHaveBeenCalled();
      await service.setEnabled(7, false);
      expect(prisma.complaintStage.findFirst).toHaveBeenCalledTimes(1); // solo al activar
    });

    it('addOption rechaza duplicados y numera la siguiente opción', async () => {
      prisma.complaintPublicOption.findFirst.mockResolvedValueOnce({ id: 1 });
      await expect(
        service.addOption(7, { kind: 'SEDE', label: 'loja' }),
      ).rejects.toBeInstanceOf(ConflictException);

      prisma.complaintPublicOption.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ order: 3 });
      prisma.complaintPublicOption.create.mockResolvedValue({ id: 9 });
      await service.addOption(7, { kind: 'SEDE', label: ' Quito ' });
      expect(prisma.complaintPublicOption.create).toHaveBeenCalledWith({
        data: { companyId: 7, kind: 'SEDE', label: 'Quito', order: 4 },
      });
    });

    it('removeOption solo borra opciones de la propia empresa', async () => {
      prisma.complaintPublicOption.findFirst.mockResolvedValue(null);
      await expect(service.removeOption(7, 123)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.complaintPublicOption.findFirst).toHaveBeenCalledWith({
        where: { id: 123, companyId: 7 },
      });
      expect(prisma.complaintPublicOption.delete).not.toHaveBeenCalled();
    });
  });
});
