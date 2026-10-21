import { PrismaService } from '../../prisma/prisma.service';
import { VentasLeadsService } from './ventas-leads.service';

// Pasar un posible cliente a oportunidad (2026-10-18): lo que él trajo tiene que llegar a la ficha —su
// dirección y los servicios que pidió—, y nunca se pisa lo que la ficha de una empresa existente ya tiene.
describe('VentasLeadsService.convertir — datos que llegan a la ficha', () => {
  let prisma: any;
  let tx: any;
  let oportunidades: { crearInicial: jest.Mock; espejarCliente: jest.Mock };
  let servicio: VentasLeadsService;

  const lead = (extra: Record<string, unknown> = { direccion: 'Av. Colón 45, Quito' }) => ({
    id: 5,
    status: 'NUEVO',
    contactReason: null,
    name: 'Pedro Pérez',
    companyName: 'Textiles Valle',
    email: 'pedro@valle.com',
    phone: '0991234567',
    channel: 'WEB_FORM',
    campaign: null,
    message: 'Necesito guardias para la bodega',
    extra,
    createdAt: new Date('2026-10-15T15:00:00.000Z'),
    assignedUserId: null,
    triagedAt: null,
  });

  beforeEach(() => {
    tx = {
      salesClient: { create: jest.fn().mockResolvedValue({ id: 50 }), update: jest.fn().mockResolvedValue({}) },
      salesClientActivity: { create: jest.fn().mockResolvedValue({}) },
      salesLead: { update: jest.fn().mockResolvedValue({}) },
      salesContact: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    };
    prisma = {
      salesLead: { findFirst: jest.fn().mockResolvedValue(lead()) },
      salesService: {
        findMany: jest.fn().mockResolvedValue([{ name: 'Agentes de Seguridad' }, { name: 'Seguridad VIP' }]),
      },
      salesClient: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      salesClientStage: { findFirst: jest.fn().mockResolvedValue({ key: 'RECIBIDO' }) },
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    oportunidades = {
      crearInicial: jest.fn().mockResolvedValue({ id: 60 }),
      espejarCliente: jest.fn().mockResolvedValue(null),
    };
    servicio = new VentasLeadsService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      oportunidades as never,
      { isReady: () => true } as never,
    );
    jest.spyOn(servicio as any, 'coincidencias').mockResolvedValue([]);
  });

  it('una empresa nueva nace con la dirección del posible cliente y los servicios van SOLO a la oportunidad', async () => {
    await servicio.convertir(1, 5, 7, { serviceIds: [1, 3] });
    const datos = tx.salesClient.create.mock.calls[0][0].data;
    expect(datos.address).toBe('Av. Colón 45, Quito');
    // El servicio es de la oportunidad (2026-10-20): ya no se copia a la ficha del Directorio.
    expect(datos.extra.servicio_requerido).toBeUndefined();
    expect(datos.extra.servicio_requerido__sub).toBeUndefined();
    // y los servicios siguen yendo a la oportunidad
    expect(oportunidades.crearInicial).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ serviceIds: [1, 3] }));
  });

  it('la dirección corregida en el cuadro de «Pasar a oportunidad» gana sobre la que traía', async () => {
    await servicio.convertir(1, 5, 7, { serviceIds: [1, 3], address: '  Calle Nueva 9  ' });
    expect(tx.salesClient.create.mock.calls[0][0].data.address).toBe('Calle Nueva 9');
  });

  it('sin dirección en ningún lado, la ficha queda sin dirección (no inventa)', async () => {
    prisma.salesLead.findFirst.mockResolvedValue(lead({}));
    await servicio.convertir(1, 5, 7, { serviceIds: [1, 3] });
    expect(tx.salesClient.create.mock.calls[0][0].data.address).toBeNull();
  });

  it('un servicio propio de la empresa igual va a la oportunidad y no a la ficha', async () => {
    prisma.salesService.findMany.mockResolvedValue([{ name: 'Servicio propio de la empresa' }]);
    await servicio.convertir(1, 5, 7, { serviceIds: [9] });
    const extra = tx.salesClient.create.mock.calls[0][0].data.extra;
    expect(extra.servicio_requerido).toBeUndefined();
    expect(oportunidades.crearInicial).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ serviceIds: [9] }));
  });

  it('si alguno de los servicios no existe, avisa y no crea nada', async () => {
    prisma.salesService.findMany.mockResolvedValue([{ name: 'Agentes de Seguridad' }]);
    await expect(servicio.convertir(1, 5, 7, { serviceIds: [1, 99] })).rejects.toThrow('Alguno de los servicios no existe');
    expect(tx.salesClient.create).not.toHaveBeenCalled();
  });

  it('al sumar a una empresa que NO tiene dirección, se la completa con la del posible cliente', async () => {
    prisma.salesClient.findFirst.mockResolvedValue({ id: 20, name: 'Textiles Valle', address: null });
    await servicio.convertir(1, 5, 7, { salesClientId: 20, serviceIds: [1, 3] });
    expect(tx.salesClient.create).not.toHaveBeenCalled();
    expect(tx.salesClient.update).toHaveBeenCalledWith({ where: { id: 20 }, data: { address: 'Av. Colón 45, Quito' } });
  });

  it('al sumar a una empresa que YA tiene dirección, no se la pisa', async () => {
    prisma.salesClient.findFirst.mockResolvedValue({ id: 20, name: 'Textiles Valle', address: 'Dirección de siempre' });
    await servicio.convertir(1, 5, 7, { salesClientId: 20, serviceIds: [1, 3] });
    expect(tx.salesClient.update).not.toHaveBeenCalled();
  });

  // Ubicación (2026-10-19): opcional y de la OPORTUNIDAD, no de la persona o empresa.
  it('sin ubicación (lo normal) la oportunidad nace sin ubicación', async () => {
    await servicio.convertir(1, 5, 7, { serviceIds: [1, 3] });
    expect(oportunidades.crearInicial).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ubicacion: null }));
  });

  it('con ubicación, va a la oportunidad (validada) y NO a la ficha de la empresa', async () => {
    await servicio.convertir(1, 5, 7, {
      serviceIds: [1, 3],
      ubicacion: { name: ' Sugar Coffee ', lat: -2.15, lng: -79.96, city: 'Guayaquil', province: 'Provincia del Guayas' },
    });
    expect(oportunidades.crearInicial).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ubicacion: expect.objectContaining({ name: 'Sugar Coffee', lat: -2.15, lng: -79.96, city: 'Guayaquil', province: 'Guayas' }),
      }),
    );
    // La dirección de la ficha sigue saliendo de lo que escribió el posible cliente, no del mapa.
    expect(tx.salesClient.create.mock.calls[0][0].data.address).toBe('Av. Colón 45, Quito');
  });

  it('una ubicación fuera de Ecuador se rechaza antes de crear nada', async () => {
    await expect(
      servicio.convertir(1, 5, 7, { serviceIds: [1, 3], ubicacion: { lat: 4.6, lng: -74.08 } }),
    ).rejects.toThrow('Ecuador');
    expect(tx.salesClient.create).not.toHaveBeenCalled();
    expect(oportunidades.crearInicial).not.toHaveBeenCalled();
  });

  it('la ubicación también vale al sumar la oportunidad a una empresa que ya existe', async () => {
    prisma.salesClient.findFirst.mockResolvedValue({ id: 20, name: 'Textiles Valle', address: 'Dirección de siempre' });
    await servicio.convertir(1, 5, 7, { salesClientId: 20, serviceIds: [1, 3], ubicacion: { lat: -0.18, lng: -78.47 } });
    expect(oportunidades.crearInicial).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ubicacion: expect.objectContaining({ province: 'Pichincha' }) }),
    );
  });
});

