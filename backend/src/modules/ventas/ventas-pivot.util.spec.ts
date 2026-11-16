import {
  CLAVE_OTROS,
  armarPivot,
  construirPartes,
  opcionesDeFiltro,
  parsearConsulta,
  repartir,
  vendedorDeLaConsulta,
  type VentaPivot,
} from './ventas-pivot.util';

const venta = (p: Partial<VentaPivot> & { id: number }): VentaPivot => ({
  salesClientId: p.id,
  clienteNombre: `Cliente ${p.id}`,
  vendedorNombre: 'Ana',
  monto: 100,
  dia: '2026-11-05',
  provincia: 'Guayas',
  ciudad: 'Guayaquil',
  originType: 'LEAD',
  servicios: ['Guardianía'],
  ...p,
});

const consulta = (q: Parameters<typeof parsearConsulta>[0] = {}) => parsearConsulta(q);

describe('ventas-pivot.util', () => {
  describe('repartir', () => {
    it('reparte en centavos exactos y la suma no pierde nada', () => {
      expect(repartir(10000, 3)).toEqual([3334, 3333, 3333]);
      expect(repartir(10000, 3).reduce((a, b) => a + b, 0)).toBe(10000);
      expect(repartir(0, 2)).toEqual([0, 0]);
    });
  });

  describe('armarPivot', () => {
    it('vendedor en filas y cliente en columnas, con subcolumnas y fila de total', () => {
      const partes = construirPartes([
        venta({ id: 1, vendedorNombre: 'Ana', clienteNombre: 'Orodetti', monto: 300 }),
        venta({ id: 2, vendedorNombre: 'Ana', clienteNombre: 'Juan', monto: 100, salesClientId: 20 }),
        venta({ id: 3, vendedorNombre: 'Luis', clienteNombre: 'Orodetti', monto: 50, salesClientId: 1 }),
        venta({ id: 4, vendedorNombre: 'Ana', clienteNombre: 'Orodetti', monto: 200, salesClientId: 1 }),
      ]);
      const r = armarPivot(partes, consulta({ filas: 'vendedor', columna: 'cliente', medidas: 'monto,ventas' }));
      expect(r.columnas.map((c) => c.etiqueta)).toEqual(['Orodetti', 'Juan']); // la más vendida primero
      const ana = r.datos.find((f) => f.etiqueta === 'Ana')!;
      expect(ana.celdas[0]).toMatchObject({ monto: 500, ventas: 2 });
      expect(ana.celdas[1]).toMatchObject({ monto: 100, ventas: 1 });
      expect(ana.total).toMatchObject({ monto: 600, ventas: 3 });
      const luis = r.datos.find((f) => f.etiqueta === 'Luis')!;
      expect(luis.celdas[1]).toMatchObject({ monto: 0, ventas: 0, ticket: null });
      // Fila final: el total de cada columna y el general.
      expect(r.total.celdas[0]).toMatchObject({ monto: 550, ventas: 3 });
      expect(r.total.total).toMatchObject({ monto: 650, ventas: 4 });
      expect(r.ventas).toBe(4);
    });

    it('sin columna solo hay total por fila, ordenado por monto', () => {
      const partes = construirPartes([
        venta({ id: 1, vendedorNombre: 'Ana', monto: 10 }),
        venta({ id: 2, vendedorNombre: 'Luis', monto: 90 }),
      ]);
      const r = armarPivot(partes, consulta({ filas: 'vendedor' }));
      expect(r.columnas).toEqual([]);
      expect(r.datos.map((f) => f.etiqueta)).toEqual(['Luis', 'Ana']);
      expect(r.datos[0].celdas).toEqual([]);
      expect(r.datos[0].total.ticket).toBe(90);
    });

    it('una venta con dos servicios reparte el monto y cuenta como UNA venta en el total', () => {
      const partes = construirPartes([venta({ id: 1, monto: 101, servicios: ['Cámaras', 'Guardianía'] })]);
      const r = armarPivot(partes, consulta({ filas: 'servicio' }));
      const montos = r.datos.map((f) => f.total.monto).sort();
      expect(montos).toEqual([50.5, 50.5]); // 5050 centavos cada uno
      expect(r.datos.every((f) => f.total.ventas === 1)).toBe(true);
      expect(r.total.total).toMatchObject({ monto: 101, ventas: 1 });
    });

    it('al repartir un monto impar nada se pierde ni se inventa', () => {
      const partes = construirPartes([venta({ id: 1, monto: 100, servicios: ['A', 'B', 'C'] })]);
      const r = armarPivot(partes, consulta({ filas: 'servicio' }));
      expect(r.datos.reduce((s, f) => s + Math.round(f.total.monto * 100), 0)).toBe(10000);
      expect(r.total.total.monto).toBe(100);
    });

    it('filtrar por un servicio deja solo su parte del monto', () => {
      const partes = construirPartes([venta({ id: 1, monto: 100, servicios: ['Cámaras', 'Guardianía'] })]);
      const r = armarPivot(partes, consulta({ filas: 'vendedor', filtros: JSON.stringify({ servicio: ['Cámaras'] }) }));
      expect(r.total.total).toMatchObject({ monto: 50, ventas: 1 });
    });

    it('agrupar en dos niveles trae subtotal del grupo (sin repetir ventas) y sus hijos', () => {
      const partes = construirPartes([
        venta({ id: 1, provincia: 'Guayas', vendedorNombre: 'Ana', monto: 100 }),
        venta({ id: 2, provincia: 'Guayas', vendedorNombre: 'Luis', monto: 50 }),
        venta({ id: 3, provincia: 'Azuay', vendedorNombre: 'Ana', monto: 30 }),
      ]);
      const r = armarPivot(partes, consulta({ filas: 'provincia,vendedor' }));
      expect(r.datos.map((f) => f.etiqueta)).toEqual(['Guayas', 'Azuay']);
      const guayas = r.datos[0];
      expect(guayas.total).toMatchObject({ monto: 150, ventas: 2 });
      expect(guayas.hijos!.map((h) => h.etiqueta)).toEqual(['Ana', 'Luis']);
      expect(r.total.total.monto).toBe(180);
    });

    it('lo que no trae dato aparece como «Sin …» y la venta sin monto cuenta pero no suma dólares', () => {
      const partes = construirPartes([
        venta({ id: 1, vendedorNombre: null, provincia: null, servicios: [], monto: null }),
      ]);
      const r = armarPivot(partes, consulta({ filas: 'vendedor', columna: 'provincia' }));
      expect(r.datos[0].etiqueta).toBe('Sin responsable');
      expect(r.columnas[0].etiqueta).toBe('Sin provincia');
      expect(r.total.total).toMatchObject({ monto: 0, ventas: 1, ticket: 0 });
      expect(r.sinMonto).toBe(1);
      expect(armarPivot(partes, consulta({ filas: 'servicio' })).datos[0].etiqueta).toBe('Sin servicio');
    });

    it('los meses van en orden de calendario y con nombre', () => {
      const partes = construirPartes([
        venta({ id: 1, dia: '2026-12-02', monto: 500 }),
        venta({ id: 2, dia: '2026-11-20', monto: 10 }),
      ]);
      const r = armarPivot(partes, consulta({ filas: 'mes' }));
      expect(r.datos.map((f) => f.etiqueta)).toEqual(['Noviembre 2026', 'Diciembre 2026']);
    });

    it('rango de precio: tramos fijos y «Sin monto» al final', () => {
      const partes = construirPartes([
        venta({ id: 1, monto: 499.99 }),
        venta({ id: 2, monto: 500 }),
        venta({ id: 3, monto: 10000 }),
        venta({ id: 4, monto: null }),
      ]);
      const r = armarPivot(partes, consulta({ filas: 'rango' }));
      expect(r.datos.map((f) => f.etiqueta)).toEqual(['Menos de $500', '$500 a $1,999', '$10,000 o más', 'Sin monto']);
    });

    it('con demasiadas columnas junta las menos vendidas en «Otros» sin perder montos', () => {
      const ventas = Array.from({ length: 15 }, (_, i) => venta({ id: i + 1, clienteNombre: `C${i + 1}`, monto: 100 - i }));
      const r = armarPivot(construirPartes(ventas), consulta({ filas: 'vendedor', columna: 'cliente', medidas: 'monto' }));
      expect(r.columnas).toHaveLength(13);
      expect(r.columnas[12].clave).toBe(CLAVE_OTROS);
      expect(r.plegado.columnas).toBe(3);
      const fila = r.datos[0];
      const suma = fila.celdas.reduce((s, c) => s + Math.round(c.monto * 100), 0);
      expect(suma).toBe(Math.round(fila.total.monto * 100));
    });

    it('el tipo de venta usa nombres entendibles', () => {
      const partes = construirPartes([venta({ id: 1, originType: 'RENOVACION' }), venta({ id: 2, originType: 'MANUAL' })]);
      const r = armarPivot(partes, consulta({ filas: 'tipo' }));
      expect(r.datos.map((f) => f.etiqueta).sort()).toEqual(['Ingreso manual', 'Renovación']);
    });

    it('un periodo sin ventas da una tabla vacía con total en cero', () => {
      const r = armarPivot([], consulta({ filas: 'vendedor', columna: 'servicio' }));
      expect(r.datos).toEqual([]);
      expect(r.columnas).toEqual([]);
      expect(r.total.total).toMatchObject({ monto: 0, ventas: 0, ticket: null });
    });
  });

  describe('opcionesDeFiltro', () => {
    it('lista los valores de cada dimensión, de todo el periodo', () => {
      const o = opcionesDeFiltro(construirPartes([venta({ id: 1, vendedorNombre: 'Ana' }), venta({ id: 2, vendedorNombre: 'Luis', monto: 900 })]));
      expect(o.vendedor.map((x) => x.valor)).toEqual(['Luis', 'Ana']);
      expect(o.mes[0]).toEqual({ valor: '2026-11', etiqueta: 'Noviembre 2026' });
    });
  });

  describe('parsearConsulta', () => {
    it('sin nada pide vendedor en filas con monto y ventas', () => {
      expect(parsearConsulta({})).toEqual({ filas: ['vendedor'], columna: null, medidas: ['monto', 'ventas'], filtros: {} });
    });

    it('rechaza lo que no existe, más de dos niveles y una columna repetida', () => {
      expect(() => parsearConsulta({ filas: 'sueldo' })).toThrow();
      expect(() => parsearConsulta({ filas: 'vendedor,cliente,mes' })).toThrow(/dos niveles/);
      expect(() => parsearConsulta({ filas: 'vendedor', columna: 'vendedor' })).toThrow(/misma/);
      expect(() => parsearConsulta({ medidas: 'x' })).toThrow();
      expect(() => parsearConsulta({ filtros: 'no-json' })).toThrow();
      expect(() => parsearConsulta({ filtros: '[]' })).toThrow();
      expect(() => parsearConsulta({ filtros: '{"nada":["a"]}' })).toThrow();
    });

    it('ordena los datos siempre igual y deja pasar «ninguna» como sin columna', () => {
      expect(parsearConsulta({ medidas: 'ticket,monto', columna: 'ninguna' })).toMatchObject({ medidas: ['monto', 'ticket'], columna: null });
    });
  });

  describe('vendedorDeLaConsulta', () => {
    it('un vendedor nunca ve a los demás, ni pidiendo toda la empresa', () => {
      expect(vendedorDeLaConsulta({ userId: 5, role: 'EMPLOYEE', alcance: 'all' })).toBe(5);
      expect(vendedorDeLaConsulta({ userId: 5, role: 'EMPLOYEE', alcance: '9' })).toBe(5);
      expect(vendedorDeLaConsulta({ userId: 5, role: 'EMPLOYEE' })).toBe(5);
    });
    it('gerencia ve toda la empresa o a una persona', () => {
      expect(vendedorDeLaConsulta({ userId: 1, role: 'ADMIN', alcance: 'all' })).toBeNull();
      expect(vendedorDeLaConsulta({ userId: 1, role: 'MANAGER', alcance: '9' })).toBe(9);
      expect(vendedorDeLaConsulta({ userId: 1, role: 'MANAGER', alcance: 'mine' })).toBe(1);
    });
  });
});
