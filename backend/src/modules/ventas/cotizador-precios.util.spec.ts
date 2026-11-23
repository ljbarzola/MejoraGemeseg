import { calcularCotizacionVenta, type ProductoCatalogo } from './cotizador-precios.util';
import type { CotProductLine } from './cotizador.util';

// La copia del cálculo en el servidor debe mandar el modelo del equipo a la página pública y a su PDF,
// en el mismo sitio donde antes iba el código. Materiales y servicios no lo llevan.

const producto = (extra: Partial<ProductoCatalogo>): ProductoCatalogo => ({
  code: 'EQ-0001',
  kind: 'EQUIPO',
  name: 'Cámara',
  unit: 'u',
  model: 'DS-X',
  unitCost: 100,
  monthlyCost: 0,
  annualCost: 0,
  hasProfit: true,
  hasInstall: false,
  supplier: 'Sisegusa',
  ...extra,
});

const linea = (code: string): CotProductLine => ({
  code,
  qty: 1,
  installActive: false,
  techCost: 0,
  customMargin: null,
});

function modeloDe(p: ProductoCatalogo): string | null {
  const r = calcularCotizacionVenta({
    items: [linea(p.code)],
    catalogo: new Map([[p.code, p]]),
    supplierMargins: {},
    installMargin: 35,
    discountType: 'none',
    discountValue: 0,
  });
  const bloque = r.bloques[0];
  return bloque?.tipo === 'producto' ? bloque.fila.modelo : null;
}

describe('calcularCotizacionVenta() - modelo en la fila pública', () => {
  it('el equipo manda su modelo', () => {
    expect(modeloDe(producto({ kind: 'EQUIPO', model: 'DS-X' }))).toBe('DS-X');
  });

  it('materiales y servicios no mandan modelo, aunque lo tengan cargado', () => {
    expect(modeloDe(producto({ kind: 'MATERIAL', model: 'DS-X' }))).toBe('');
    expect(modeloDe(producto({ kind: 'SERVICIO', code: 'SV-0001', model: 'DS-X', monthlyCost: 30 }))).toBe('');
  });

  it('un equipo sin modelo manda la cadena vacía (la hoja no imprime esa línea)', () => {
    expect(modeloDe(producto({ model: '' }))).toBe('');
  });
});
