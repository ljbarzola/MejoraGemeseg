import {
  atribuirCanal,
  extraerAtribucion,
  sugerirServicios,
} from './lead-atribucion.util';

describe('atribuirCanal', () => {
  it('un identificador de clic manda sobre cualquier utm', () => {
    expect(atribuirCanal({ gclid: 'abc', utm_source: 'facebook' })).toBe('GOOGLE_ADS');
    expect(atribuirCanal({ fbclid: 'x' })).toBe('META_ADS');
    expect(atribuirCanal({ li_fat_id: 'y' })).toBe('LINKEDIN_ADS');
  });

  it('sin identificador usa utm_source', () => {
    expect(atribuirCanal({ utm_source: 'google', utm_medium: 'cpc' })).toBe('GOOGLE_ADS');
    expect(atribuirCanal({ utm_source: 'Instagram' })).toBe('META_ADS');
    expect(atribuirCanal({ utm_source: 'linkedin' })).toBe('LINKEDIN_ADS');
  });

  it('google orgánico (medio organic) no cuenta como anuncio', () => {
    expect(atribuirCanal({ utm_source: 'google', utm_medium: 'organic' })).toBe('WEB_FORM');
  });

  it('sin nada es el formulario web', () => {
    expect(atribuirCanal({})).toBe('WEB_FORM');
    expect(atribuirCanal({ gclid: '  ' })).toBe('WEB_FORM');
  });
});

describe('sugerirServicios', () => {
  const catalogo = [
    { id: 1, name: 'Monitoreo de Alarmas' },
    { id: 2, name: 'Monitoreo de Cámaras' },
    { id: 3, name: 'Monitoreo de Vehículos' },
    { id: 4, name: 'Monitoreo de Personal' },
  ];

  it('relaciona las opciones de la landing de monitoreo con el catálogo', () => {
    expect(sugerirServicios('Alarmas', catalogo)).toEqual([1]);
    expect(sugerirServicios('Video/Cámaras', catalogo)).toEqual([2]);
    expect(sugerirServicios('Vehículos', catalogo)).toEqual([3]);
    expect(sugerirServicios('Flotas', catalogo)).toEqual([3]);
    expect(sugerirServicios('Bienes Muebles', catalogo)).toEqual([3]);
    expect(sugerirServicios('Personas', catalogo)).toEqual([4]);
    expect(sugerirServicios('Guardias en Línea', catalogo)).toEqual([4]);
  });

  it('«Varios servicios» o texto vacío no sugiere nada', () => {
    expect(sugerirServicios('Varios servicios', catalogo)).toEqual([]);
    expect(sugerirServicios('', catalogo)).toEqual([]);
    expect(sugerirServicios(null, catalogo)).toEqual([]);
  });

  it('si el servicio no está en el catálogo de la empresa, no inventa', () => {
    expect(sugerirServicios('Alarmas', [{ id: 9, name: 'Otro' }])).toEqual([]);
  });

  it('el nombre completo de un servicio también sirve', () => {
    expect(sugerirServicios('necesito monitoreo de personal', catalogo)).toEqual([4]);
  });
});

describe('extraerAtribucion', () => {
  it('guarda solo los campos conocidos y con valor', () => {
    expect(
      extraerAtribucion({ utm_source: 'google', gclid: ' g1 ', x: 'no', utm_term: '' }),
    ).toEqual({ utm_source: 'google', gclid: 'g1' });
  });
});
