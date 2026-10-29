import { PrismaService } from '../../prisma/prisma.service';
import { VentasOportunidadesService } from './ventas-oportunidades.service';
import {
  errorDeLlegada,
  llegadaParaCrear,
  llegadaParaEditar,
  parseFechaLlegada,
  rangoDiasEcuador,
} from './fecha-llegada.util';

// «Fecha en que llegó» = la de la OPORTUNIDAD, no la de la empresa o persona del Directorio (2026-10-28).
// Ahora: 10 de mayo de 2026, 15:00 en Ecuador (20:00 UTC).
const AHORA = new Date('2026-05-10T20:00:00.000Z');

describe('parseFechaLlegada', () => {
  it('un día pasado se guarda a mediodía UTC (07:00 en Ecuador, el mismo día)', () => {
    expect(parseFechaLlegada('2026-04-02', AHORA).toISOString()).toBe('2026-04-02T12:00:00.000Z');
  });
  it('el día de hoy (de Ecuador) se guarda como «ahora», no como un mediodía que puede ser futuro', () => {
    expect(parseFechaLlegada('2026-05-10', AHORA)).toBe(AHORA);
  });
  it('a las 21:00 de Ecuador ya es «mañana» en UTC, pero sigue siendo hoy para Ecuador', () => {
    const noche = new Date('2026-05-11T02:00:00.000Z'); // 21:00 del 10 en Ecuador
    expect(parseFechaLlegada('2026-05-10', noche)).toBe(noche);
    expect(() => parseFechaLlegada('2026-05-11', noche)).toThrow('futura');
  });
  it('rechaza fechas futuras, inexistentes y mal escritas', () => {
    expect(() => parseFechaLlegada('2026-05-11', AHORA)).toThrow('futura');
    expect(() => parseFechaLlegada('2026-02-31', AHORA)).toThrow('no es válida');
    expect(() => parseFechaLlegada('10/05/2026', AHORA)).toThrow('no es válida');
  });
});

describe('llegadaParaCrear', () => {
  it('sin fecha elegida es ahora (NUNCA la fecha de ingreso de la empresa)', () => {
    expect(llegadaParaCrear(undefined, AHORA)).toBe(AHORA);
    expect(llegadaParaCrear('', AHORA)).toBe(AHORA);
    expect(llegadaParaCrear(null, AHORA)).toBe(AHORA);
  });
  it('con fecha elegida usa esa', () => {
    expect(llegadaParaCrear('2026-03-01', AHORA).toISOString()).toBe('2026-03-01T12:00:00.000Z');
  });
});

describe('llegadaParaEditar', () => {
  const guardada = new Date('2026-04-02T18:30:00.000Z');
  it('sin enviar no se toca', () => {
    expect(llegadaParaEditar(undefined, guardada, AHORA)).toBeUndefined();
  });
  it('el mismo día no reescribe (se conserva la hora original)', () => {
    expect(llegadaParaEditar('2026-04-02', guardada, AHORA)).toBeUndefined();
  });
  it('otro día lo reescribe', () => {
    expect(llegadaParaEditar('2026-04-01', guardada, AHORA)?.toISOString()).toBe('2026-04-01T12:00:00.000Z');
  });
  it('vacía no se admite: toda oportunidad llegó algún día', () => {
    expect(() => llegadaParaEditar('', guardada, AHORA)).toThrow('obligatoria');
    expect(() => llegadaParaEditar(null, guardada, AHORA)).toThrow('obligatoria');
  });
});

describe('errorDeLlegada', () => {
  const llegada = new Date('2026-04-10T12:00:00.000Z');
  it('no puede ser posterior al primer cambio de etapa', () => {
    const msg = errorDeLlegada(llegada, { primerCambioDeEtapa: new Date('2026-04-09T15:00:00.000Z') });
    expect(msg).toContain('primer cambio de etapa');
    expect(msg).toContain('09/04/2026');
  });
  it('no puede ser posterior al cierre', () => {
    expect(errorDeLlegada(llegada, { cerradaEl: new Date('2026-04-05T15:00:00.000Z') })).toContain('se cerró');
  });
  it('el mismo día que el primer cambio es válido (se compara por día de Ecuador)', () => {
    expect(errorDeLlegada(llegada, { primerCambioDeEtapa: new Date('2026-04-10T20:00:00.000Z') })).toBeNull();
    expect(errorDeLlegada(llegada, {})).toBeNull();
  });
});

