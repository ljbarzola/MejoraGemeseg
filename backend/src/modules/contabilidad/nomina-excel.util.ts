import ExcelJS from 'exceljs';
import { diaEcuador } from '../../common/utils/viaje-fechas.util';

/** Qué contenido se exporta; el PDF y el Excel de cada uno traen las MISMAS columnas, en el mismo orden. */
export type DocumentoNomina = 'resumen' | 'persona' | 'detalle' | 'cronologica';

const dia = (d: unknown): string => {
  if (!d) return '';
  const [y, m, dd] = diaEcuador(new Date(d as string)).split('-');
  return `${dd}/${m}/${y}`;
};
const diaTexto = (iso: string): string => iso.split('-').reverse().join('/');

const negrita = { bold: true };
const encabezado = (ws: ExcelJS.Worksheet) => {
  ws.getRow(1).font = negrita;
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
};
const suma = (xs: any[], f: (e: any) => number) => xs.reduce((s, e) => s + (f(e) ?? 0), 0);

/** «Resumen» / matriz de todo el personal: una fila por persona. Mismas columnas que el PDF. */
function hojaResumen(wb: ExcelJS.Workbook, empleados: any[]) {
  const ws = wb.addWorksheet('Resumen');
  ws.columns = [
    { header: 'Persona', key: 'nombre', width: 32 },
    { header: 'Cédula', key: 'cedula', width: 14 },
    { header: 'Viajes', key: 'viajes', width: 9 },
    { header: 'Hacienda (USD)', key: 'hac', width: 15 },
    { header: 'Puerto (USD)', key: 'pue', width: 13 },
    { header: 'VIP (USD)', key: 'vip', width: 11 },
    { header: 'Subtotal viajes (USD)', key: 'sub', width: 20 },
    { header: 'Ajustes (USD)', key: 'aj', width: 14 },
    { header: 'Total neto (USD)', key: 'total', width: 17 },
  ];
  encabezado(ws);
  for (const e of empleados) {
    ws.addRow({
      nombre: e.nombre,
      cedula: e.cedula,
      viajes: e.total_viajes,
      hac: e.subtotales?.HACIENDA ?? 0,
      pue: e.subtotales?.PUERTO ?? 0,
      vip: e.subtotales?.VIP ?? 0,
      sub: e.subtotal_viajes_usd ?? 0,
      aj: e.ajustes_usd ?? 0,
      total: e.total_usd ?? 0,
    });
  }
  ws.addRow({
    nombre: 'TOTAL',
    viajes: suma(empleados, (e) => e.total_viajes),
    hac: suma(empleados, (e) => e.subtotales?.HACIENDA),
    pue: suma(empleados, (e) => e.subtotales?.PUERTO),
    vip: suma(empleados, (e) => e.subtotales?.VIP),
    sub: suma(empleados, (e) => e.subtotal_viajes_usd),
    aj: suma(empleados, (e) => e.ajustes_usd),
    total: suma(empleados, (e) => e.total_usd),
  }).font = negrita;
  for (const k of ['hac', 'pue', 'vip', 'sub', 'aj', 'total']) ws.getColumn(k).numFmt = '#,##0.00';
}

/** «Detalle»: una fila por persona y viaje. Mismas columnas que el PDF «Detalle de viajes». */
function hojaDetalle(wb: ExcelJS.Workbook, empleados: any[]) {
  const ws = wb.addWorksheet('Detalle');
  ws.columns = [
    { header: 'Persona', key: 'nombre', width: 32 },
    { header: 'Cédula', key: 'cedula', width: 14 },
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Guía', key: 'guia', width: 14 },
    { header: 'Rol', key: 'rol', width: 12 },
    { header: 'Tipo', key: 'tipo', width: 11 },
    { header: 'Cliente', key: 'cliente', width: 26 },
    { header: 'Placa', key: 'placa', width: 11 },
    { header: 'Monto (USD)', key: 'monto', width: 13 },
  ];
  encabezado(ws);
  let total = 0;
  for (const e of empleados) {
    for (const v of e.detalle ?? []) {
      total += v.monto ?? 0;
      ws.addRow({
        nombre: e.nombre,
        cedula: e.cedula,
        fecha: dia(v.fecha_hora_salida ?? v.fecha_registro),
        guia: v.numero_guia,
        rol: v.rol,
        tipo: v.tipo_custodia,
        cliente: v.cliente,
        placa: v.placa,
        monto: v.monto ?? 0,
      });
    }
  }
  ws.addRow({ nombre: 'TOTAL', monto: total }).font = negrita;
  ws.getColumn('monto').numFmt = '#,##0.00';
}

/** «Ajustes»: extras y descuentos del período (con signo, el descuento resta). */
function hojaAjustes(wb: ExcelJS.Workbook, empleados: any[]) {
  const ws = wb.addWorksheet('Ajustes');
  ws.columns = [
    { header: 'Persona', key: 'nombre', width: 32 },
    { header: 'Cédula', key: 'cedula', width: 14 },
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Tipo', key: 'tipo', width: 12 },
    { header: 'Monto (USD)', key: 'monto', width: 13 },
    { header: 'Motivo', key: 'motivo', width: 40 },
    { header: 'Viaje', key: 'viaje', width: 14 },
  ];
  encabezado(ws);
  for (const e of empleados) {
    for (const a of e.ajustes ?? []) {
      ws.addRow({
        nombre: e.nombre,
        cedula: e.cedula,
        fecha: diaTexto(a.fecha),
        tipo: a.tipo === 'DESCUENTO' ? 'Descuento' : 'Extra',
        monto: a.tipo === 'DESCUENTO' ? -a.monto : a.monto,
        motivo: a.concepto,
        viaje: a.numeroGuia ?? '',
      });
    }
  }
  ws.getColumn('monto').numFmt = '#,##0.00';
}

