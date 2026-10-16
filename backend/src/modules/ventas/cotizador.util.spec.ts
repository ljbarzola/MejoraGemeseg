import { BadRequestException } from '@nestjs/common';
import {
  assertJsonSize,
  canDeleteQuote,
  canEditQuote,
  canShareQuote,
  codeWidth,
  ecuadorToday,
  formatCode,
  formatQuoteNumber,
  parseCodeNumber,
  quoteSeqOf,
  resolveQuoteAccess,
  sanitizeClient,
  sanitizeKitComponents,
  sanitizeLines,
  sanitizeMargins,
  toNum,
} from './cotizador.util';

describe('códigos del catálogo', () => {
  it('formatea con el ancho de cada tipo (igual que el cotizador original)', () => {
    expect(formatCode('EQUIPO', 7)).toBe('EQ-0007');
    expect(formatCode('MATERIAL', 53)).toBe('MT-0053');
    expect(formatCode('SERVICIO', 30)).toBe('SV-0030');
    expect(formatCode('INSTALACION', 56)).toBe('INST-056');
    expect(formatCode('EQUIPO', 12345)).toBe('EQ-12345');
  });

  it('ancho: INST-001 lleva 3 dígitos; el resto 4', () => {
    expect(codeWidth('INSTALACION')).toBe(3);
    expect(codeWidth('EQUIPO')).toBe(4);
  });

  it('lee el número de un código y rechaza formatos ajenos', () => {
    expect(parseCodeNumber('EQUIPO', 'EQ-0017')).toBe(17);
    expect(parseCodeNumber('INSTALACION', 'INST-056')).toBe(56);
    expect(parseCodeNumber('EQUIPO', 'MT-0017')).toBeNull();
    expect(parseCodeNumber('EQUIPO', 'EQ-12ab')).toBeNull();
    expect(parseCodeNumber('EQUIPO', 'SWITCH 5 PUERTOS')).toBeNull();
  });
});

describe('número de cotización', () => {
  it('COT-AAAAMMDD-NNNN, con secuencia global (no por día)', () => {
    expect(formatQuoteNumber('2026-10-15', 309)).toBe('COT-20261015-0309');
    expect(formatQuoteNumber('2026-10-16', 310)).toBe('COT-20261016-0310');
    expect(formatQuoteNumber('2026-01-02', 12345)).toBe('COT-20260102-12345');
  });

  it('extrae la secuencia de un número', () => {
    expect(quoteSeqOf('COT-20261015-0308')).toBe(308);
    expect(quoteSeqOf('SIN-NUMERO')).toBeNull();
  });

  it('la fecha de hoy es la de Ecuador, no la UTC', () => {
    // 2026-10-16 03:30 UTC = 2026-10-15 22:30 en Guayaquil (UTC-5)
    expect(ecuadorToday(new Date('2026-10-16T03:30:00Z'))).toBe('2026-10-15');
    expect(ecuadorToday(new Date('2026-10-16T06:00:00Z'))).toBe('2026-10-16');
  });
});

describe('quién ve y quién modifica una cotización (reglas del cotizador original)', () => {
  const base = {
    userId: 5,
    isAdmin: false,
    ownerId: 1,
    sharedWith: [] as number[],
    editorsOfOwner: [] as number[],
  };

  it('el dueño lo puede todo', () => {
    const a = resolveQuoteAccess({ ...base, userId: 1 });
    expect(a).toBe('owner');
    expect(canEditQuote(a)).toBe(true);
    expect(canDeleteQuote(a)).toBe(true);
    expect(canShareQuote(a)).toBe(true);
  });

  it('con "edición total" edita y cambia el estado, pero no elimina ni comparte', () => {
    const a = resolveQuoteAccess({ ...base, editorsOfOwner: [5] });
    expect(a).toBe('editor');
    expect(canEditQuote(a)).toBe(true);
    expect(canDeleteQuote(a)).toBe(false);
    expect(canShareQuote(a)).toBe(false);
  });

  it('con una cotización compartida solo la ve (y puede copiarla)', () => {
    const a = resolveQuoteAccess({ ...base, sharedWith: [5] });
    expect(a).toBe('shared');
    expect(canEditQuote(a)).toBe(false);
    expect(canDeleteQuote(a)).toBe(false);
  });

  it('el administrador la ve pero no la modifica (solo lectura)', () => {
    const a = resolveQuoteAccess({ ...base, isAdmin: true });
    expect(a).toBe('admin');
    expect(canEditQuote(a)).toBe(false);
    expect(canDeleteQuote(a)).toBe(false);
  });

  it('cualquier otra persona no la ve', () => {
    expect(resolveQuoteAccess(base)).toBeNull();
    expect(canEditQuote(null)).toBe(false);
  });

  it('prioridad: dueño > edición total > compartida > administrador', () => {
    expect(
      resolveQuoteAccess({
        ...base,
        userId: 1,
        isAdmin: true,
        sharedWith: [1],
        editorsOfOwner: [1],
      }),
    ).toBe('owner');
    expect(
      resolveQuoteAccess({
        ...base,
        isAdmin: true,
        sharedWith: [5],
        editorsOfOwner: [5],
      }),
    ).toBe('editor');
    expect(
      resolveQuoteAccess({ ...base, isAdmin: true, sharedWith: [5] }),
    ).toBe('shared');
  });
});

