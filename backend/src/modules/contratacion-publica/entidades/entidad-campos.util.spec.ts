import { BadRequestException } from '@nestjs/common';
import {
  CampoDefinicion,
  limpiarOpciones,
  normalizarCamposExtra,
} from './entidad-campos.util';

const campo = (id: number, tipo: string, extra: Partial<CampoDefinicion> = {}): CampoDefinicion => ({
  id,
  nombre: `Campo ${id}`,
  tipo,
  opciones: null,
  obligatorio: false,
  activo: true,
  ...extra,
});

describe('limpiarOpciones', () => {
  it('quita vacías, repetidas (sin importar mayúsculas) y no-texto', () => {
    expect(limpiarOpciones([' A ', 'a', '', 5, 'B'])).toEqual(['A', 'B']);
    expect(limpiarOpciones('no es lista')).toEqual([]);
  });
});

describe('normalizarCamposExtra', () => {
  it('valida cada tipo y guarda el valor limpio', () => {
    const campos = [
      campo(1, 'TEXTO'),
      campo(2, 'NUMERO'),
      campo(3, 'FECHA'),
      campo(4, 'LISTA', { opciones: ['Ministerio', 'Otra'] }),
    ];
    const r = normalizarCamposExtra(
      { '1': '  hola ', '2': '12,5', '3': '2026-10-05', '4': 'Ministerio' },
      campos,
      null,
      true,
    );
    expect(r).toEqual({ '1': 'hola', '2': 12.5, '3': '2026-10-05', '4': 'Ministerio' });
  });

  it('rechaza valores que no corresponden al tipo, nombrando el campo', () => {
    expect(() => normalizarCamposExtra({ '2': 'abc' }, [campo(2, 'NUMERO')], null, true)).toThrow(
      /«Campo 2» debe ser un número/,
    );
    expect(() => normalizarCamposExtra({ '3': '2026-02-31' }, [campo(3, 'FECHA')], null, true)).toThrow(
      /fecha válida/,
    );
    expect(() => normalizarCamposExtra({ '3': '05/10/2026' }, [campo(3, 'FECHA')], null, true)).toThrow(
      BadRequestException,
    );
    expect(() =>
      normalizarCamposExtra({ '4': 'Inventada' }, [campo(4, 'LISTA', { opciones: ['A'] })], null, true),
    ).toThrow(/lista de opciones/);
  });

  it('un campo obligatorio vacío falla; uno opcional vacío se quita', () => {
    expect(() =>
      normalizarCamposExtra({ '1': '   ' }, [campo(1, 'TEXTO', { obligatorio: true })], null, true),
    ).toThrow(/«Campo 1» es obligatorio/);
    expect(normalizarCamposExtra({ '1': '' }, [campo(1, 'TEXTO')], { '1': 'viejo' }, true)).toEqual({});
  });

  it('no exige obligatorios si se pide que no (entidades creadas desde Drive)', () => {
    expect(
      normalizarCamposExtra({}, [campo(1, 'TEXTO', { obligatorio: true })], null, false),
    ).toEqual({});
  });

  it('conserva el valor de un campo desactivado y descarta lo enviado para él', () => {
    const r = normalizarCamposExtra(
      { '9': 'intento de cambio' },
      [campo(9, 'TEXTO', { activo: false })],
      { '9': 'guardado' },
      true,
    );
    expect(r).toEqual({ '9': 'guardado' });
  });
});
