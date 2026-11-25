import {
  fotosPedidasDeViaje,
  fotosPedidasPorDefecto,
  normalizarFotosPedidas,
  resolverFotosPedidas,
} from './custodias-fotos-pedidas.util';

describe('fotosPedidasPorDefecto', () => {
  it('pide Carga y Sellos al salir de un Puerto y solo Carga en lo demás; VIP no pide nada', () => {
    const d = fotosPedidasPorDefecto();
    expect(d.PUERTO.SALIDA.map((f) => f.nombre)).toEqual(['Carga', 'Sellos']);
    expect(d.PUERTO.LLEGADA.map((f) => f.nombre)).toEqual(['Carga']);
    expect(d.HACIENDA.SALIDA.map((f) => f.nombre)).toEqual(['Carga']);
    expect(d.HACIENDA.LLEGADA.map((f) => f.nombre)).toEqual(['Carga']);
    expect(d.VIP).toEqual({ SALIDA: [], LLEGADA: [] });
    expect(d.PUERTO.SALIDA.every((f) => f.obligatoria && f.varias)).toBe(true);
  });
});

describe('resolverFotosPedidas', () => {
  it('sin nada guardado usa lo de por defecto', () => {
    expect(resolverFotosPedidas(null)).toEqual(fotosPedidasPorDefecto());
    expect(resolverFotosPedidas('no es json')).toEqual(fotosPedidasPorDefecto());
  });

  it('respeta una lista vacía guardada y completa lo que falta', () => {
    const r = resolverFotosPedidas({ PUERTO: { SALIDA: [] } });
    expect(r.PUERTO.SALIDA).toEqual([]);
    expect(r.PUERTO.LLEGADA.map((f) => f.nombre)).toEqual(['Carga']);
  });
});

describe('normalizarFotosPedidas', () => {
  it('limpia nombres y rechaza repetidos, vacíos y listas largas', () => {
    const ok = normalizarFotosPedidas({ VIP: { SALIDA: [{ nombre: '  Placa ', obligatoria: false, varias: true }] } });
    expect(ok.VIP.SALIDA).toEqual([{ nombre: 'Placa', obligatoria: false, varias: true }]);
    expect(() => normalizarFotosPedidas({ VIP: { SALIDA: [{ nombre: 'A' }, { nombre: 'a' }] } })).toThrow();
    expect(() => normalizarFotosPedidas({ VIP: { SALIDA: [{ nombre: '   ' }] } })).toThrow();
    const nueve = Array.from({ length: 9 }, (_, i) => ({ nombre: `F${i}` }));
    expect(() => normalizarFotosPedidas({ VIP: { SALIDA: nueve } })).toThrow();
    expect(() => normalizarFotosPedidas({ VIP: { SALIDA: [{ nombre: 'x'.repeat(41) }] } })).toThrow();
    expect(() => normalizarFotosPedidas('hola')).toThrow();
  });
});

describe('fotosPedidasDeViaje', () => {
  it('un tipo desconocido no pide fotos', () => {
    expect(fotosPedidasDeViaje(fotosPedidasPorDefecto(), 'OTRO')).toEqual({ SALIDA: [], LLEGADA: [] });
    expect(fotosPedidasDeViaje(fotosPedidasPorDefecto(), 'HACIENDA').SALIDA).toHaveLength(1);
  });
});
