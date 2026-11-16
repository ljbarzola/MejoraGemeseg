import {
  TARIFAS_CUSTODIA_POR_DEFECTO as T,
  calcularCustodia,
  limpiarEntrada,
  limpiarLineaCustodia,
  limpiarTarifas,
  tarifasDe,
  type EntradaCustodia,
} from './cotizador-custodia.util';

// Ejemplo de la hoja «GEMESEG | Cotizador de Custodia Móvil» (Guayaquil → Quito Sur, 2 choferes, sin custodios).
const hoja = {
  origen: 'Guayaquil',
  destino: 'Quito Sur',
  kmIda: 410,
  incluyeRegreso: false,
  kmRegreso: 410,
  kmAdicionales: 0,
  vehiculoTipo: 'ALQUILADO',
  vehiculos: 1,
  diasAlquiler: 1,
  region: 'Sierra',
  viajes: 1,
  horasTraslado: 24,
  horasEspera: 7,
  horasOtras: 0,
  agentes: 0,
  choferes: 2,
  comidasAgente: 0,
  comidasChofer: 3,
  noches: 0,
  peajes: 8,
  parqueos: 0,
  trasladosExtra: 0,
  otrosGastos: 0,
  extras: [],
  imprevistosPct: null,
  margenPct: null,
  ivaPct: null,
};

const entrada = (p: Partial<Record<keyof EntradaCustodia, unknown>> = {}) => limpiarEntrada({ ...hoja, ...p });