describe('rangoDiasEcuador', () => {
  it('desde el inicio del día de Ecuador hasta el último instante del día hasta', () => {
    const r = rangoDiasEcuador('2026-05-01', '2026-05-31');
    expect(r.gte?.toISOString()).toBe('2026-05-01T05:00:00.000Z');
    expect(r.lte?.toISOString()).toBe('2026-06-01T04:59:59.999Z');
  });
  it('sin fechas no filtra; con una sola, solo ese lado', () => {
    expect(rangoDiasEcuador()).toEqual({});
    expect(rangoDiasEcuador('2026-05-01').lte).toBeUndefined();
    expect(rangoDiasEcuador(undefined, '2026-05-01').gte).toBeUndefined();
  });
  it('rechaza fechas inválidas o al revés', () => {
    expect(() => rangoDiasEcuador('2026-13-01')).toThrow('no es válida');
    expect(() => rangoDiasEcuador('2026-05-02', '2026-05-01')).toThrow('posterior');
  });
});

// La regla dentro del servicio: crear no hereda la fecha del cliente; editar valida contra la historia.
describe('VentasOportunidadesService — fecha en que llegó', () => {
  let prisma: any;
  let servicio: VentasOportunidadesService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(AHORA);
    prisma = {
      salesOpportunity: {
        findFirst: jest.fn().mockResolvedValue({ id: 3, receivedAt: new Date('2026-04-02T12:00:00.000Z'), closedAt: null }),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 9 }),
        count: jest.fn().mockResolvedValue(2),
      },
      salesOpportunityStageChange: { findFirst: jest.fn().mockResolvedValue(null) },
      salesOpportunityService: { deleteMany: jest.fn(), createMany: jest.fn() },
      // Un cliente VIEJO (ingresó en 2020): su fecha no debe pasar a la oportunidad nueva.
      salesClient: {
        findFirst: jest.fn().mockResolvedValue({ id: 4, assignedUserId: null, extra: {}, createdAt: new Date('2020-01-15T12:00:00.000Z') }),
      },
      salesClientStage: { findFirst: jest.fn().mockResolvedValue({ key: 'RECIBIDO' }) },
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(prisma)),
    };
    servicio = new VentasOportunidadesService(prisma as unknown as PrismaService, {} as never, {} as never, {} as never, {} as never);
    jest.spyOn(servicio, 'espejarCliente').mockResolvedValue(null);
    jest.spyOn(servicio, 'get').mockResolvedValue({} as never);
  });
  afterEach(() => jest.useRealTimers());

  it('crear una oportunidad para un cliente que ya existe: llegó AHORA, no cuando ingresó el cliente', async () => {
    await servicio.create(1, 7, { salesClientId: 4 });
    const data = prisma.salesOpportunity.create.mock.calls[0][0].data;
    expect(data.receivedAt).toEqual(AHORA);
    expect(data.originType).toBe('CLIENTE_EXISTENTE');
  });

  it('crear eligiendo «Fecha en que llegó» guarda esa fecha', async () => {
    await servicio.create(1, 7, { salesClientId: 4, receivedAt: '2026-03-01' });
    expect(prisma.salesOpportunity.create.mock.calls[0][0].data.receivedAt.toISOString()).toBe('2026-03-01T12:00:00.000Z');
  });

  it('crear con una fecha futura se rechaza sin guardar nada', async () => {
    await expect(servicio.create(1, 7, { salesClientId: 4, receivedAt: '2026-06-01' })).rejects.toThrow('futura');
    expect(prisma.salesOpportunity.create).not.toHaveBeenCalled();
  });

  it('editar la fecha de llegada la guarda', async () => {
    await servicio.update(1, 3, { receivedAt: '2026-04-01' });
    expect(prisma.salesOpportunity.update.mock.calls[0][0].data.receivedAt.toISOString()).toBe('2026-04-01T12:00:00.000Z');
  });

  it('editar sin tocar la fecha (o con el mismo día) no la reescribe', async () => {
    await servicio.update(1, 3, { title: 'x' });
    await servicio.update(1, 3, { receivedAt: '2026-04-02' });
    expect(prisma.salesOpportunity.update.mock.calls[0][0].data.receivedAt).toBeUndefined();
    expect(prisma.salesOpportunity.update.mock.calls[1][0].data.receivedAt).toBeUndefined();
  });

  it('no deja la llegada después del primer cambio de etapa: mensaje claro y no guarda', async () => {
    prisma.salesOpportunityStageChange.findFirst.mockResolvedValue({ createdAt: new Date('2026-04-03T15:00:00.000Z') });
    await expect(servicio.update(1, 3, { receivedAt: '2026-04-20' })).rejects.toThrow('primer cambio de etapa');
    expect(prisma.salesOpportunity.update).not.toHaveBeenCalled();
  });

  it('no deja la llegada después del cierre', async () => {
    prisma.salesOpportunity.findFirst.mockResolvedValue({
      id: 3,
      receivedAt: new Date('2026-03-01T12:00:00.000Z'),
      closedAt: new Date('2026-03-10T15:00:00.000Z'),
    });
    await expect(servicio.update(1, 3, { receivedAt: '2026-03-20' })).rejects.toThrow('se cerró');
    expect(prisma.salesOpportunity.update).not.toHaveBeenCalled();
  });
});
