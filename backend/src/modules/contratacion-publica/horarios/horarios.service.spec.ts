import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CPHorariosService } from './horarios.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CPPatronRotacionService } from '../puestos/patron-rotacion.service';

function makeHorario(overrides: Partial<any> = {}) {
  return {
    id: 1,
    companyId: 1,
    contratoId: 1,
    anio: 2026,
    mes: 9,
    fechaInicio: new Date('2026-09-01'),
    fechaFin: new Date('2026-09-30'),
    estado: 'BORRADOR',
    motivoRechazo: null,
    enviadoAt: null,
    aprobadoAt: null,
    createdBy: 1,
    ...overrides,
  };
}

describe('CPHorariosService', () => {
  let service: CPHorariosService;
  let patronRotacionService: {
    assertGuardiasDelPuesto: jest.Mock;
    calcular: jest.Mock;
  };
  let prisma: {
    cPHorarioMensual: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    cPContrato: { findFirst: jest.Mock };
    cPPuestoServicio: { findFirst: jest.Mock; findMany: jest.Mock };
    cPCodigoTurno: { findMany: jest.Mock };
    cPHorarioCelda: {
      upsert: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      createMany: jest.Mock;
      update: jest.Mock;
    };
    cPPatronRotacion: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      cPHorarioMensual: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      cPContrato: { findFirst: jest.fn() },
      cPPuestoServicio: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      cPCodigoTurno: { findMany: jest.fn().mockResolvedValue([]) },
      cPHorarioCelda: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      cPPatronRotacion: { upsert: jest.fn() },
      $transaction: jest.fn(),
    };
    patronRotacionService = {
      assertGuardiasDelPuesto: jest.fn().mockResolvedValue(undefined),
      calcular: jest.fn(),
    };
    service = new CPHorariosService(
      prisma as unknown as PrismaService,
      patronRotacionService as unknown as CPPatronRotacionService,
    );
  });

  describe('create', () => {
    it('rejects a rango de fechas that overlaps an existing horario of the same contrato', async () => {
      prisma.cPContrato.findFirst.mockResolvedValue({ id: 1, companyId: 1 });
      prisma.cPHorarioMensual.findMany.mockResolvedValue([makeHorario()]);

      await expect(
        service.create(
          { contratoId: 1, fechaInicio: '2026-09-15', fechaFin: '2026-10-15' },
          1,
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.cPHorarioMensual.create).not.toHaveBeenCalled();
    });

    it('allows a rango de fechas that does not overlap', async () => {
      prisma.cPContrato.findFirst.mockResolvedValue({ id: 1, companyId: 1 });
      prisma.cPHorarioMensual.findMany.mockResolvedValue([makeHorario()]);
      prisma.cPHorarioMensual.create.mockResolvedValue(makeHorario());

      await service.create(
        { contratoId: 1, fechaInicio: '2026-10-01', fechaFin: '2026-10-31' },
        1,
        1,
      );

      expect(prisma.cPHorarioMensual.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: 1, createdBy: 1 }),
        }),
      );
    });

    it('creates the horario in BORRADOR deriving anio/mes de fechaInicio', async () => {
      prisma.cPContrato.findFirst.mockResolvedValue({ id: 1, companyId: 1 });
      prisma.cPHorarioMensual.findMany.mockResolvedValue([]);
      prisma.cPHorarioMensual.create.mockResolvedValue(makeHorario());

      await service.create(
        { contratoId: 1, fechaInicio: '2026-07-30', fechaFin: '2026-08-29' },
        1,
        1,
      );

      expect(prisma.cPHorarioMensual.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ anio: 2026, mes: 7 }),
        }),
      );
    });
  });

  describe('cambiarEstado', () => {
    it('allows BORRADOR -> ENVIADO when la cobertura mínima está completa', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(makeHorario());
      prisma.cPPuestoServicio.findMany.mockResolvedValue([]);
      prisma.cPHorarioCelda.findMany.mockResolvedValue([]);
      prisma.cPCodigoTurno.findMany.mockResolvedValue([]);
      prisma.cPHorarioMensual.update.mockResolvedValue(
        makeHorario({ estado: 'ENVIADO' }),
      );

      const result = await service.cambiarEstado(1, { estado: 'ENVIADO' }, 1);

      expect(prisma.cPHorarioMensual.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ estado: 'ENVIADO' }),
        }),
      );
      expect(result.estado).toBe('ENVIADO');
    });

    it('rejects BORRADOR -> ENVIADO when a puesto no cumple la cobertura mínima', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(
        makeHorario({
          fechaInicio: new Date('2026-09-01'),
          fechaFin: new Date('2026-09-01'),
        }),
      );
      prisma.cPPuestoServicio.findMany.mockResolvedValue([
        { id: 1, nombre: 'Garita norte', guardiasSimultaneosRequeridos: 2 },
      ]);
      prisma.cPHorarioCelda.findMany.mockResolvedValue([
        {
          puestoId: 1,
          fecha: new Date('2026-09-01'),
          codigoTurno: 'D',
        },
      ]);
      prisma.cPCodigoTurno.findMany.mockResolvedValue([
        { codigo: 'D', esDescanso: false },
      ]);

      await expect(
        service.cambiarEstado(1, { estado: 'ENVIADO' }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.cPHorarioMensual.update).not.toHaveBeenCalled();
    });

    it('rejects BORRADOR -> APROBADO directly (must go through ENVIADO)', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(makeHorario());

      await expect(
        service.cambiarEstado(1, { estado: 'APROBADO' }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.cPHorarioMensual.update).not.toHaveBeenCalled();
    });

    it('allows ENVIADO -> RECHAZADO with motivo', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(
        makeHorario({ estado: 'ENVIADO' }),
      );
      prisma.cPHorarioMensual.update.mockResolvedValue(
        makeHorario({ estado: 'RECHAZADO', motivoRechazo: 'Falta personal' }),
      );

      await service.cambiarEstado(
        1,
        { estado: 'RECHAZADO', motivoRechazo: 'Falta personal' },
        1,
      );

      expect(prisma.cPHorarioMensual.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            estado: 'RECHAZADO',
            motivoRechazo: 'Falta personal',
          }),
        }),
      );
    });

    it('allows RECHAZADO -> BORRADOR to correct and resend', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(
        makeHorario({ estado: 'RECHAZADO', motivoRechazo: 'Falta personal' }),
      );
      prisma.cPHorarioMensual.update.mockResolvedValue(
        makeHorario({ estado: 'BORRADOR' }),
      );

      await service.cambiarEstado(1, { estado: 'BORRADOR' }, 1);

      expect(prisma.cPHorarioMensual.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            estado: 'BORRADOR',
            motivoRechazo: null,
          }),
        }),
      );
    });

    it('rejects any transition out of APROBADO (terminal)', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(
        makeHorario({ estado: 'APROBADO' }),
      );

      await expect(
        service.cambiarEstado(1, { estado: 'BORRADOR' }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.cPHorarioMensual.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the horario does not belong to the company', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(null);

      await expect(
        service.cambiarEstado(1, { estado: 'ENVIADO' }, 1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('upsertCelda', () => {
    it('rejects editing a celda when the horario is not in BORRADOR', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(
        makeHorario({ estado: 'ENVIADO' }),
      );

      await expect(
        service.upsertCelda(
          1,
          {
            puestoId: 1,
            cedula: '123',
            nombreGuardia: 'Juan',
            fecha: '2026-09-01',
            codigoTurno: 'D',
          },
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.cPHorarioCelda.upsert).not.toHaveBeenCalled();
    });

    it('rejects when the puesto does not belong to the horario contrato', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(makeHorario());
      prisma.cPPuestoServicio.findFirst.mockResolvedValue(null);

      await expect(
        service.upsertCelda(
          1,
          {
            puestoId: 99,
            cedula: '123',
            nombreGuardia: 'Juan',
            fecha: '2026-09-01',
            codigoTurno: 'D',
          },
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.cPHorarioCelda.upsert).not.toHaveBeenCalled();
    });

    it('upserts the celda when the horario is editable', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(makeHorario());
      prisma.cPPuestoServicio.findFirst.mockResolvedValue({ id: 1 });
      prisma.cPHorarioCelda.upsert.mockResolvedValue({});

      await service.upsertCelda(
        1,
        {
          puestoId: 1,
          cedula: '123',
          nombreGuardia: 'Juan',
          fecha: '2026-09-01',
          codigoTurno: 'D',
        },
        1,
      );

      expect(prisma.cPHorarioCelda.upsert).toHaveBeenCalled();
    });
  });

  describe('intercambiarTurno', () => {
    it('swaps the codigoTurno between the two celdas of the same puesto, in a transaction', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(makeHorario());
      prisma.cPPuestoServicio.findFirst.mockResolvedValue({ id: 1 });
      prisma.cPHorarioCelda.findFirst
        .mockResolvedValueOnce({ id: 10, codigoTurno: 'D' })
        .mockResolvedValueOnce({ id: 11, codigoTurno: 'N' });
      prisma.$transaction.mockResolvedValue([{}, {}]);

      await service.intercambiarTurno(
        1,
        { puestoId: 1, fecha: '2026-09-01', cedulaA: '111', cedulaB: '222' },
        1,
      );

      expect(prisma.cPHorarioCelda.findFirst).toHaveBeenNthCalledWith(1, {
        where: {
          horarioId: 1,
          puestoId: 1,
          cedula: '111',
          fecha: new Date('2026-09-01'),
        },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.anything(),
        expect.anything(),
      ]);
      expect(prisma.cPHorarioCelda.update).toHaveBeenNthCalledWith(1, {
        where: { id: 10 },
        data: { codigoTurno: 'N' },
      });
      expect(prisma.cPHorarioCelda.update).toHaveBeenNthCalledWith(2, {
        where: { id: 11 },
        data: { codigoTurno: 'D' },
      });
    });

    it('throws NotFoundException when one of the celdas is missing', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(makeHorario());
      prisma.cPPuestoServicio.findFirst.mockResolvedValue({ id: 1 });
      prisma.cPHorarioCelda.findFirst
        .mockResolvedValueOnce({ id: 10, codigoTurno: 'D' })
        .mockResolvedValueOnce(null);

      await expect(
        service.intercambiarTurno(
          1,
          { puestoId: 1, fecha: '2026-09-01', cedulaA: '111', cedulaB: '222' },
          1,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when el puestoId no pertenece al contrato del horario', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(makeHorario());
      prisma.cPPuestoServicio.findFirst.mockResolvedValue(null);

      await expect(
        service.intercambiarTurno(
          1,
          { puestoId: 99, fecha: '2026-09-01', cedulaA: '111', cedulaB: '222' },
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.cPHorarioCelda.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('generarPatron', () => {
    const dto = {
      puestoId: 1,
      patron: {
        tramos: [{ codigoTurno: 'D', dias: 2 }],
        coberturaSimultanea: 1,
        ordenGuardias: [{ cedula: '111', nombreGuardia: 'Juan' }],
        fechaInicioCiclo: '2026-09-01',
      },
    };

    it('rechaza si calcularPatronRotacion devuelve error', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(makeHorario());
      prisma.cPPuestoServicio.findFirst.mockResolvedValue({ id: 1 });
      patronRotacionService.calcular.mockReturnValue({
        ok: false,
        error: 'Error de validación',
      });

      await expect(
        service.generarPatron(1, dto as any, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('guarda el patrón y reemplaza las celdas cuando el cálculo es válido', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(makeHorario());
      prisma.cPPuestoServicio.findFirst.mockResolvedValue({ id: 1 });
      patronRotacionService.calcular.mockReturnValue({
        ok: true,
        celdas: [
          {
            cedula: '111',
            nombreGuardia: 'Juan',
            fecha: '2026-09-01',
            codigoTurno: 'D',
          },
        ],
        cicloLongitud: 2,
        numGrupos: 1,
        desfaseDias: 2,
      });
      const tx = {
        cPPatronRotacion: { upsert: jest.fn() },
        cPHorarioCelda: {
          deleteMany: jest.fn(),
          createMany: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      await service.generarPatron(1, dto, 1);

      expect(tx.cPPatronRotacion.upsert).toHaveBeenCalled();
      expect(tx.cPHorarioCelda.deleteMany).toHaveBeenCalledWith({
        where: { horarioId: 1, puestoId: 1 },
      });
      expect(tx.cPHorarioCelda.createMany).toHaveBeenCalled();
    });

    it('no guarda el patrón si guardarComoPatronDelPuesto es false', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(makeHorario());
      prisma.cPPuestoServicio.findFirst.mockResolvedValue({ id: 1 });
      patronRotacionService.calcular.mockReturnValue({
        ok: true,
        celdas: [],
        cicloLongitud: 2,
        numGrupos: 1,
        desfaseDias: 2,
      });
      const tx = {
        cPPatronRotacion: { upsert: jest.fn() },
        cPHorarioCelda: {
          deleteMany: jest.fn(),
          createMany: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      prisma.$transaction.mockImplementation((cb: any) => cb(tx));

      await service.generarPatron(
        1,
        { ...dto, guardarComoPatronDelPuesto: false },
        1,
      );

      expect(tx.cPPatronRotacion.upsert).not.toHaveBeenCalled();
    });

    it('rejects when the horario is not BORRADOR', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(
        makeHorario({ estado: 'ENVIADO' }),
      );

      await expect(
        service.generarPatron(1, dto as any, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(patronRotacionService.calcular).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('rejects deleting a horario that is not BORRADOR', async () => {
      prisma.cPHorarioMensual.findFirst.mockResolvedValue(
        makeHorario({ estado: 'APROBADO' }),
      );

      await expect(service.remove(1, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.cPHorarioMensual.delete).not.toHaveBeenCalled();
    });
  });
});
