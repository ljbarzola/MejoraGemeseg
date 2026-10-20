import { PrismaService } from '../../prisma/prisma.service';
import { VentasOportunidadesService, servicioGuardadoEnFicha } from './ventas-oportunidades.service';

// Ubicación OPCIONAL de la oportunidad (2026-10-19): sin enviar no se toca, null la quita, un objeto la
// reemplaza entera, y una ubicación fuera de Ecuador se rechaza sin guardar nada.
describe('VentasOportunidadesService — ubicación opcional', () => {
  let prisma: any;
  let servicio: VentasOportunidadesService;
  let get: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      salesOpportunity: {
        findFirst: jest.fn().mockResolvedValue({ id: 3 }),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 9 }),
        count: jest.fn().mockResolvedValue(0),
      },
      salesOpportunityService: { deleteMany: jest.fn(), createMany: jest.fn() },
      salesClient: { findFirst: jest.fn().mockResolvedValue({ id: 4, assignedUserId: null, extra: {} }) },
      salesClientStage: { findFirst: jest.fn().mockResolvedValue({ key: 'RECIBIDO' }) },
      $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(prisma)),
    };
    servicio = new VentasOportunidadesService(prisma as unknown as PrismaService, {} as never, {} as never, {} as never, {} as never, {} as never);
    jest.spyOn(servicio, 'espejarCliente').mockResolvedValue(null);
    get = jest.spyOn(servicio, 'get').mockResolvedValue({} as never);
  });

  it('editar SIN enviar ubicación no toca las columnas de ubicación', async () => {
    await servicio.update(1, 3, { title: 'Nuevo título' });
    const data = prisma.salesOpportunity.update.mock.calls[0][0].data;
    expect(data).toEqual({ title: 'Nuevo título' });
    expect(Object.keys(data).some((k) => k.startsWith('location'))).toBe(false);
  });

  it('editar con una ubicación la guarda completa', async () => {
    await servicio.update(1, 3, {
      ubicacion: { name: 'Sugar Coffee', address: 'Vía a la Costa', lat: -2.15, lng: -79.96, city: 'Guayaquil', province: 'Guayas', osmId: 'node/9' },
    });
    expect(prisma.salesOpportunity.update.mock.calls[0][0].data).toMatchObject({
      locationName: 'Sugar Coffee',
      locationAddress: 'Vía a la Costa',
      locationLat: -2.15,
      locationLng: -79.96,
      locationCity: 'Guayaquil',
      locationProvince: 'Guayas',
      locationOsmId: 'node/9',
    });
    expect(get).toHaveBeenCalled();
  });

  it('editar con ubicación null la quita (todas las columnas a null)', async () => {
    await servicio.update(1, 3, { ubicacion: null });
    expect(prisma.salesOpportunity.update.mock.calls[0][0].data).toEqual({
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      locationCity: null,
      locationProvince: null,
      locationOsmId: null,
    });
  });

  it('una ubicación fuera de Ecuador se rechaza y no se guarda nada', async () => {
    await expect(servicio.update(1, 3, { ubicacion: { lat: 4.6, lng: -74.08 } })).rejects.toThrow('Ecuador');
    expect(prisma.salesOpportunity.update).not.toHaveBeenCalled();
  });

  it('crear sin ubicación deja las columnas vacías; con ubicación las llena', async () => {
    await servicio.create(1, 7, { salesClientId: 4 });
    expect(prisma.salesOpportunity.create.mock.calls[0][0].data).toMatchObject({ locationLat: null, locationProvince: null });
    await servicio.create(1, 7, { salesClientId: 4, ubicacion: { lat: -0.18, lng: -78.47, city: 'Quito' } });
    expect(prisma.salesOpportunity.create.mock.calls[1][0].data).toMatchObject({ locationLat: -0.18, locationCity: 'Quito', locationProvince: 'Pichincha' });
  });
});

// El Directorio ya no muestra «Servicio requerido»: una oportunidad sin servicios propios enseña lo que la
// ficha tenía guardado, para que ese dato no se pierda de vista.
describe('servicioGuardadoEnFicha', () => {
  const opciones = [
    { key: 'MONITOREO', label: 'Monitoreo', children: [{ key: 'MONITOREO_DE_CAMARAS', label: 'Monitoreo de Cámaras' }] },
    { key: 'SEGURIDAD_FISICA', label: 'Seguridad Física' },
  ];

  it('con subservicios muestra los subservicios con su nombre', () => {
    expect(servicioGuardadoEnFicha({ servicio_requerido: 'MONITOREO', servicio_requerido__sub: 'MONITOREO_DE_CAMARAS' }, opciones)).toBe(
      'Monitoreo de Cámaras',
    );
  });
  it('solo con la categoría muestra la categoría (el caso «Juan Perez: Monitoreo» sin detalle)', () => {
    expect(servicioGuardadoEnFicha({ servicio_requerido: 'MONITOREO', servicio_requerido__sub: '' }, opciones)).toBe('Monitoreo');
  });
  it('una clave que ya no está en la lista se muestra tal cual en vez de perderse', () => {
    expect(servicioGuardadoEnFicha({ servicio_requerido: 'OTRO_SERVICIO' }, opciones)).toBe('OTRO_SERVICIO');
  });
  it('sin nada guardado devuelve null', () => {
    expect(servicioGuardadoEnFicha({ servicio_requerido: '', servicio_requerido__sub: '' }, opciones)).toBeNull();
    expect(servicioGuardadoEnFicha(null, opciones)).toBeNull();
  });
});
