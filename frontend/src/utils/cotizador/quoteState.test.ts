import { describe, expect, it } from 'vitest';
import {
  addInstall,
  addKit,
  addProduct,
  defaultQtyFor,
  marginRefs,
  removeKitComp,
  removeLine,
  setCustomMargin,
  setInstallFields,
  setKitCompQty,
  setLineQty,
  toggleInstallActive,
} from './quoteState';
import type { CotInstall, CotKit, CotKitLine, CotProduct, CotProductLine } from './types';

const prod = (extra: Partial<CotProduct> = {}): CotProduct => ({
  id: 1, kind: 'EQUIPO', code: 'EQ-0001', category: '', subcategory: '', model: '', name: 'Cámara', description: '',
  unit: 'u', defaultQty: 1, unitCost: 100, monthlyCost: 0, annualCost: 0, hasProfit: true, hasInstall: false,
  supplier: '', lastUpdate: null, notes: '', isActive: true, ...extra,
});

describe('addProduct()', () => {
  it('agrega con la cantidad por defecto del producto', () => {
    const [l] = addProduct([], prod({ defaultQty: 4 })) as CotProductLine[];
    expect(l).toMatchObject({ code: 'EQ-0001', qty: 4, installActive: false, techCost: 0, customMargin: null });
  });

  it('si ya está, suma 1 a su cantidad (no duplica la línea)', () => {
    const una = addProduct([], prod());
    const dos = addProduct(una, prod());
    expect(dos).toHaveLength(1);
    expect((dos[0] as CotProductLine).qty).toBe(2);
  });

  it('un servicio con solo costo anual entra por 12 meses', () => {
    expect(defaultQtyFor(prod({ kind: 'SERVICIO', monthlyCost: 0, annualCost: 1200 }))).toBe(12);
    expect(defaultQtyFor(prod({ kind: 'SERVICIO', monthlyCost: 100, annualCost: 1200 }))).toBe(1);
    expect(defaultQtyFor(prod({ defaultQty: 0 }))).toBe(1);
  });

  it('no modifica la lista original', () => {
    const base = addProduct([], prod());
    addProduct(base, prod());
    expect((base[0] as CotProductLine).qty).toBe(1);
  });
});

describe('kits', () => {
  const kit: CotKit = {
    id: 1, name: 'Kit CCTV', createdBy: null, createdAt: '',
    components: [
      { code: 'EQ-0001', qty: 2, included: true },
      { code: 'EQ-0002', qty: 1, included: false },
      { code: 'EQ-9999', qty: 1, included: true },
    ],
  };
  const byCode = new Map([['EQ-0001', prod()], ['EQ-0002', prod({ code: 'EQ-0002' })]]);

  it('solo entran los componentes incluidos que existen en el catálogo', () => {
    const [k] = addKit([], kit, byCode) as CotKitLine[];
    expect(k.isKit).toBe(true);
    expect(k.kitComponents.map((c) => c.code)).toEqual(['EQ-0001']);
    expect(k.kitComponents[0].qty).toBe(2);
  });

  it('un kit sin componentes válidos no se agrega', () => {
    expect(addKit([], { ...kit, components: [] }, byCode)).toEqual([]);
  });

  it('quitar el último componente quita el kit', () => {
    const items = addKit([], kit, byCode);
    expect(removeKitComp(items, 0, 0)).toEqual([]);
    expect(setKitCompQty(items, 0, 0, 0)).toEqual([]);
  });

  it('cambiar la cantidad de un componente', () => {
    const items = addKit([], kit, byCode);
    const out = setKitCompQty(items, 0, 0, 5) as CotKitLine[];
    expect(out[0].kitComponents[0].qty).toBe(5);
  });
});

describe('cantidades, instalación y márgenes', () => {
  it('cantidad 0 o negativa quita la línea', () => {
    const items = addProduct([], prod());
    expect(setLineQty(items, 0, 0)).toEqual([]);
    expect(setLineQty(items, 0, -3)).toEqual([]);
    expect((setLineQty(items, 0, 7)[0] as CotProductLine).qty).toBe(7);
  });

  it('quitar una línea', () => {
    const items = addProduct(addProduct([], prod()), prod({ code: 'EQ-0002' }));
    expect(removeLine(items, 0).map((l) => (l as CotProductLine).code)).toEqual(['EQ-0002']);
  });

  it('activar/desactivar instalación', () => {
    const items = addProduct([], prod());
    const on = toggleInstallActive(items, 0);
    expect((on[0] as CotProductLine).installActive).toBe(true);
    expect((toggleInstallActive(on, 0)[0] as CotProductLine).installActive).toBe(false);
  });

  it('margen propio y volver al del proveedor (null)', () => {
    const items = addProduct([], prod());
    const m = setCustomMargin(items, 0, 40);
    expect((m[0] as CotProductLine).customMargin).toBe(40);
    expect((setCustomMargin(m, 0, null)[0] as CotProductLine).customMargin).toBeNull();
  });
});

describe('servicios de instalación', () => {
  const inst: CotInstall = { id: 1, code: 'INST-001', category: 'X', subcategory: 'Y', name: 'Instalación', unitCost: 50, notes: '', isActive: true };

  it('entra con el margen por defecto (35 %) y su costo', () => {
    const [l] = addInstall([], inst) as unknown as Record<string, unknown>[];
    expect(l).toMatchObject({ isInstallService: true, id: 'INST-001', cost: 50, customCost: 50, customMargin: 35, qty: 1 });
  });

  it('si ya está, suma 1 a su cantidad', () => {
    const items = addInstall(addInstall([], inst), inst) as unknown as { qty: number }[];
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(2);
  });

  it('cambiar costo y margen', () => {
    const items = setInstallFields(addInstall([], inst), 0, { customCost: 80, customMargin: 10 }) as unknown as Record<string, unknown>[];
    expect(items[0]).toMatchObject({ customCost: 80, customMargin: 10 });
  });
});

describe('marginRefs()', () => {
  it('lista productos sueltos y componentes de kits, no los servicios de instalación', () => {
    const kit: CotKit = { id: 1, name: 'K', createdBy: null, createdAt: '', components: [{ code: 'EQ-0002', qty: 1, included: true }] };
    const byCode = new Map([['EQ-0002', prod({ code: 'EQ-0002' })]]);
    let items = addProduct([], prod());
    items = addKit(items, kit, byCode);
    items = addInstall(items, { id: 1, code: 'INST-001', category: '', subcategory: '', name: 'I', unitCost: 1, notes: '', isActive: true });
    const refs = marginRefs(items);
    expect(refs.map((r) => [r.index, r.compIndex, r.isKit])).toEqual([[0, undefined, false], [1, 0, true]]);
  });
});