/** «Rol de pago» de UNA persona: sus viajes, luego subtotal, cada extra o descuento y el total neto. Igual que el PDF. */
function hojaRol(wb: ExcelJS.Workbook, emp: any) {
  const ws = wb.addWorksheet('Rol de pago');
  ws.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Guía', key: 'guia', width: 14 },
    { header: 'Rol', key: 'rol', width: 12 },
    { header: 'Tipo', key: 'tipo', width: 11 },
    { header: 'Cliente', key: 'cliente', width: 28 },
    { header: 'Placa', key: 'placa', width: 11 },
    { header: 'Monto (USD)', key: 'monto', width: 14 },
  ];
  encabezado(ws);
  for (const v of emp.detalle ?? []) {
    ws.addRow({
      fecha: dia(v.fecha_hora_salida ?? v.fecha_registro),
      guia: v.numero_guia,
      rol: v.rol,
      tipo: v.tipo_custodia,
      cliente: v.cliente,
      placa: v.placa,
      monto: v.monto ?? 0,
    });
  }
  ws.addRow({});
  ws.addRow({ cliente: 'Subtotal de viajes', monto: emp.subtotal_viajes_usd ?? emp.total_usd ?? 0 }).font = negrita;
  for (const a of emp.ajustes ?? []) {
    ws.addRow({
      fecha: diaTexto(a.fecha),
      guia: a.numeroGuia ?? '',
      rol: a.tipo === 'DESCUENTO' ? 'Descuento' : 'Extra',
      cliente: a.concepto,
      monto: a.tipo === 'DESCUENTO' ? -a.monto : a.monto,
    });
  }
  ws.addRow({ cliente: 'TOTAL NETO A PAGAR', monto: emp.total_usd ?? 0 }).font = negrita;
  ws.getColumn('monto').numFmt = '#,##0.00';
}

/** «Matriz»: una fila por viaje y una columna por persona (con el monto de cada una). Igual que el PDF cronológico. */
function hojaMatriz(wb: ExcelJS.Workbook, matriz: any) {
  const ws = wb.addWorksheet('Matriz');
  const personas: string[] = matriz?.columnas_trabajadores ?? [];
  ws.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Guía', key: 'guia', width: 14 },
    ...personas.map((p, i) => ({ header: p, key: `p${i}`, width: 16 })),
  ];
  encabezado(ws);
  for (const f of matriz?.filas ?? []) {
    const fila: Record<string, unknown> = { fecha: f.fecha, guia: f.numero_guia };
    personas.forEach((p, i) => { if (f.celdas?.[p]) fila[`p${i}`] = f.celdas[p].monto; });
    ws.addRow(fila);
  }
  const total: Record<string, unknown> = { fecha: 'TOTAL' };
  personas.forEach((p, i) => { total[`p${i}`] = matriz?.totales_por_trabajador?.[p] ?? 0; });
  ws.addRow(total).font = negrita;
  personas.forEach((_, i) => { ws.getColumn(`p${i}`).numFmt = '#,##0.00'; });
}

/**
 * Nómina de un período en Excel (2026-11-16). La PRIMERA hoja es siempre lo que se pidió y trae las mismas columnas y el
 * mismo orden que el PDF de ese contenido; después van, como hojas extra, las otras vistas (detalle, ajustes) para
 * filtrar y sumar. Contenidos: `resumen` (una fila por persona), `persona` (rol de pago de una cédula), `detalle`
 * (una fila por persona y viaje) y `cronologica` (viaje por viaje, una columna por persona).
 */
export async function generarExcelNomina(
  nomina: any,
  opciones: { documento?: DocumentoNomina; cedula?: string } | string = {},
): Promise<Buffer> {
  const op = typeof opciones === 'string' ? { cedula: opciones } : opciones;
  const documento: DocumentoNomina = op.cedula ? 'persona' : (op.documento ?? 'resumen');
  const todos: any[] = nomina.empleados_detalle ?? [];
  const empleados = op.cedula ? todos.filter((e) => e.cedula === op.cedula) : todos;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'GEMESEG';

  if (documento === 'persona') {
    if (empleados[0]) hojaRol(wb, empleados[0]);
    hojaAjustes(wb, empleados);
  } else if (documento === 'detalle') {
    hojaDetalle(wb, empleados);
    hojaResumen(wb, empleados);
    hojaAjustes(wb, empleados);
  } else if (documento === 'cronologica') {
    hojaMatriz(wb, nomina.matriz);
    hojaResumen(wb, empleados);
  } else {
    hojaResumen(wb, empleados);
    hojaDetalle(wb, empleados);
    hojaAjustes(wb, empleados);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
