import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContabilidadService } from './contabilidad.service';
import { PrismaService } from '../../prisma/prisma.service';
import { diaEcuador, tarifaVigente } from './tarifas.util';

function makeCustodia(overrides: Partial<any> = {}) {
  return {
    id: 1,
    numeroGuia: 'G-001',
    tipoCustodia: 'HACIENDA',
    estado: 'LLEGO',
    choferName: 'Juan Chofer',
    choferCedula: '1111111111',
    custodio1Name: 'Ana Custodio',
    custodio1Cedula: '2222222222',
    custodio2Name: 'Luis Custodio',
    custodio2Cedula: '3333333333',
    cliente: 'Cliente X',
    placa: 'ABC-123',
    direccionSalida: 'Origen',
    direccionLlegada: 'Destino',
    fechaHoraSalida: new Date('2026-08-01T15:00:00Z'),
    fechaHoraLlegada: new Date('2026-08-01T19:00:00Z'),
    createdAt: new Date('2026-08-01T14:00:00Z'),
    companyId: 1,
    ...overrides,
  };
}

const TARIFAS_2020 = [
  { tipo: 'HACIENDA', valorPorPersona: 20, vigenteDesde: '2020-01-01' },
  { tipo: 'PUERTO', valorPorPersona: 10, vigenteDesde: '2020-01-01' },
  { tipo: 'VIP', valorPorPersona: 23, vigenteDesde: '2020-01-01' },
];

describe('tarifas.util', () => {
  it('usa la tarifa vigente el día del viaje, no la más nueva', () => {
    const tarifas = [
      ...TARIFAS_2020,
      { tipo: 'HACIENDA', valorPorPersona: 25, vigenteDesde: '2026-09-01' },
    ];
    expect(tarifaVigente(tarifas, 'HACIENDA', '2026-08-31')).toBe(20);
    expect(tarifaVigente(tarifas, 'HACIENDA', '2026-09-01')).toBe(25);
  });

  it('sin tarifa que cubra la fecha devuelve null (no cero)', () => {
    expect(tarifaVigente(TARIFAS_2020, 'HACIENDA', '2019-12-31')).toBeNull();
    expect(tarifaVigente([], 'VIP', '2026-08-01')).toBeNull();
  });

  it('el día de Ecuador es UTC-5', () => {
    expect(diaEcuador(new Date('2026-08-02T03:00:00Z'))).toBe('2026-08-01');
  });
});

