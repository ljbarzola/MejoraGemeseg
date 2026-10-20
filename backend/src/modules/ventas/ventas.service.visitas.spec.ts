import { PrismaService } from '../../prisma/prisma.service';
import { VentasService } from './ventas.service';

// Planificación y Campo conectada al CRM (2026-10-19): la visita sale de una empresa o persona del Directorio
// (no de un nombre escrito a mano), puede llevar la oportunidad y una ubicación en el mapa, y la fecha es un
// día que no se corre por la zona horaria.
describe('VentasService — visitas conectadas al CRM', () => {
  let prisma: any;
  let servicio: VentasService;

  const fila = (extra: Record<string, unknown> = {}) => ({
    id: 1,
    userId: 7,
    clientName: 'Sugar Coffee SA',
    clientAddress: null,
    clientPhone: null,
    visitDate: new Date('2026-10-20T00:00:00.000Z'),
    status: 'PLANNED',
    notes: null,
    companyId: 1,
    salesClientId: 4,
    opportunityId: null,
    locationName: null,
    locationAddress: null,
    locationLat: null,
    locationLng: null,
    locationCity: null,
    locationProvince: null,
    locationOsmId: null,
    ...extra,
  });

  beforeEach(() => {
    prisma = {
      clientVisit: {
        create: jest.fn(async ({ data }: any) => fila(data)),
        update: jest.fn(async ({ data }: any) => fila(data)),
        findFirst: jest.fn().mockResolvedValue(fila()),
        findMany: jest.fn().mockResolvedValue([]),
      },
      salesClient: {
        findFirst: jest.fn().mockResolvedValue({ id: 4, name: 'Sugar Coffee SA', phone: '0991112233', address: 'Av. 9 de Octubre' }),
        findMany: jest.fn().mockResolvedValue([{ id: 4, name: 'Sugar Coffee SA' }]),
      },
      salesOpportunity: {
        findFirst: jest.fn().mockResolvedValue({ id: 9 }),
        findMany: jest.fn().mockResolvedValue([{ id: 9, title: 'Guardias nocturnos' }]),
      },
    };
    servicio = new VentasService(prisma as unknown as PrismaService);
  });

  it('agendar con una empresa del Directorio copia su nombre, teléfono y dirección', async () => {
    await servicio.createVisit(1, 7, { salesClientId: 4, visitDate: '2026-10-20' });
    const data = prisma.clientVisit.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      salesClientId: 4,
      clientName: 'Sugar Coffee SA',
      clientPhone: '0991112233',
      clientAddress: 'Av. 9 de Octubre',
      status: 'PLANNED',
      locationLat: null,
    });
    // El cliente se busca solo dentro de la empresa del usuario.
    expect(prisma.salesClient.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 4, companyId: 1 } }));
  });

  it('la fecha es un día guardado a medianoche UTC (no se corre un día en Ecuador)', async () => {
    await servicio.createVisit(1, 7, { salesClientId: 4, visitDate: '2026-10-20' });
    expect(prisma.clientVisit.create.mock.calls[0][0].data.visitDate.toISOString()).toBe('2026-10-20T00:00:00.000Z');
  });

  it('una fecha inválida se rechaza con un mensaje claro', async () => {
    await expect(servicio.createVisit(1, 7, { salesClientId: 4, visitDate: 'mañana' })).rejects.toThrow('fecha de la visita');
  });

  it('sin empresa elegida ni nombre, pide elegir a quién se visita', async () => {
    await expect(servicio.createVisit(1, 7, { visitDate: '2026-10-20' })).rejects.toThrow('Elige la empresa o persona');
  });

  it('el camino viejo (solo nombre escrito) sigue funcionando', async () => {
    await servicio.createVisit(1, 7, { clientName: ' Cliente suelto ', visitDate: '2026-10-20' });
    expect(prisma.clientVisit.create.mock.calls[0][0].data).toMatchObject({ clientName: 'Cliente suelto', salesClientId: null });
  });

  it('una empresa que no es de esta empresa se rechaza', async () => {
    prisma.salesClient.findFirst.mockResolvedValue(null);
    await expect(servicio.createVisit(1, 7, { salesClientId: 99, visitDate: '2026-10-20' })).rejects.toThrow('Directorio');
    expect(prisma.clientVisit.create).not.toHaveBeenCalled();
  });

  it('la oportunidad tiene que ser de la empresa o persona elegida', async () => {
    prisma.salesOpportunity.findFirst.mockResolvedValue(null);
    await expect(
      servicio.createVisit(1, 7, { salesClientId: 4, opportunityId: 55, visitDate: '2026-10-20' }),
    ).rejects.toThrow('no es de la empresa o persona');
    expect(prisma.salesOpportunity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 55, companyId: 1, salesClientId: 4 } }),
    );
  });

  it('la ubicación se valida (Ecuador) y se guarda; su dirección pasa a la visita', async () => {
    await servicio.createVisit(1, 7, {
      salesClientId: 4,
      visitDate: '2026-10-20',
      ubicacion: { name: 'Sugar Coffee', address: 'Vía a la Costa km 8', lat: -2.15, lng: -79.96, city: 'Guayaquil', province: 'Guayas' },
    });
    expect(prisma.clientVisit.create.mock.calls[0][0].data).toMatchObject({
      locationName: 'Sugar Coffee',
      locationLat: -2.15,
      locationProvince: 'Guayas',
      clientAddress: 'Vía a la Costa km 8',
    });
    await expect(
      servicio.createVisit(1, 7, { salesClientId: 4, visitDate: '2026-10-20', ubicacion: { lat: 4.6, lng: -74.08 } }),
    ).rejects.toThrow('Ecuador');
  });

  it('al listar, cada visita trae su empresa, su oportunidad y la ubicación como un objeto', async () => {
    prisma.clientVisit.findMany.mockResolvedValue([
      fila({ opportunityId: 9, locationLat: -2.15, locationLng: -79.96, locationProvince: 'Guayas', locationName: 'Sugar Coffee' }),
      fila({ id: 2, salesClientId: null }),
    ]);
    const r: any[] = await servicio.getVisits(1);
    expect(r[0].cliente).toEqual({ id: 4, name: 'Sugar Coffee SA' });
    expect(r[0].oportunidad).toEqual({ id: 9, title: 'Guardias nocturnos' });
    expect(r[0].ubicacion).toMatchObject({ lat: -2.15, province: 'Guayas', name: 'Sugar Coffee' });
    expect(r[0].locationLat).toBeUndefined();
    // Una visita de antes del CRM: todo null, sin romper.
    expect(r[1]).toMatchObject({ cliente: null, oportunidad: null, ubicacion: null });
  });

  it('editar sin enviar ubicación no la toca; con null la quita', async () => {
    await servicio.updateVisit(1, 1, { notes: 'Llevar la propuesta' });
    expect(prisma.clientVisit.update.mock.calls[0][0].data).toEqual({ notes: 'Llevar la propuesta' });
    await servicio.updateVisit(1, 1, { ubicacion: null });
    expect(prisma.clientVisit.update.mock.calls[1][0].data).toMatchObject({ locationLat: null, locationName: null });
  });

  it('cambiar de empresa suelta la oportunidad anterior y actualiza el nombre', async () => {
    prisma.clientVisit.findFirst.mockResolvedValue(fila({ opportunityId: 9 }));
    prisma.salesClient.findFirst.mockResolvedValue({ id: 5, name: 'Otra SA', phone: null, address: null });
    await servicio.updateVisit(1, 1, { salesClientId: 5 });
    expect(prisma.clientVisit.update.mock.calls[0][0].data).toMatchObject({ salesClientId: 5, clientName: 'Otra SA', opportunityId: null });
  });

  it('editar una visita de otra empresa da «no encontrada»', async () => {
    prisma.clientVisit.findFirst.mockResolvedValue(null);
    await expect(servicio.updateVisit(1, 99, { notes: 'x' })).rejects.toThrow('Visita no encontrada');
  });
});
