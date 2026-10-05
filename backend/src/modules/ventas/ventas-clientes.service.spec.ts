import { BadRequestException } from '@nestjs/common';
import {
  conSubserviciosPorDefecto,
  fechaIngresoParaEditar,
  normalizarSubopciones,
  normalizarSubservicios,
  parseFechaIngreso,
  trasladarSubserviciosLegado,
} from './ventas-clientes.service';

describe('fecha de ingreso', () => {
  // 2026-10-02 12:00 en Ecuador (UTC-5) = 17:00Z
  const ahora = new Date('2026-10-02T17:00:00.000Z');

  it('sin valor no cambia nada', () => {
    expect(parseFechaIngreso('', ahora)).toBeUndefined();
    expect(parseFechaIngreso(undefined, ahora)).toBeUndefined();
  });

  it('guarda el día a mediodía UTC', () => {
    expect(parseFechaIngreso('2026-07-15', ahora)?.toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });

  it('acepta hoy', () => {
    expect(parseFechaIngreso('2026-10-02', ahora)).toBeInstanceOf(Date);
  });

  it('no deja "hoy" en Ecuador como futuro aunque en UTC ya sea mañana', () => {
    // 2026-10-02 21:00 en Ecuador = 2026-10-03T02:00Z
    const tarde = new Date('2026-10-03T02:00:00.000Z');
    expect(parseFechaIngreso('2026-10-02', tarde)).toBeInstanceOf(Date);
  });

  it('rechaza fechas futuras y formatos inválidos', () => {
    expect(() => parseFechaIngreso('2026-10-03', ahora)).toThrow(BadRequestException);
    expect(() => parseFechaIngreso('15/07/2026', ahora)).toThrow(BadRequestException);
    expect(() => parseFechaIngreso('2026-02-31', ahora)).toThrow(BadRequestException);
  });

  it('al editar solo reescribe si el día cambió', () => {
    const actual = new Date('2026-07-15T20:30:45.000Z'); // 15:30 del 15 en Ecuador
    expect(fechaIngresoParaEditar('2026-07-15', actual, ahora)).toBeUndefined();
    expect(fechaIngresoParaEditar('2026-07-10', actual, ahora)?.toISOString()).toBe(
      '2026-07-10T12:00:00.000Z',
    );
  });
});

describe('sub-servicios', () => {
  const opciones = [
    { key: 'SEGURIDAD_FISICA', label: 'Seguridad Física', children: [{ key: 'SEGURIDAD_VIP', label: 'Seguridad VIP' }, { key: 'SEGURIDAD_PARA_EVENTOS', label: 'Seguridad para Eventos' }] },
    { key: 'MONITOREO', label: 'Monitoreo', children: [] },
  ];

  it('vacío siempre es válido (campo opcional)', () => {
    expect(normalizarSubservicios(opciones, 'SEGURIDAD_FISICA', '')).toBe('');
    expect(normalizarSubservicios(opciones, undefined, [])).toBe('');
  });

  it('acepta varias del servicio elegido, sin duplicados', () => {
    expect(
      normalizarSubservicios(opciones, 'SEGURIDAD_FISICA', ['SEGURIDAD_VIP', 'SEGURIDAD_VIP', 'SEGURIDAD_PARA_EVENTOS']),
    ).toBe('SEGURIDAD_VIP,SEGURIDAD_PARA_EVENTOS');
    expect(normalizarSubservicios(opciones, 'SEGURIDAD_FISICA', 'SEGURIDAD_VIP')).toBe('SEGURIDAD_VIP');
  });

  it('rechaza las que no son del servicio, o si el servicio no tiene sub-servicios / es "Otro"', () => {
    expect(() => normalizarSubservicios(opciones, 'SEGURIDAD_FISICA', 'CERCO_ELECTRICO')).toThrow(BadRequestException);
    expect(() => normalizarSubservicios(opciones, 'MONITOREO', 'SEGURIDAD_VIP')).toThrow(BadRequestException);
    expect(() => normalizarSubservicios(opciones, 'Texto libre', 'SEGURIDAD_VIP')).toThrow(BadRequestException);
  });

  it('siembra los por defecto solo donde no hay children definido', () => {
    const { options, changed } = conSubserviciosPorDefecto([
      { key: 'SEGURIDAD_FISICA', label: 'Seguridad Física' },
      { key: 'MONITOREO', label: 'Monitoreo', children: [{ key: 'X', label: 'Editado por Ventas' }] },
      { key: 'OTRA', label: 'Otra' },
    ]);
    expect(changed).toBe(true);
    expect(options[0].children).toHaveLength(4);
    expect(options[1].children).toEqual([{ key: 'X', label: 'Editado por Ventas' }]);
    expect(options[2].children).toBeUndefined();
  });

  it('si Ventas vació la lista ([]) no se vuelve a sembrar', () => {
    const { changed } = conSubserviciosPorDefecto([{ key: 'SEGURIDAD_FISICA', label: 'Seguridad Física', children: [] }]);
    expect(changed).toBe(false);
  });
});

describe('subservicios legado', () => {
  it('copia la clave vieja a servicio_requerido__sub y la quita', () => {
    expect(
      trasladarSubserviciosLegado({
        servicio_requerido: 'MONITOREO',
        subservicios_requeridos: 'MONITOREO_DE_CAMARAS',
      }),
    ).toEqual({
      servicio_requerido: 'MONITOREO',
      servicio_requerido__sub: 'MONITOREO_DE_CAMARAS',
    });
  });

  it('no pisa casillas que ya están en la clave nueva', () => {
    expect(
      trasladarSubserviciosLegado({
        subservicios_requeridos: 'VIEJO',
        servicio_requerido__sub: 'NUEVO',
      }),
    ).toEqual({ servicio_requerido__sub: 'NUEVO' });
  });
});

describe('subopciones', () => {
  const opciones = [
    {
      key: 'CAMPANA',
      label: 'Campaña',
      children: [
        { key: 'FACEBOOK', label: 'Facebook' },
        { key: 'INSTAGRAM', label: 'Instagram' },
      ],
    },
    { key: 'REFERIDO', label: 'Referido', children: [] },
  ];

  it('vacío siempre es válido (casillas opcionales)', () => {
    expect(normalizarSubopciones(opciones, 'CAMPANA', '')).toBe('');
    expect(normalizarSubopciones(opciones, undefined, [])).toBe('');
  });

  it('acepta varias de la opción elegida, sin duplicados', () => {
    expect(normalizarSubopciones(opciones, 'CAMPANA', ['FACEBOOK', 'FACEBOOK', 'INSTAGRAM'])).toBe(
      'FACEBOOK,INSTAGRAM',
    );
    expect(normalizarSubopciones(opciones, 'CAMPANA', 'INSTAGRAM')).toBe('INSTAGRAM');
  });

  it('rechaza las de otra opción, o si la opción no tiene subopciones / es texto libre', () => {
    expect(() => normalizarSubopciones(opciones, 'CAMPANA', 'TIKTOK')).toThrow(BadRequestException);
    expect(() => normalizarSubopciones(opciones, 'REFERIDO', 'FACEBOOK')).toThrow(BadRequestException);
    expect(() => normalizarSubopciones(opciones, 'Feria del barrio', 'FACEBOOK')).toThrow(BadRequestException);
  });
});
