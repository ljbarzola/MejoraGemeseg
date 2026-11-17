import ExcelJS from 'exceljs';
import { diaEcuador } from '../../common/utils/viaje-fechas.util';

const dia = (d: unknown): string => {
  if (!d) return '';
  const [y, m, dd] = diaEcuador(new Date(d as string)).split('-');
  return `${dd}/${m}/${y}`;
};
const diaTexto = (iso: string): string => iso.split('-').reverse().join('/');

/**
 * Nómina de un período en Excel (2026-11-16): lo mismo que la matriz y el rol de pago en PDF, pero en hojas que se
 * pueden filtrar y sumar. Tres hojas: «Resumen» (una fila por persona: viajes por tipo, subtotal, ajustes y neto),
 * «Detalle» (una fila por persona y viaje) y «Ajustes» (extras y descuentos del período). Con `cedula` solo sale esa persona.
 */
export async function generarExcelNomina(nomina: any, cedula?: string): Promise<Buffer> {
  const todos: any[] = nomina.empleados_detalle ?? [];
  const empleados = cedula ? todos.filter((e) => e.cedula === cedula) : todos;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'GEMESEG';
  const negrita = { bold: true };
  const encabezado = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = negrita;
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };

  const resumen = wb.addWorksheet('Resumen');
  resumen.columns = [
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
  encabezado(resumen);
  for (const e of empleados) {
    resumen.addRow({
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
  const filaTotal = resumen.addRow({
    nombre: 'TOTAL',
    viajes: empleados.reduce((s, e) => s + (e.total_viajes ?? 0), 0),
    hac: empleados.reduce((s, e) => s + (e.subtotales?.HACIENDA ?? 0), 0),
    pue: empleados.reduce((s, e) => s + (e.subtotales?.PUERTO ?? 0), 0),
    vip: empleados.reduce((s, e) => s + (e.subtotales?.VIP ?? 0), 0),
    sub: empleados.reduce((s, e) => s + (e.subtotal_viajes_usd ?? 0), 0),
    aj: empleados.reduce((s, e) => s + (e.ajustes_usd ?? 0), 0),
    total: empleados.reduce((s, e) => s + (e.total_usd ?? 0), 0),
  });
  filaTotal.font = negrita;
  for (const k of ['hac', 'pue', 'vip', 'sub', 'aj', 'total']) resumen.getColumn(k).numFmt = '#,##0.00';

  const detalle = wb.addWorksheet('Detalle');
  detalle.columns = [
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
  encabezado(detalle);
  for (const e of empleados) {
    for (const v of e.detalle ?? []) {
      detalle.addRow({
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
  detalle.getColumn('monto').numFmt = '#,##0.00';

  const ajustes = wb.addWorksheet('Ajustes');
  ajustes.columns = [
    { header: 'Persona', key: 'nombre', width: 32 },
    { header: 'Cédula', key: 'cedula', width: 14 },
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Tipo', key: 'tipo', width: 12 },
    { header: 'Monto (USD)', key: 'monto', width: 13 },
    { header: 'Motivo', key: 'motivo', width: 40 },
    { header: 'Viaje', key: 'viaje', width: 14 },
  ];
  encabezado(ajustes);
  for (const e of empleados) {
    for (const a of e.ajustes ?? []) {
      ajustes.addRow({
        nombre: e.nombre,
        cedula: e.cedula,
        fecha: diaTexto(a.fecha),
        tipo: a.tipo === 'DESCUENTO' ? 'Descuento' : 'Extra',
        monto: a.tipo === 'DESCUENTO' ? -a.monto : a.monto, // con signo: el descuento resta
        motivo: a.concepto,
        viaje: a.numeroGuia ?? '',
      });
    }
  }
  ajustes.getColumn('monto').numFmt = '#,##0.00';

  return Buffer.from(await wb.xlsx.writeBuffer());
}
