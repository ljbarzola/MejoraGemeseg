import {
  CUENTA_ADS_POR_DEFECTO,
  construirSolicitud,
  leerConfigGoogleAds,
  mensajeDeError,
} from './google-ads-conversiones.util';

const ENV_COMPLETO = {
  GOOGLE_ADS_CUSTOMER_ID: '123-456-7890',
  GOOGLE_ADS_CONVERSION_CUALIFICADO: '111',
  GOOGLE_ADS_CONVERSION_CONVERTIDO: '222',
};

describe('leerConfigGoogleAds', () => {
  it('sin los IDs de la cuenta de Ads no está configurado (el envío no hace nada)', () => {
    expect(leerConfigGoogleAds({})).toBeNull();
    expect(leerConfigGoogleAds({ GOOGLE_ADS_CUSTOMER_ID: '1234567890' })).toBeNull();
  });

  it('el ID de cliente se limpia de guiones y debe tener 10 dígitos', () => {
    expect(leerConfigGoogleAds(ENV_COMPLETO)?.customerId).toBe('1234567890');
    expect(leerConfigGoogleAds({ ...ENV_COMPLETO, GOOGLE_ADS_CUSTOMER_ID: '12345' })).toBeNull();
  });

  it('usa la cuenta dedicada por defecto y el modo validación solo si se pide', () => {
    const c = leerConfigGoogleAds(ENV_COMPLETO);
    expect(c?.cuentaDeServicio).toBe(CUENTA_ADS_POR_DEFECTO);
    expect(c?.validateOnly).toBe(false);
    expect(leerConfigGoogleAds({ ...ENV_COMPLETO, GOOGLE_ADS_VALIDATE_ONLY: 'true' })?.validateOnly).toBe(true);
  });
});

describe('construirSolicitud', () => {
  const config = leerConfigGoogleAds(ENV_COMPLETO)!;
  const salida = new Date('2026-10-15T14:00:00.000Z');

  it('arma una destinación por tipo y un evento por hecho, con su gclid', () => {
    const body = construirSolicitud(config, [
      { opportunityId: 7, kind: 'CUALIFICADO', gclid: 'G1', occurredAt: salida, value: null, currency: 'USD' },
      { opportunityId: 7, kind: 'CONVERTIDO', gclid: 'G1', occurredAt: salida, value: 1200, currency: 'USD' },
    ]);
    expect(body.destinations).toHaveLength(2);
    expect(body.destinations[0]).toMatchObject({
      reference: 'CUALIFICADO',
      productDestinationId: '111',
      operatingAccount: { accountType: 'GOOGLE_ADS', accountId: '1234567890' },
    });
    expect(body.events).toHaveLength(2);
    expect(body.events[1]).toMatchObject({
      destinationReferences: ['CONVERTIDO'],
      transactionId: 'crm-7-CONVERTIDO',
      adIdentifiers: { gclid: 'G1' },
      conversionValue: 1200,
      currency: 'USD',
      eventTimestamp: '2026-10-15T14:00:00.000Z',
    });
  });

  it('un hecho sin valor no manda monto', () => {
    const body = construirSolicitud(config, [
      { opportunityId: 1, kind: 'CUALIFICADO', gclid: 'G', occurredAt: salida, value: null, currency: 'USD' },
    ]);
    expect(body.events[0]).not.toHaveProperty('conversionValue');
    expect(body.destinations).toHaveLength(1);
  });

  it('en modo validación lo pide a Google', () => {
    const c = leerConfigGoogleAds({ ...ENV_COMPLETO, GOOGLE_ADS_VALIDATE_ONLY: 'true' })!;
    expect(construirSolicitud(c, []).validateOnly).toBe(true);
  });
});

describe('mensajeDeError', () => {
  it('da un texto corto y accionable, sin detalles internos', () => {
    expect(mensajeDeError(403)).toMatch(/acceso/);
    expect(mensajeDeError(400)).toMatch(/IDs/);
    expect(mensajeDeError(503)).toMatch(/reintenta/);
    expect(mensajeDeError(undefined)).toMatch(/reintenta/);
  });
});