describe('toNum()', () => {
  it('convierte Decimal/string/number y nunca devuelve NaN', () => {
    expect(toNum(12.5)).toBe(12.5);
    expect(toNum('374.0300')).toBe(374.03);
    expect(toNum({ toString: () => '15.8000' })).toBe(15.8);
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum('abc')).toBe(0);
  });
});

describe('sanitizeLines() - lista blanca de campos', () => {
  it('productos por CÓDIGO con cantidad, margen y precio guardado (snap)', () => {
    const [l] = sanitizeLines([
      {
        code: 'EQ-0100',
        qty: 2,
        installActive: true,
        techCost: 5,
        customMargin: 25,
        snap: {
          cost: 374.03,
          hasGanancia: true,
          hasInstalacion: false,
          isService: false,
          supplier: 'X',
        },
        malicioso: '<script>',
      },
    ]) as any[];
    expect(l).toEqual({
      code: 'EQ-0100',
      qty: 2,
      installActive: true,
      techCost: 5,
      customMargin: 25,
      snap: {
        cost: 374.03,
        hasGanancia: true,
        hasInstalacion: false,
        isService: false,
        supplier: 'X',
      },
    });
    expect(l.malicioso).toBeUndefined();
  });

  it('valores por defecto: cantidad 1, sin margen propio, sin instalación', () => {
    const [l] = sanitizeLines([{ code: 'MT-0001' }]) as any[];
    expect(l).toMatchObject({
      qty: 1,
      installActive: false,
      techCost: 0,
      customMargin: null,
    });
    expect(l.snap).toBeUndefined();
  });

  it('un producto sin código se rechaza, salvo una línea antigua importada con su posición', () => {
    expect(() => sanitizeLines([{ qty: 1 }])).toThrow(BadRequestException);
    const [l] = sanitizeLines([
      { code: '', legacyPosition: 402, qty: 1 },
    ]) as any[];
    expect(l.legacyPosition).toBe(402);
  });

  it('servicios de instalación se guardan por valor', () => {
    const [l] = sanitizeLines([
      {
        isInstallService: true,
        id: 'INST-001',
        description: 'Instalación',
        cost: 50,
        qty: 2,
        customMargin: 35,
      },
    ]) as any[];
    expect(l).toEqual({
      isInstallService: true,
      id: 'INST-001',
      description: 'Instalación',
      category: '',
      subcategory: '',
      cost: 50,
      qty: 2,
      customCost: null,
      customMargin: 35,
    });
  });

  it('kits con sus componentes', () => {
    const [k] = sanitizeLines([
      {
        isKit: true,
        kitName: 'Kit CCTV',
        qty: 2,
        kitComponents: [{ code: 'EQ-0001', qty: 4 }],
      },
    ]) as any[];
    expect(k.isKit).toBe(true);
    expect(k.kitComponents[0]).toMatchObject({ code: 'EQ-0001', qty: 4 });
  });

  it('rechaza cantidades negativas o no numéricas, y listas demasiado grandes', () => {
    expect(() => sanitizeLines([{ code: 'EQ-1', qty: -1 }])).toThrow(
      BadRequestException,
    );
    expect(() => sanitizeLines([{ code: 'EQ-1', qty: 'mucho' }])).toThrow(
      BadRequestException,
    );
    expect(() => sanitizeLines('no es lista')).toThrow(BadRequestException);
    expect(() =>
      sanitizeLines(Array.from({ length: 501 }, () => ({ code: 'EQ-1' }))),
    ).toThrow(BadRequestException);
  });
});

describe('otros saneadores', () => {
  it('cliente: solo los 6 campos conocidos, recortados', () => {
    expect(
      sanitizeClient({ name: '  ACME  ', ruc: '099', extra: 'x' }),
    ).toEqual({
      name: 'ACME',
      ruc: '099',
      address: '',
      contact: '',
      phone: '',
      email: '',
    });
    expect(() => sanitizeClient('texto')).toThrow(BadRequestException);
  });

  it('márgenes por proveedor: numéricos', () => {
    expect(sanitizeMargins({ Sisegusa: 25, Otro: '15' })).toEqual({
      Sisegusa: 25,
      Otro: 15,
    });
    expect(sanitizeMargins(undefined)).toEqual({});
    expect(() => sanitizeMargins({ X: 'abc' })).toThrow(BadRequestException);
  });

  it('componentes de kit: código, cantidad e incluido (por defecto sí)', () => {
    expect(sanitizeKitComponents([{ code: ' EQ-0001 ', qty: 2 }])).toEqual([
      { code: 'EQ-0001', qty: 2, included: true },
    ]);
  });

  it('assertJsonSize rechaza lo desmesurado', () => {
    expect(() => assertJsonSize({ a: 'x'.repeat(100) }, 50, 'Algo')).toThrow(
      BadRequestException,
    );
    expect(() => assertJsonSize({ a: 1 }, 50, 'Algo')).not.toThrow();
  });
});