describe('cotizador-custodia.util', () => {
  describe('calcularCustodia', () => {
    it('reproduce la hoja al centavo (con el mínimo de custodios en 0, como la hoja)', () => {
      const r = calcularCustodia(entrada(), { ...T, minAgentes: 0 });
      expect(r.ok).toBe(true);
      expect(r.costoDirecto).toBe(325.89);
      expect(r.imprevistos).toBe(16.29);
      expect(r.costoTotal).toBe(342.19);
      expect(r.precioSinIva).toBe(488.84);
      expect(r.utilidad).toBe(146.65);
      expect(r.margenEfectivoPct).toBe(30);
      expect(r.costoPorKm).toBe(0.83);
      expect(r.precioPorKm).toBe(1.19);
    });

    it('con las tarifas por defecto exige al menos un custodio (los choferes no cuentan)', () => {
      const r = calcularCustodia(entrada(), T);
      expect(r.ok).toBe(false);
      expect(r.errores[0]).toMatch(/al menos 1 custodio/);
      expect(r.precioSinIva).toBe(0);
    });

    it('calcula el IVA (la hoja nunca lo calculaba) y respeta el IVA elegido en la cotización', () => {
      const con15 = calcularCustodia(entrada({ agentes: 1 }), T);
      expect(con15.ivaPct).toBe(15);
      expect(con15.iva).toBe(Math.round(con15.precioSinIva * 15) / 100);
      const con0 = calcularCustodia(entrada({ agentes: 1, ivaPct: 0 }), T);
      expect(con0.iva).toBe(0);
      expect(con0.totalConIva).toBe(con0.precioSinIva);
    });

    it('el margen es sobre el precio: precio = costo / (1 - margen)', () => {
      const r = calcularCustodia(entrada({ agentes: 1, margenPct: 50, imprevistosPct: 0 }), T);
      expect(r.precioSinIva).toBeCloseTo(r.costoDirecto * 2, 1);
    });

    it('el vehículo siempre vuelve; el servicio solo cuenta el regreso si la custodia lo cubre', () => {
      const soloIda = calcularCustodia(entrada({ agentes: 1, kmRegreso: null, kmAdicionales: 20 }), T);
      expect(soloIda.kmServicio).toBe(430);
      expect(soloIda.kmVehiculo).toBe(840);
      const conRegreso = calcularCustodia(entrada({ agentes: 1, incluyeRegreso: true, kmRegreso: null, kmAdicionales: 20 }), T);
      expect(conRegreso.kmServicio).toBe(840);
    });

    it('vehículo propio cobra mantenimiento y depreciación en vez de alquiler', () => {
      const r = calcularCustodia(entrada({ agentes: 1, vehiculoTipo: 'PROPIO' }), T);
      const claves = r.conceptos.map((c) => c.clave);
      expect(claves).toContain('mantenimiento');
      expect(claves).toContain('depreciacion');
      expect(claves).not.toContain('alquiler');
    });

    it('rechaza una región que no está en las tarifas y un margen de 100 % o más', () => {
      expect(calcularCustodia(entrada({ agentes: 1, region: 'Oriente' }), T).errores).toContain('Elige la región del servicio.');
      const t = { ...T, margenPct: 95 };
      expect(calcularCustodia(entrada({ agentes: 1 }), t).ok).toBe(true);
    });

    it('suma los extras: fijo × cantidad y porcentaje sobre el costo normal', () => {
      const tarifas = {
        ...T,
        extras: T.extras.map((e) =>
          e.id === 'pernocta' ? { ...e, valor: 50 } : e.id === 'recargo-nocturno' ? { ...e, valor: 10 } : e,
        ),
      };
      const base = calcularCustodia(entrada({ agentes: 1 }), tarifas);
      const conExtras = calcularCustodia(
        entrada({ agentes: 1, extras: [{ id: 'pernocta', cantidad: 2 }, { id: 'recargo-nocturno', cantidad: 1 }] }),
        tarifas,
      );
      const pernocta = conExtras.conceptos.find((c) => c.clave === 'extra-pernocta');
      const nocturno = conExtras.conceptos.find((c) => c.clave === 'extra-recargo-nocturno');
      expect(pernocta?.total).toBe(100);
      expect(nocturno?.total).toBeCloseTo(base.costoDirecto * 0.1, 1);
      expect(conExtras.costoDirecto).toBeGreaterThan(base.costoDirecto + 100);
    });

    it('un extra que ya no existe en las tarifas da error', () => {
      const r = calcularCustodia(entrada({ agentes: 1, extras: [{ id: 'borrado', cantidad: 1 }] }), T);
      expect(r.ok).toBe(false);
    });
  });

  describe('limpiarEntrada', () => {
    it('rechaza números negativos o absurdos', () => {
      expect(() => limpiarEntrada({ ...hoja, kmIda: -5 })).toThrow(/km de ida/);
      expect(() => limpiarEntrada({ ...hoja, peajes: 99_999_999_999 })).toThrow();
      expect(() => limpiarEntrada('hola')).toThrow();
    });

    it('un id de extra con caracteres raros se rechaza', () => {
      expect(() => limpiarEntrada({ ...hoja, extras: [{ id: '../x', cantidad: 1 }] })).toThrow();
    });
  });

  describe('tarifas', () => {
    it('sin nada guardado usa las de la hoja; con basura guardada también', () => {
      expect(tarifasDe(undefined)).toEqual(T);
      expect(tarifasDe({ regiones: [] })).toEqual(T);
    });

    it('lo que no se envía se conserva de la base', () => {
      const t = limpiarTarifas({ ivaPct: 0 }, T);
      expect(t.ivaPct).toBe(0);
      expect(t.margenPct).toBe(T.margenPct);
      expect(t.regiones).toEqual(T.regiones);
    });

    it('rechaza regiones repetidas, margen fuera de rango y rendimiento 0', () => {
      expect(() => limpiarTarifas({ regiones: [{ nombre: 'Costa', agente: 1 }, { nombre: 'costa', agente: 2 }] }, T)).toThrow(/repetida/);
      expect(() => limpiarTarifas({ margenPct: 120 }, T)).toThrow();
      expect(() => limpiarTarifas({ rendimientoKmGalon: 0 }, T)).toThrow(/rendimiento/i);
    });
  });

  describe('limpiarLineaCustodia', () => {
    it('acepta una línea guardada tal como sale del cálculo y acota sus números', () => {
      const r = calcularCustodia(entrada({ agentes: 1 }), T);
      const linea = limpiarLineaCustodia({
        isCustodia: true,
        id: 'custodia-1',
        description: 'Servicio de custodia móvil',
        qty: 1,
        entrada: entrada({ agentes: 1 }),
        resultado: { ...r, calculadoEn: '2026-11-16T10:00:00Z' },
      });
      expect(linea.resultado.precioSinIva).toBe(r.precioSinIva);
      expect(linea.resultado.conceptos.length).toBe(r.conceptos.length);
      expect(() => limpiarLineaCustodia({ isCustodia: true, id: 'x', entrada: hoja })).toThrow(/cálculo/);
      expect(() =>
        limpiarLineaCustodia({ isCustodia: true, id: 'x', entrada: hoja, resultado: { precioSinIva: -1 } }),
      ).toThrow();
    });
  });
});
