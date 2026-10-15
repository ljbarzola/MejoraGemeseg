import {
  normalizarCorreo,
  normalizarTelefono,
  sugerirMotivoContacto,
} from './lead-triage.util';

describe('sugerirMotivoContacto', () => {
  it('reconoce una consulta de servicio', () => {
    expect(
      sugerirMotivoContacto('Buenas, necesito una cotización de guardias de seguridad para mi bodega'),
    ).toBe('SERVICIO');
  });

  it('reconoce una postulación aunque mencione seguridad', () => {
    expect(
      sugerirMotivoContacto('Adjunto mi hoja de vida, quiero trabajar en seguridad con ustedes'),
    ).toBe('EMPLEO');
  });

  it('reconoce a un proveedor', () => {
    expect(sugerirMotivoContacto('Somos distribuidor y les ofrecemos nuestro catálogo de uniformes')).toBe('PROVEEDOR');
  });

  it('reconoce spam por enlaces', () => {
    expect(sugerirMotivoContacto('Gana dinero rápido con bitcoin https://ejemplo.xyz')).toBe('SPAM');
  });

  it('ignora tildes y mayúsculas', () => {
    expect(sugerirMotivoContacto('COTIZACIÓN DE MONITOREO DE CÁMARAS')).toBe('SERVICIO');
  });

  it('sin indicios claros no sugiere nada', () => {
    expect(sugerirMotivoContacto('Hola')).toBeNull();
    expect(sugerirMotivoContacto('')).toBeNull();
  });
});

describe('normalizarTelefono', () => {
  it('compara el mismo número escrito de formas distintas', () => {
    const a = normalizarTelefono('+593 99 123 4567');
    const b = normalizarTelefono('099 123 4567');
    const c = normalizarTelefono('0991234567');
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toBe('991234567');
  });

  it('vacío si no hay dígitos', () => {
    expect(normalizarTelefono(null)).toBe('');
    expect(normalizarTelefono('sin número')).toBe('');
  });
});

describe('normalizarCorreo', () => {
  it('recorta espacios y pasa a minúsculas', () => {
    expect(normalizarCorreo('  Ana@Empresa.COM ')).toBe('ana@empresa.com');
    expect(normalizarCorreo(undefined)).toBe('');
  });
});
