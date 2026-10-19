import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VentasConfigService } from './ventas-config.service';

// Base simulada: una sola tabla clave-valor por empresa, como SalesSetting.
function crearServicio() {
  const filas = new Map<string, unknown>();
  const clave = (w: { companyId_key: { companyId: number; key: string } }) =>
    `${w.companyId_key.companyId}:${w.companyId_key.key}`;
  const mockPrisma = {
    salesSetting: {
      findUnique: jest.fn(async ({ where }) =>
        filas.has(clave(where)) ? { value: filas.get(clave(where)) } : null,
      ),
      upsert: jest.fn(async ({ where, create }) => {
        filas.set(clave(where), create.value);
      }),
      deleteMany: jest.fn(async ({ where }) => {
        filas.delete(`${where.companyId}:${where.key}`);
      }),
    },
    salesApiKey: {
      create: jest.fn(async ({ data }) => ({ id: 7, isActive: true, ...data })),
      findFirst: jest.fn(async ({ where }) => (where.id === 7 ? { id: 7, companyId: where.companyId } : null)),
      update: jest.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  return {
    servicio: new VentasConfigService(mockPrisma as unknown as PrismaService),
    mockPrisma,
  };
}

describe('VentasConfigService — Google Ads', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('sin nada guardado ni variables de entorno no hay envío configurado', async () => {
    delete process.env.GOOGLE_ADS_CUSTOMER_ID;
    const { servicio } = crearServicio();
    expect(await servicio.configGoogleAds(1)).toBeNull();
    expect((await servicio.ajustesGoogleAds(1)).soloValidar).toBe(true);
  });

  it('guarda los IDs limpios de guiones y arma la configuración de envío', async () => {
    const { servicio } = crearServicio();
    await servicio.guardarGoogleAds(1, 5, {
      customerId: '123-456-7890',
      conversionCualificado: ' 111 ',
      conversionConvertido: '222',
      activo: true,
      soloValidar: false,
    });
    const c = await servicio.configGoogleAds(1);
    expect(c?.customerId).toBe('1234567890');
    // «Lead válido» es opcional: sin su ID queda vacío y no se usa.
    expect(c?.conversiones).toEqual({ CUALIFICADO: '111', CONVERTIDO: '222', VALIDO: '' });
    expect(c?.validateOnly).toBe(false);
  });

  it('el ID de «Lead válido» es opcional: se guarda limpio y se lee con la configuración', async () => {
    const { servicio } = crearServicio();
    const a = await servicio.guardarGoogleAds(1, 5, {
      customerId: '1234567890',
      conversionCualificado: '1',
      conversionConvertido: '2',
      conversionValido: ' 33-3 ',
      activo: true,
    });
    expect(a.conversionValido).toBe('333');
    expect((await servicio.configGoogleAds(1))?.conversiones.VALIDO).toBe('333');
  });

  it('el envío empieza en modo de validación salvo que se diga lo contrario', async () => {
    const { servicio } = crearServicio();
    const a = await servicio.guardarGoogleAds(1, 5, {
      customerId: '1234567890',
      conversionCualificado: '1',
      conversionConvertido: '2',
      activo: true,
    });
    expect(a.soloValidar).toBe(true);
  });

  it('un ID de cliente que no tiene 10 dígitos se rechaza con un mensaje claro', async () => {
    const { servicio } = crearServicio();
    await expect(servicio.guardarGoogleAds(1, 5, { customerId: '12345' })).rejects.toThrow(
      /10 dígitos/,
    );
  });

  it('no se puede activar sin el ID de cliente y las dos conversiones', async () => {
    const { servicio } = crearServicio();
    await expect(
      servicio.guardarGoogleAds(1, 5, { customerId: '1234567890', activo: true }),
    ).rejects.toThrow(BadRequestException);
  });

  it('desactivado no hay envío aunque estén los IDs', async () => {
    const { servicio } = crearServicio();
    await servicio.guardarGoogleAds(1, 5, {
      customerId: '1234567890',
      conversionCualificado: '1',
      conversionConvertido: '2',
      activo: false,
    });
    expect(await servicio.configGoogleAds(1)).toBeNull();
  });

  it('cada empresa tiene lo suyo', async () => {
    const { servicio } = crearServicio();
    await servicio.guardarGoogleAds(1, 5, {
      customerId: '1234567890',
      conversionCualificado: '1',
      conversionConvertido: '2',
      activo: true,
    });
    expect(await servicio.configGoogleAds(2)).toBeNull();
  });

  it('sin nada guardado respeta las variables de entorno de instalaciones anteriores', async () => {
    process.env.GOOGLE_ADS_CUSTOMER_ID = '1234567890';
    process.env.GOOGLE_ADS_CONVERSION_CUALIFICADO = '10';
    process.env.GOOGLE_ADS_CONVERSION_CONVERTIDO = '20';
    const { servicio } = crearServicio();
    expect((await servicio.configGoogleAds(1))?.customerId).toBe('1234567890');
  });
});

describe('VentasConfigService — landings', () => {
  it('una empresa sin nada guardado no tiene landings (empieza vacía)', async () => {
    const { servicio } = crearServicio();
    expect(await servicio.landingsDe(1)).toEqual([]);
    expect((await servicio.resumen(1)).landings).toEqual([]);
  });

  it('guarda las de la empresa, con la dirección normalizada, y no afecta a otra', async () => {
    const { servicio } = crearServicio();
    await servicio.guardarLandings(1, 5, [{ slug: 'Mi-Landing', servicio: 'Alarmas', linea: 'Casa' }]);
    expect(await servicio.landingsDe(1)).toEqual([{ slug: 'mi-landing', servicio: 'Alarmas', linea: 'Casa' }]);
    expect(await servicio.landingsDe(2)).toEqual([]);
  });

  it('rechaza una landing sin dirección, sin servicio o repetida', async () => {
    const { servicio } = crearServicio();
    await expect(servicio.guardarLandings(1, 5, [{ slug: '  ', servicio: 'X' }])).rejects.toThrow(/dirección/);
    await expect(servicio.guardarLandings(1, 5, [{ slug: 'a', servicio: '' }])).rejects.toThrow(/servicio/);
    await expect(
      servicio.guardarLandings(1, 5, [
        { slug: 'a', servicio: 'X' },
        { slug: 'A', servicio: 'Y' },
      ]),
    ).rejects.toThrow(/repetida/);
  });

  it('guardar la tabla vacía es válido y se respeta', async () => {
    const { servicio } = crearServicio();
    await servicio.guardarLandings(1, 5, [{ slug: 'x', servicio: 'Y' }]);
    await servicio.guardarLandings(1, 5, []);
    expect(await servicio.landingsDe(1)).toEqual([]);
  });
});

describe('VentasConfigService — conexiones propias', () => {
  it('crea la conexión con su clave y la deja en la lista de la empresa', async () => {
    const { servicio, mockPrisma } = crearServicio();
    const c = await servicio.crearConexion(1, 5, '  Landing nueva ');
    expect(c.nombre).toBe('Landing nueva');
    expect(c.apiKeyId).toBe(7);
    expect(mockPrisma.salesApiKey.create.mock.calls[0][0].data.apiKey).toMatch(/^sk_ventas_[0-9a-f]{48}$/);
    expect(await servicio.conexionesDe(1)).toHaveLength(1);
    expect((await servicio.resumen(1)).conexiones).toHaveLength(1);
  });

  it('no deja crear una conexión sin nombre ni con un nombre repetido', async () => {
    const { servicio } = crearServicio();
    await expect(servicio.crearConexion(1, 5, '   ')).rejects.toThrow(BadRequestException);
    await servicio.crearConexion(1, 5, 'Mi web');
    await expect(servicio.crearConexion(1, 5, 'mi WEB')).rejects.toThrow(/Ya tienes/);
  });

  it('quitar una conexión borra su clave y la saca de la lista', async () => {
    const { servicio, mockPrisma } = crearServicio();
    const c = await servicio.crearConexion(1, 5, 'Mi web');
    await servicio.quitarConexion(1, 5, c.id);
    expect(await servicio.conexionesDe(1)).toHaveLength(0);
    expect(mockPrisma.salesApiKey.deleteMany).toHaveBeenCalledWith({ where: { id: 7, companyId: 1 } });
    await expect(servicio.quitarConexion(1, 5, c.id)).rejects.toThrow(/no encontrada/);
  });

  it('activar o desactivar una clave solo funciona con claves de la propia empresa', async () => {
    const { servicio } = crearServicio();
    expect(await servicio.cambiarClave(1, 7, false)).toMatchObject({ isActive: false });
    await expect(servicio.cambiarClave(1, 99, true)).rejects.toThrow(/no encontrada/);
  });
});
