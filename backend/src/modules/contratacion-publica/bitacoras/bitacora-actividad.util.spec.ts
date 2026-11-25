import { esSinAutorizacion, resumirActividad } from './bitacora-actividad.util';

describe('esSinAutorizacion', () => {
  it.each([
    'Ingresa vehículo placa ABC-1234 sin autorización',
    'Ingreso SIN AUTORIZACION de un proveedor',
    'Persona no autorizada intentó ingresar',
    'Entra sin permiso del administrador',
    'Ingresó no autorizado',
  ])('reconoce «%s»', (t) => expect(esSinAutorizacion(t)).toBe(true));

  it.each([
    'Ingresa vehículo con autorización del administrador',
    'Ingreso autorizado por el cliente',
    'Ronda por el perímetro, todo S/N',
    '',
    null,
  ])('no confunde «%s»', (t) => expect(esSinAutorizacion(t as string | null)).toBe(false));
});

describe('resumirActividad', () => {
  const n = (categoria: string, texto: string, puestoId = 1, puestoNombre = 'Garita A') => ({
    categoria,
    texto,
    puestoId,
    puestoNombre,
    entidadNombre: 'Entidad',
  });

  it('cuenta rondas, ingresos y vehículos por categoría', () => {
    const r = resumirActividad([
      n('RONDA', 'Ronda perímetro'),
      n('RONDA', 'Ronda interior'),
      n('ACCESO', 'Ingresa proveedor'),
      n('VEHICULOS', 'Sale camión'),
      n('SIN_NOVEDAD', 'Sin novedad'),
    ]);
    expect(r).toMatchObject({ rondas: 2, ingresosPersonas: 1, vehiculos: 1, ingresosSinAutorizacion: 0 });
  });

  it('cuenta los ingresos sin autorización solo en accesos y vehículos, y los ordena por puesto', () => {
    const r = resumirActividad([
      n('ACCESO', 'Persona sin autorización', 1, 'Garita A'),
      n('VEHICULOS', 'Vehículo sin autorización', 2, 'Garita B'),
      n('VEHICULOS', 'Otro vehículo no autorizado', 2, 'Garita B'),
      n('INCIDENTE', 'Alarma sin autorización', 3, 'Garita C'),
    ]);
    expect(r.ingresosSinAutorizacion).toBe(3);
    expect(r.puestosConIngresosSinAutorizacion.map((p) => [p.puestoNombre, p.cantidad])).toEqual([
      ['Garita B', 2],
      ['Garita A', 1],
    ]);
  });

  it('sin novedades devuelve ceros y lista vacía', () => {
    expect(resumirActividad([])).toEqual({
      rondas: 0,
      ingresosPersonas: 0,
      vehiculos: 0,
      ingresosSinAutorizacion: 0,
      puestosConIngresosSinAutorizacion: [],
    });
  });
});
