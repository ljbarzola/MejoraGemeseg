import ExcelJS from 'exceljs';
import { categoriaDe, corregirPuesto, planDesdeLibro, unificarCalibre } from './inventario-import.util';

/** Una hoja con la fila de títulos en la 2 (como en el Excel de Operaciones) y las filas que se le pasen. */
function hoja(libro: ExcelJS.Workbook, nombre: string, titulos: string[], filas: unknown[][]) {
  const ws = libro.addWorksheet(nombre);
  ws.getRow(2).values = [undefined, ...titulos];
  filas.forEach((f, i) => {
    ws.getRow(3 + i).values = [undefined, ...f] as ExcelJS.CellValue[];
  });
  return ws;
}

const F = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function libroDePrueba() {
  const l = new ExcelJS.Workbook();
  hoja(l, 'PUBLICOS ', ['ORD', 'UBICACIÓN', 'PUESTO', 'TIPO', 'MARCA', 'CALIBRE', 'FECHA CADUCIDAD', 'SERIE', 'CATEGORIA', 'MUNICIONES'], [
    [1, 'CUENCA', 'DISTRITO DE EDUCACION', 'REVOLVER', 'TAURUS', '38 SPL', F('2030-06-23'), 'A1', 'LETAL', 5],
    [2, 'CUENCA', 'MATERIDAD DEL GUASMO', 'REVOLVER', 'TAURUS', '38SPL', F('2030-06-23'), 'A2', 'LETAL', 5],
    [3, 'QUININDE', 'DISTRITO QUININDE', 'REVOLVER', 'TAURUS', '39 SPL', F('2030-06-23'), 'A3', 'LETAL', 5],
    [4, 'QUITO', 'IESS', 'REVOLVER', 'TAURUS', '38 SPL', F('2030-06-23'), 'A4', 'LETAL', 5],
  ]);
  hoja(l, 'PRIVADOS', ['ORD', 'INSTALACION', 'TIPO', 'MARCA', 'CALIBRE', 'MUNICIONES', 'CADUCA', 'SERIE', 'CATEGORIA'], [
    [1, 'TOPMOTORS', 'PISTOLA', 'EKOL', '9 MM', 8, F('2029-05-04'), 'P1', 'TRAUMATICA'],
    [2, 'ZUMO CACAO RONDA', 'ESCOPETA', 'MAVERICK', '12 SPL', 12, null, 'P2', 'LETAL'],
  ]);
  hoja(l, 'RASTRILLO', ['ORD', 'INSTALACION', 'TIPO', 'MARCA', 'CALIBRE', 'CADUCA', 'SERIE', 'CATEGORIA'], [
    [1, 'RASTRILLO', 'REVOLVER', 'TAURUS', '38 SPL', F('2030-06-23'), 'DUP-1', 'LETAL'],
    [2, 'RASTRILLO', 'PISTOLA', 'BLOW', '9 MM', 'ENVIO A LOJA', 'BORROSO', 'TRAUMATICA'],
    [3, 'ENVIO A LOJA', 'PISTOLA', 'EKOL', '9MM', F('2030-01-01'), 'L1', 'TRAUMATICA'],
    [4, null, null, null, null, null, null, null], // numerada pero vacía: no es un arma
  ]);
  hoja(l, 'CUSTODIA', ['ORD', 'INSTALACION', 'TIPO', 'MARCA', 'CALIBRE', 'CADUCA', 'MUNICIONES', 'SERIE', 'CATEGORIA'], [
    [1, 'RASTRILLO - CUSTODIA', 'REVOLVER', 'TAURUS', '38SPL', F('2030-06-23'), 10, 'DUP-1', 'LETAL-MOVIL'],
  ]);
  hoja(l, 'KEBLATS', ['ORD', 'UBICACION', 'PUESTO', 'TIPO', 'MARCA', 'FECHA CADUCIDAD', 'SERIE', 'CANTIDAD', undefined as unknown as string], [
    [1, 'CUENCA', 'DISTRITO DE EDUCACION', 'IIIA', null, null, null, 2, null],
    [2, 'PAJAN', 'U.E PAJAN', 'IIIA', 'KEVLAR', '03/20/2031', 9804, null, null],
    [3, 'CHIMBORAZO', null, 'IIIA', 'KEVLAR', null, null, 4, null],
    [4, 'GUAYAQUIL', 'RASTRILLO', 'IIIA', null, null, null, 13, 'PAQUETE SELLADO'],
    [5, 'GUAYAQUIL', 'MATERIDAD DEL GUASMO', 'IIIA', null, null, null, 0, null],
    ['TOTAL', null, null, null, null, null, null, 19, null],
  ]);
  hoja(l, 'ACCESORIOS', ['ORD', 'INSTALACION', 'TIPO', 'CANTIDAD', 'CATEGORIA'], [
    [1, 'RASTRILLO', 'ALIMENTADORA', 8, 'LETAL'],
    [2, null, 'ALIMENTADORA', 20, 'TRAUMATICA'],
    [3, null, 'MUNICUON CAL 9MM ', 10, 'LETAL'],
    [4, null, 'CASCOS', null, null],
    [5, null, 'BOTAS CAUCHO', null, '42-43-44'],
  ]);
  return l;
}

