import {
  dominioDeLista,
  esSitioSensible,
  rutaLimpia,
  tituloLimpio,
} from './bitacora-sitios.util';
import { validarTramos } from './bitacora-extension.util';

describe('rutaLimpia', () => {
  it('quita la consulta y el fragmento y pone en minúsculas', () => {
    expect(rutaLimpia('/Ventas/Oportunidades?token=abc#x')).toBe(
      '/ventas/oportunidades',
    );
  });

  it('cambia los códigos largos por :id', () => {
    expect(rutaLimpia('/ventas/oportunidades/123456')).toBe(
      '/ventas/oportunidades/:id',
    );
    expect(
      rutaLimpia('/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit'),
    ).toBe('/document/d/:id/edit');
    expect(rutaLimpia('/clientes/3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(
      '/clientes/:id',
    );
    expect(rutaLimpia('/perfil/juan@correo.com')).toBe('/perfil/:id');
  });

  it('deja pasar los años y números cortos', () => {
    expect(rutaLimpia('/informes/2026/11')).toBe('/informes/2026/11');
  });

  it('devuelve null para la raíz o valores inválidos', () => {
    expect(rutaLimpia('/')).toBeNull();
    expect(rutaLimpia('sin-barra')).toBeNull();
    expect(rutaLimpia(42)).toBeNull();
  });

  it('recorta rutas larguísimas', () => {
    expect((rutaLimpia(`/${'a'.repeat(400)}`) ?? '').length).toBeLessThanOrEqual(
      120,
    );
  });
});

describe('tituloLimpio', () => {
  it('quita contadores, correos y números largos', () => {
    expect(tituloLimpio('(3) Contrato Solutech - Documentos')).toBe(
      'Contrato Solutech - Documentos',
    );
    expect(tituloLimpio('Bandeja - leidy@gemeseg.com')).toBe('Bandeja - …');
    expect(tituloLimpio('Cuenta 1234567890')).toBe('Cuenta …');
  });

  it('devuelve null si queda vacío y recorta lo largo', () => {
    expect(tituloLimpio('   ')).toBeNull();
    expect((tituloLimpio('x'.repeat(500)) ?? '').length).toBeLessThanOrEqual(
      120,
    );
  });
});

describe('esSitioSensible y dominioDeLista', () => {
  it('reconoce la lista por defecto, los subdominios, los bancos y la lista de la empresa', () => {
    expect(esSitioSensible('mail.google.com')).toBe(true);
    expect(esSitioSensible('x.facebook.com')).toBe(true);
    expect(esSitioSensible('bancoguayaquil.com')).toBe(true);
    expect(esSitioSensible('docs.google.com')).toBe(false);
    expect(esSitioSensible('intranet.miempresa.com', ['miempresa.com'])).toBe(
      true,
    );
  });

  it('normaliza lo que escribe el administrador', () => {
    expect(dominioDeLista('https://www.Banco.com/x?y=1')).toBe('banco.com');
    expect(dominioDeLista('no es un dominio')).toBeNull();
  });
});

describe('validarTramos con ruta y título', () => {
  const horario = {
    dias: [1, 2, 3, 4, 5, 6, 7],
    inicio: '00:00',
    fin: '23:59',
  };
  const ahora = new Date('2026-10-28T16:00:00Z');
  const tramo = (extra: Record<string, unknown>) => ({
    dominio: 'docs.google.com',
    inicio: new Date('2026-10-28T15:30:00Z').toISOString(),
    minutos: 5,
    ...extra,
  });

  it('guarda ruta y título ya limpios', () => {
    const r = validarTramos(
      [
        tramo({
          ruta: '/document/d/ABCDEFGH12345678/edit?x=1',
          titulo: '(2) Contrato',
        }),
      ],
      horario,
      null,
      ahora,
    );
    expect(r.validos[0].ruta).toBe('/document/d/:id/edit');
    expect(r.validos[0].titulo).toBe('Contrato');
  });

  it('en un sitio sensible descarta ruta y título', () => {
    const r = validarTramos(
      [
        tramo({
          dominio: 'mail.google.com',
          ruta: '/mail/u/0',
          titulo: 'Bandeja',
        }),
      ],
      horario,
      null,
      ahora,
    );
    expect(r.validos[0].ruta).toBeNull();
    expect(r.validos[0].titulo).toBeNull();
  });

  it('respeta los sitios sensibles propios de la empresa', () => {
    const r = validarTramos(
      [tramo({ dominio: 'intranet.empresa.com', ruta: '/x', titulo: 'Y' })],
      horario,
      null,
      ahora,
      [],
      ['empresa.com'],
    );
    expect(r.validos[0].ruta).toBeNull();
  });

  it('un envío antiguo sin ruta ni título sigue valiendo', () => {
    const r = validarTramos([tramo({})], horario, null, ahora);
    expect(r.validos).toHaveLength(1);
    expect(r.validos[0].ruta).toBeNull();
  });
});