describe('VentasLeadsService.actualizar y crearManual — dirección', () => {
  const armar = (extraActual: Record<string, unknown>) => {
    const prisma: any = {
      salesLead: {
        findFirst: jest.fn().mockResolvedValue({ id: 5, status: 'NUEVO', contactReason: null, extra: extraActual }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const servicio = new VentasLeadsService(prisma as unknown as PrismaService, {} as never, {} as never, {} as never, {} as never, {} as never);
    jest.spyOn(servicio, 'get').mockResolvedValue({} as never);
    return { servicio, prisma };
  };

  it('editar la dirección cambia solo esa clave y respeta el resto (gclid, campaña…)', async () => {
    const { servicio, prisma } = armar({ gclid: 'G1', direccion: 'Vieja' });
    await servicio.actualizar(1, 5, { direccion: ' Nueva 12 ' });
    expect(prisma.salesLead.update.mock.calls[0][0].data.extra).toEqual({ gclid: 'G1', direccion: 'Nueva 12' });
  });

  it('dejarla vacía la quita, sin tocar el resto', async () => {
    const { servicio, prisma } = armar({ gclid: 'G1', direccion: 'Vieja' });
    await servicio.actualizar(1, 5, { direccion: '' });
    expect(prisma.salesLead.update.mock.calls[0][0].data.extra).toEqual({ gclid: 'G1' });
  });

  it('si no se manda la dirección, no se toca el extra', async () => {
    const { servicio, prisma } = armar({ gclid: 'G1' });
    await servicio.actualizar(1, 5, { name: 'Otro nombre' });
    expect(prisma.salesLead.update.mock.calls[0][0].data.extra).toBeUndefined();
  });
});