describe('ayudas de la lectura del Excel', () => {
  it('unifica el calibre sin cambiarlo', () => {
    expect(unificarCalibre('38SPL')).toBe('38 SPL');
    expect(unificarCalibre('38 SPL')).toBe('38 SPL');
    expect(unificarCalibre('9 mm')).toBe('9MM');
    expect(unificarCalibre('CAL12')).toBe('CAL 12');
    expect(unificarCalibre('39 SPL')).toBe('39 SPL');
    expect(unificarCalibre(null)).toBeNull();
  });

  it('reconoce las cuatro categorías', () => {
    expect(categoriaDe('LETAL')).toBe('LETAL');
    expect(categoriaDe('TRAUMATICA')).toBe('TRAUMATICA');
    expect(categoriaDe('DE FOGUEO')).toBe('FOGUEO');
    expect(categoriaDe('LETAL-MOVIL')).toBe('LETAL_MOVIL');
    expect(categoriaDe('otra cosa')).toBeNull();
  });

  it('solo corrige erratas obvias de puesto y avisa de la corrección', () => {
    expect(corregirPuesto('TOPMOTORS').nombre).toBe('TOP MOTORS');
    expect(corregirPuesto('TOPMOTORS').nota).toMatch(/TOPMOTORS/);
    expect(corregirPuesto('KIA MATRIZ')).toEqual({ nombre: 'KIA MATRIZ', nota: null });
    expect(corregirPuesto(null)).toEqual({ nombre: null, nota: null });
  });
});

describe('planDesdeLibro: armas', () => {
  const plan = planDesdeLibro(libroDePrueba());
  const arma = (serie: string) => plan.armas.find((a) => a.serie === serie)!;

  it('no da errores y cuenta una sola vez la serie repetida (queda la de Custodia)', () => {
    expect(plan.errores).toEqual([]);
    expect(plan.armas.filter((a) => a.serie === 'DUP-1')).toHaveLength(1);
    const dup = arma('DUP-1');
    expect(dup.hoja).toBe('CUSTODIA');
    expect(dup.uso).toBe('Custodia');
    expect(dup.categoria).toBe('LETAL_MOVIL');
    expect(dup.estado).toBe('DISPONIBLE');
    expect(dup.municiones).toBe(10);
    expect(dup.notas).toMatch(/repetida/);
    expect(dup.marcadaParaCorregir).toBe(false);
  });

  it('ignora la fila numerada pero vacía y no inventa series', () => {
    expect(plan.armas.map((a) => a.serie).sort()).toEqual(['A1', 'A2', 'A3', 'A4', 'BORROSO', 'DUP-1', 'L1', 'P1', 'P2']);
  });

  it('públicos y privados quedan asignados al puesto como texto; la ciudad solo viene de públicos', () => {
    expect(arma('A1')).toMatchObject({ estado: 'ASIGNADA', puestoNombre: 'DISTRITO DE EDUCACION', ciudad: 'CUENCA', categoria: 'LETAL', municiones: 5 });
    expect(arma('P1')).toMatchObject({ estado: 'ASIGNADA', puestoNombre: 'TOP MOTORS', ciudad: null, calibre: '9MM' });
    expect(arma('P1').notas).toMatch(/TOPMOTORS/);
  });

  it('una fecha que falta deja el vencimiento vacío sin marcar nada; una fecha real se guarda', () => {
    expect(arma('P2').permisoVence).toBeNull();
    expect(arma('P2').marcadaParaCorregir).toBe(false);
    expect(arma('P1').permisoVence).toBe('2029-05-04');
  });

  it('«ENVIO A LOJA» y «BORROSO» se cargan marcados para corregir y sin inventar fecha ni puesto', () => {
    const borroso = arma('BORROSO');
    expect(borroso.marcadaParaCorregir).toBe(true);
    expect(borroso.permisoVence).toBeNull();
    expect(borroso.notas).toMatch(/^CORREGIR/);
    expect(borroso.notas).toMatch(/BORROSO/);
    const loja = arma('L1');
    expect(loja.marcadaParaCorregir).toBe(true);
    expect(loja.puestoNombre).toBeNull();
    expect(loja.estado).toBe('DISPONIBLE');
    expect(loja.permisoVence).toBe('2030-01-01');
  });

  it('un calibre único que se parece a uno muy común se marca; los demás no', () => {
    expect(arma('A3').marcadaParaCorregir).toBe(true);
    expect(arma('A3').notas).toMatch(/38 SPL/);
    expect(arma('A1').marcadaParaCorregir).toBe(false);
    expect(arma('A2').calibre).toBe('38 SPL');
  });

  it('toda nota cabe en el campo de la pantalla (300)', () => {
    for (const a of plan.armas) expect((a.notas ?? '').length).toBeLessThanOrEqual(300);
  });
});

