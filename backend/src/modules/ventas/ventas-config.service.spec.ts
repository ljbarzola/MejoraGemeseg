import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LANDINGS } from './lead-landing.util';
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
    expect(c?.conversiones).toEqual({ CUALIFICADO: '111', CONVERTIDO: '222' });
    expect(c?.validateOnly).toBe(false);
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
  it('sin nada guardado usa las de Gemeseg', async () => {
    const { servicio } = crearServicio();
    expect(await servicio.landingsDe(1)).toEqual(LANDINGS);
  });

  it('guarda las de la empresa, con la dirección normalizada, y no afecta a otra', async () => {
    const { servicio } = crearServicio();
    await servicio.guardarLandings(1, 5, [{ slug: 'Mi-Landing', servicio: 'Alarmas', linea: 'Casa' }]);
    expect(await servicio.landingsDe(1)).toEqual([{ slug: 'mi-landing', servicio: 'Alarmas', linea: 'Casa' }]);
    expect(await servicio.landingsDe(2)).toEqual(LANDINGS);
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

  it('restaurar vuelve a los valores de Gemeseg', async () => {
    const { servicio } = crearServicio();
    await servicio.guardarLandings(1, 5, [{ slug: 'x', servicio: 'Y' }]);
    await servicio.restaurarLandings(1);
    expect(await servicio.landingsDe(1)).toEqual(LANDINGS);
  });
});