describe('ContabilidadService', () => {
  let service: ContabilidadService;
  let prisma: {
    custodia: { findMany: jest.Mock; findFirst: jest.Mock };
    employeeDriveFolder: { findMany: jest.Mock; findFirst: jest.Mock };
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
  };
  // Filas de «ContabAjusteCustodia» que devuelve la base simulada (cada prueba pone las suyas).
  let ajustes: any[];
  // Filas de «ContabPagoCustodia» (pagos registrados como pagados).
  let pagados: any[];

  beforeEach(() => {
    ajustes = [];
    pagados = [];
    prisma = {
      custodia: { findMany: jest.fn(), findFirst: jest.fn() },
      employeeDriveFolder: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      // Una sola función atiende todas las consultas crudas: según la tabla que nombra la consulta devuelve ajustes o tarifas.
      $queryRaw: jest.fn().mockImplementation((strings: TemplateStringsArray) => {
        const sql = strings.join('');
        if (sql.includes('ContabAjusteCustodia')) return Promise.resolve(ajustes);
        if (sql.includes('ContabPagoCustodia')) return Promise.resolve(pagados);
        return Promise.resolve(TARIFAS_2020);
      }),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    service = new ContabilidadService(prisma as unknown as PrismaService);
  });

  describe('getNomina', () => {
    it('solo paga custodias LLEGÓ, con la tarifa completa por persona', async () => {
      prisma.custodia.findMany.mockResolvedValue([
        makeCustodia({ id: 1, tipoCustodia: 'HACIENDA' }),
      ]);
      const nomina = await service.getNomina(1, '2026-08-01', '2026-08-31');

      expect(prisma.custodia.findMany.mock.calls[0][0].where.estado).toBe('LLEGO');
      expect(nomina.resumen.total_custodias).toBe(1);
      expect(nomina.resumen.total_pagado).toBe(60); // 3 personas x $20 (HACIENDA)
      expect(nomina.empleados).toHaveLength(3);
      expect(nomina.empleados.every((e) => e.total_usd === 20)).toBe(true);
    });

    it('suma dos veces a la misma persona si aparece en dos roles del viaje', async () => {
      prisma.custodia.findMany.mockResolvedValue([
        makeCustodia({
          tipoCustodia: 'VIP',
          choferCedula: '1111111111',
          custodio1Cedula: '1111111111',
          custodio1Name: 'Juan Chofer',
        }),
      ]);
      const nomina = await service.getNomina(1, '2026-08-01', '2026-08-31');
      const juan = nomina.empleados.find((e) => e.cedula === '1111111111');
      expect(juan?.total_viajes).toBe(2);
      expect(juan?.total_usd).toBe(46); // 2 x $23 (VIP)
    });

    it('un tipo sin tarifa se cuenta pero paga 0 y se avisa', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { tipo: 'PUERTO', valorPorPersona: 10, vigenteDesde: '2020-01-01' },
      ]);
      prisma.custodia.findMany.mockResolvedValue([
        makeCustodia({ tipoCustodia: 'HACIENDA' }),
      ]);
      const nomina = await service.getNomina(1, '2026-08-01', '2026-08-31');
      expect(nomina.resumen.total_pagado).toBe(0);
      expect(nomina.resumen.viajes_sin_tarifa).toBe(1);
      expect(nomina.resumen.tipos_sin_tarifa).toEqual(['HACIENDA']);
    });

    it('rechaza un período sin fechas', async () => {
      await expect(service.getNomina(1, '', '')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getPagos', () => {
    it('da una fila por persona y viaje, de todos los viajes que llegaron, con la tarifa del día', async () => {
      prisma.custodia.findMany.mockResolvedValue([
        makeCustodia({ id: 1, tipoCustodia: 'HACIENDA' }),
        makeCustodia({ id: 2, numeroGuia: 'G-002', tipoCustodia: 'PUERTO' }),
      ]);
      const { pagos } = await service.getPagos(1);

      expect(prisma.custodia.findMany.mock.calls[0][0].where.estado).toBe('LLEGO');
      expect(pagos).toHaveLength(6); // 2 viajes x 3 personas
      expect(pagos.filter((p) => p.numeroGuia === 'G-001').every((p) => p.monto === 20)).toBe(true);
      expect(pagos.filter((p) => p.numeroGuia === 'G-002').every((p) => p.monto === 10)).toBe(true);
      expect(pagos.map((p) => p.rol)).toEqual(expect.arrayContaining(['Chofer', 'Custodio 1', 'Custodio 2']));
    });

    it('marca sin tarifa (y paga 0) el viaje cuyo tipo no tiene tarifa ese día', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.custodia.findMany.mockResolvedValue([makeCustodia()]);
      const { pagos } = await service.getPagos(1);
      expect(pagos.every((p) => p.sinTarifa && p.monto === 0)).toBe(true);
    });
  });

  describe('getDashboard', () => {
    it('totaliza solo las finalizadas, por 3 personas', async () => {
      prisma.custodia.findMany.mockResolvedValue([
        makeCustodia({ id: 1, tipoCustodia: 'HACIENDA' }),
      ]);
      const d = await service.getDashboard(1, '2026-08');
      expect(d.kpis.viajes_finalizados).toBe(1);
      expect(d.kpis.total_nomina_usd).toBe(60);
      expect(d.por_tipo.find((t) => t.tipo === 'HACIENDA')?.total_costo).toBe(60);
    });
  });

  describe('ajustes (extras y descuentos)', () => {
    const ajuste = (o: Partial<any> = {}) => ({
      id: 1, tipo: 'EXTRA', cedula: '1111111111', persona: 'Juan Chofer', fecha: '2026-08-01',
      monto: 5, concepto: 'Espera extra', custodiaId: null, numeroGuia: null, ...o,
    });

    it('el extra y el descuento se suman al neto del rol de pago, aunque no sean de un viaje', async () => {
      prisma.custodia.findMany.mockResolvedValue([makeCustodia()]);
      ajustes = [
        ajuste({ id: 1, tipo: 'EXTRA', monto: 5 }),
        ajuste({ id: 2, tipo: 'DESCUENTO', monto: 2, concepto: 'Uniforme' }),
      ];
      const nomina = await service.getNomina(1, '2026-08-01', '2026-08-31');
      const juan = nomina.empleados.find((e) => e.cedula === '1111111111');
      expect(juan?.subtotal_viajes_usd).toBe(20);
      expect(juan?.ajustes_usd).toBe(3);
      expect(juan?.total_usd).toBe(23);
      expect(nomina.resumen.total_pagado).toBe(63); // 3 x $20 + (5 - 2)
    });

    it('una persona con solo un descuento y sin viajes aparece en el rol del período', async () => {
      prisma.custodia.findMany.mockResolvedValue([]);
      ajustes = [ajuste({ tipo: 'DESCUENTO', cedula: '9999999999', persona: 'Pedro Libre', monto: 10 })];
      const nomina = await service.getNomina(1, '2026-08-01', '2026-08-31');
      const pedro = nomina.empleados.find((e) => e.cedula === '9999999999');
      expect(pedro?.total_viajes).toBe(0);
      expect(pedro?.total_usd).toBe(-10);
    });

    it('el ajuste ligado a un viaje sale en la fila de esa persona en ese viaje', async () => {
      prisma.custodia.findMany.mockResolvedValue([makeCustodia({ id: 7 })]);
      ajustes = [ajuste({ custodiaId: 7, numeroGuia: 'G-001', monto: 5 })];
      const { pagos } = await service.getPagos(1);
      const juan = pagos.find((p) => p.cedula === '1111111111')!;
      expect(juan.monto).toBe(20);
      expect(juan.ajuste).toBe(5);
      expect(juan.total).toBe(25);
      expect(pagos.filter((p) => p.cedula !== '1111111111').every((p) => p.ajuste === 0)).toBe(true);
    });

    it('el dashboard suma los ajustes del mes al total, pero el promedio por viaje usa solo los viajes', async () => {
      prisma.custodia.findMany.mockResolvedValue([makeCustodia()]);
      ajustes = [ajuste({ tipo: 'DESCUENTO', monto: 10 })];
      const d = await service.getDashboard(1, '2026-08');
      expect(d.kpis.total_nomina_usd).toBe(50); // 60 - 10
      expect(d.kpis.ajustes_usd).toBe(-10);
      expect(d.kpis.promedio_por_viaje).toBe(60);
    });

    it('rechaza tipo, monto, motivo y persona inválidos sin tocar la base', async () => {
      const base = { tipo: 'EXTRA', persona: 'Juan', monto: 5, concepto: 'Motivo', fecha: '2026-08-01' };
      for (const malo of [
        { ...base, tipo: 'OTRO' },
        { ...base, monto: 0 },
        { ...base, concepto: '  ' },
        { ...base, persona: '' },
        { ...base, fecha: undefined },
      ]) {
        await expect(service.crearAjuste(1, 9, malo as any)).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('no deja ligar el ajuste a un viaje en el que la persona no participó', async () => {
      prisma.custodia.findFirst.mockResolvedValue(makeCustodia({ id: 7 }));
      await expect(
        service.crearAjuste(1, 9, {
          tipo: 'EXTRA', persona: 'Otra Persona', cedula: '5555555555', monto: 5, concepto: 'Extra', custodiaId: 7,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('un ajuste de un viaje toma el día de ese viaje', async () => {
      prisma.custodia.findFirst.mockResolvedValue(makeCustodia({ id: 7 })); // salió 2026-08-01 10:00 Ecuador
      await service.crearAjuste(1, 9, {
        tipo: 'EXTRA', persona: 'Juan Chofer', cedula: '1111111111', monto: 5, concepto: 'Extra',
        custodiaId: 7, fecha: '2030-01-01',
      });
      expect(prisma.$executeRaw).toHaveBeenCalled();
      const valores = prisma.$executeRaw.mock.calls[0].slice(1);
      expect(valores).toContain('2026-08-01');
      expect(valores).not.toContain('2030-01-01');
    });

    it('editar o quitar un ajuste que no es de la empresa avisa que no existe', async () => {
      ajustes = [];
      await expect(
        service.actualizarAjuste(1, 5, { tipo: 'EXTRA', persona: 'Juan', monto: 5, concepto: 'x', fecha: '2026-08-01' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      prisma.$executeRaw.mockResolvedValue(0);
      await expect(service.eliminarAjuste(1, 5)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('pagos registrados (pagado / deshacer)', () => {
    it('registra el pago congelando tarifa, ajuste y total, y se salta el que ya estaba pagado', async () => {
      prisma.custodia.findMany.mockResolvedValue([makeCustodia({ id: 7 })]);
      pagados = [{ id: 1, custodiaId: 7, rol: 'Chofer', monto: 20, ajuste: 0, total: 20, pagadoEn: '2026-08-02', referencia: null }];
      const r = await service.registrarPagos(1, 9, {
        items: [{ custodiaId: 7, rol: 'Chofer' }, { custodiaId: 7, rol: 'Custodio 1' }],
        fecha: '2026-08-03',
        referencia: ' Transf. 123 ',
      });
      expect(r).toEqual({ registrados: 1, yaPagados: 1 });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const valores = prisma.$executeRaw.mock.calls[0].slice(1);
      expect(valores).toEqual(expect.arrayContaining([7, 'Custodio 1', 20, '2026-08-03', 'Transf. 123']));
    });

    it('el pago registrado se ve con lo que se congeló aunque la tarifa de hoy sea otra', async () => {
      prisma.custodia.findMany.mockResolvedValue([makeCustodia({ id: 7 })]);
      pagados = [{ id: 4, custodiaId: 7, rol: 'Chofer', monto: 15, ajuste: 2, total: 17, pagadoEn: '2026-08-02', referencia: 'T-9' }];
      const { pagos } = await service.getPagos(1);
      const chofer = pagos.find((p) => p.rol === 'Chofer')!;
      expect(chofer).toEqual(expect.objectContaining({ pagado: true, monto: 15, ajuste: 2, total: 17, pagoId: 4, referencia: 'T-9' }));
      const custodio = pagos.find((p) => p.rol === 'Custodio 1')!;
      expect(custodio).toEqual(expect.objectContaining({ pagado: false, monto: 20, total: 20, pagoId: null }));
    });

    it('rechaza fecha futura, lista vacía, un pago que no existe y un viaje sin tarifa', async () => {
      prisma.custodia.findMany.mockResolvedValue([makeCustodia({ id: 7 })]);
      await expect(service.registrarPagos(1, 9, { items: [] })).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.registrarPagos(1, 9, { items: [{ custodiaId: 7, rol: 'Chofer' }], fecha: '2999-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.registrarPagos(1, 9, { items: [{ custodiaId: 99, rol: 'Chofer' }] }),
      ).rejects.toBeInstanceOf(BadRequestException);

      prisma.$queryRaw.mockImplementation(() => Promise.resolve([]));
      await expect(
        service.registrarPagos(1, 9, { items: [{ custodiaId: 7, rol: 'Chofer' }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('deshacer exige ids y avisa si no existen', async () => {
      await expect(service.deshacerPagos(1, [])).rejects.toBeInstanceOf(BadRequestException);
      prisma.$executeRaw.mockResolvedValue(0);
      await expect(service.deshacerPagos(1, [5])).rejects.toBeInstanceOf(NotFoundException);
      prisma.$executeRaw.mockResolvedValue(2);
      await expect(service.deshacerPagos(1, [5, 6])).resolves.toEqual({ deshechos: 2 });
    });

    it('editar el pago pide un día válido y no futuro', async () => {
      await expect(service.editarPagoRegistrado(1, 5, { fecha: '' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.editarPagoRegistrado(1, 5, { fecha: '2999-01-01' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.editarPagoRegistrado(1, 5, { fecha: '2026-08-02', referencia: 'x' })).resolves.toEqual({ ok: true });
    });

    it('no se puede crear, cambiar ni quitar un ajuste ligado a un pago ya registrado', async () => {
      prisma.custodia.findFirst.mockResolvedValue(makeCustodia({ id: 7 }));
      const dto = { tipo: 'EXTRA', persona: 'Juan Chofer', cedula: '1111111111', monto: 5, concepto: 'Extra', custodiaId: 7 };
      // Con el pago registrado, la consulta de «pagos registrados» devuelve la fila.
      pagados = [{ id: 1 }];
      await expect(service.crearAjuste(1, 9, dto)).rejects.toBeInstanceOf(BadRequestException);
      ajustes = [{ id: 3, custodiaId: 7, cedula: '1111111111', persona: 'Juan Chofer', tipo: 'EXTRA', monto: 5 }];
      await expect(service.actualizarAjuste(1, 3, dto)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.eliminarAjuste(1, 3)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('tarifas', () => {
    it('una tarifa se puede corregir aunque ya rija; no puede repetir tipo y día de otra', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ tipo: 'VIP', vigenteDesde: '2020-01-01' }]); // la tarifa
      prisma.$queryRaw.mockResolvedValueOnce([]); // sin otra igual
      await service.actualizarTarifa(1, 5, { valorPorPersona: 30 });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);

      prisma.$queryRaw.mockResolvedValueOnce([{ tipo: 'VIP', vigenteDesde: '2020-01-01' }]);
      prisma.$queryRaw.mockResolvedValueOnce([{ id: 9 }]); // ya hay otra ese día
      await expect(
        service.actualizarTarifa(1, 5, { valorPorPersona: 30, vigenteDesde: '2021-01-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un valor que no es mayor a 0 al corregir', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ tipo: 'VIP', vigenteDesde: '2020-01-01' }]);
      await expect(
        service.actualizarTarifa(1, 5, { valorPorPersona: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('rechaza un tipo inválido y un valor que no es mayor a 0', async () => {
      await expect(
        service.crearTarifa(1, 9, { tipo: 'OTRO', valorPorPersona: 5, vigenteDesde: '2026-09-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.crearTarifa(1, 9, { tipo: 'VIP', valorPorPersona: 0, vigenteDesde: '2026-09-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('se puede quitar una tarifa aunque ya rija, y avisa si no existe', async () => {
      await expect(service.eliminarTarifa(1, 5)).resolves.toBeDefined();
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      prisma.$executeRaw.mockResolvedValue(0);
      await expect(service.eliminarTarifa(1, 5)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