describe('planDesdeLibro: chalecos y accesorios', () => {
  const plan = planDesdeLibro(libroDePrueba());

  it('sin cantidad o en 0 no hay chalecos que cargar; solo cuenta lo escrito', () => {
    expect(plan.chalecos.articulo).toBe('Chaleco nivel IIIA');
    expect(plan.chalecos.filasEnCero).toBe(2); // la fila con serie y sin cantidad y la que dice 0
    expect(plan.chalecos.filas.reduce((s, f) => s + f.cantidad, 0)).toBe(19);
  });

  it('el rastrillo es la bodega y los demás van a su puesto (con la errata corregida solo en el nombre)', () => {
    const f = plan.chalecos.filas;
    expect(f.find((x) => x.cantidad === 13)).toMatchObject({ destino: 'BODEGA', puestoNombre: null });
    expect(f.find((x) => x.cantidad === 13)!.detalle).toMatch(/PAQUETE SELLADO/);
    expect(f.find((x) => x.puestoNombre === 'DISTRITO DE EDUCACION')).toMatchObject({ destino: 'PUESTO', cantidad: 2 });
  });

  it('sin nombre de puesto usa lo único que dice el Excel (la ciudad) y lo marca para corregir', () => {
    const chim = plan.chalecos.filas.find((x) => x.cantidad === 4)!;
    expect(chim.puestoNombre).toBe('CHIMBORAZO');
    expect(chim.detalle).toMatch(/CORREGIR/);
  });

  it('accesorios: solo con cantidad, categoría como variante y erratas del nombre corregidas', () => {
    expect(plan.accesorios.items.map((i) => `${i.nombre}|${i.variante}|${i.cantidad}`)).toEqual([
      'ALIMENTADORA|LETAL|8',
      'ALIMENTADORA|TRAUMATICA|20',
      'MUNICION CAL 9MM|LETAL|10',
    ]);
    expect(plan.accesorios.items[2].tipo).toBe('MUNICION');
    expect(plan.accesorios.items[0].tipo).toBe('IMPLEMENTO');
    expect(plan.accesorios.sinCantidad).toBe(2);
  });
});

describe('planDesdeLibro: un Excel que no es el esperado', () => {
  it('avisa de las hojas que faltan en vez de cargar a medias', () => {
    const l = new ExcelJS.Workbook();
    hoja(l, 'OTRA', ['A'], [['x']]);
    const plan = planDesdeLibro(l);
    expect(plan.errores.some((e) => /CUSTODIA/.test(e))).toBe(true);
    expect(plan.errores.some((e) => /KEBLATS/.test(e))).toBe(true);
    expect(plan.errores.some((e) => /ACCESORIOS/.test(e))).toBe(true);
    expect(plan.armas).toHaveLength(0);
  });
});
