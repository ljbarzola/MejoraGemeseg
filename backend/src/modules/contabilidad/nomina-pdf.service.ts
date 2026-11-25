import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

const NAVY = '#1e3a5f';
const GOLD = '#d4a017';
const CHOFER_BG = '#fffbeb';
const CHOFER_BORDER = '#fde68a';
const CUSTODIO_BG = '#f1f5f9';
const CUSTODIO_BORDER = '#cbd5e1';
const TOTAL_ROW_BG = '#fef9e7';
const ROW_DIVIDER = '#f1f5f9';


const ESTADO_LABELS: Record<string, string> = {
  LISTO_PARA_CUSTODIAR: 'LISTO PARA CUSTODIAR',
  EN_CAMINO: 'EN CAMINO',
  LLEGO: 'LLEGÓ',
};

function formatFechaEC(date: Date | string): string {
  if (!date) return '—';
  const d = new Date(date);
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const anio = d.getUTCFullYear();
  return `${dia}/${mes}/${anio}`;
}

// Las horas se guardan como instante (UTC) y se imprimen en hora de Ecuador (UTC-5).
function formatFechaHoraEC(date: Date | string): string {
  if (!date) return '—';
  const d = new Date(new Date(date).getTime() - 5 * 3600 * 1000);
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const anio = d.getUTCFullYear();
  const hora = String(d.getUTCHours()).padStart(2, '0');
  const minuto = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${anio} ${hora}:${minuto}`;
}

function encabezado(
  doc: any,
  titulo: string,
  periodo?: { fecha_inicio: string; fecha_fin: string },
) {
  doc
    .fillColor(NAVY)
    .fontSize(18)
    .font('Helvetica-Bold')
    .text('GEMESEG', { align: 'center' });
  doc
    .fillColor('#4a5568')
    .fontSize(10)
    .font('Helvetica')
    .text(titulo, { align: 'center' });
  doc.moveDown(0.3);
  doc
    .strokeColor(GOLD)
    .lineWidth(2)
    .moveTo(40, doc.y)
    .lineTo(doc.page.width - 40, doc.y)
    .stroke();
  doc.moveDown(0.5);
  if (periodo) {
    doc
      .fillColor('#2d3748')
      .fontSize(9)
      .font('Helvetica')
      .text(
        `Período: ${formatFechaEC(periodo.fecha_inicio)} — ${formatFechaEC(periodo.fecha_fin)}`,
      )
      .text(`Generado: ${formatFechaHoraEC(new Date().toISOString())}`)
      .text(`Criterio: Solo custodias en estado "${ESTADO_LABELS.LLEGO}"`);
    doc.moveDown(0.6);
  }
}

function calcularAnchosMatriz(pageWidth: number, numTrabajadores: number) {
  const fechaW = 58;
  const guiaW = 52;
  const restante = pageWidth - fechaW - guiaW;
  const workerW = numTrabajadores > 0 ? restante / numTrabajadores : restante;
  return { fechaW, guiaW, workerW };
}

function dibujarEncabezadoMatriz(
  doc: any,
  matriz: any,
  startX: number,
  pageWidth: number,
  y: number,
) {
  const { fechaW, guiaW, workerW } = calcularAnchosMatriz(
    pageWidth,
    matriz.columnas_trabajadores.length,
  );
  const headerH = 16;

  doc.rect(startX, y, pageWidth, headerH).fill(NAVY);
  doc.fillColor('#ffffff').fontSize(6).font('Helvetica-Bold');

  let x = startX + 3;
  doc.text('FECHA', x, y + 4, { width: fechaW - 4 });
  x += fechaW;
  doc.text('GUÍA', x, y + 4, { width: guiaW - 4 });
  x += guiaW;

  for (const nombre of matriz.columnas_trabajadores) {
    doc.text(nombre, x + 1, y + 4, {
      width: workerW - 2,
      align: 'center',
      lineBreak: false,
    });
    x += workerW;
  }

  return { y: y + headerH, fechaW, guiaW, workerW };
}

function dibujarCeldaConColor(
  doc: any,
  x: number,
  y: number,
  w: number,
  h: number,
  celda: any,
) {
  const esChofer = celda.rol === 'Chofer';
  const bg = esChofer ? CHOFER_BG : CUSTODIO_BG;
  const border = esChofer ? CHOFER_BORDER : CUSTODIO_BORDER;

  doc.rect(x, y, w, h).fill(bg);
  doc.rect(x, y, w, h).strokeColor(border).lineWidth(0.5).stroke();
  doc
    .fillColor(NAVY)
    .font('Helvetica-Bold')
    .fontSize(4.5)
    .text(celda.label, x + 2, y + 2, {
      width: w - 4,
      align: 'center',
      lineGap: 0,
    });
  doc.font('Helvetica');
}

function dibujarMatrizPdf(
  doc: any,
  matriz: any,
  startX: number,
  pageWidth: number,
) {
  let { y, fechaW, guiaW, workerW } = dibujarEncabezadoMatriz(
    doc,
    matriz,
    startX,
    pageWidth,
    doc.y + 4,
  );
  const rowH = 18;

  for (const fila of matriz.filas) {
    if (y > doc.page.height - 55) {
      doc.addPage();
      ({ y, fechaW, guiaW, workerW } = dibujarEncabezadoMatriz(
        doc,
        matriz,
        startX,
        pageWidth,
        40,
      ));
    }

    doc.rect(startX, y, pageWidth, rowH).fill('#ffffff');
    doc
      .moveTo(startX, y + rowH)
      .lineTo(startX + pageWidth, y + rowH)
      .strokeColor(ROW_DIVIDER)
      .lineWidth(0.5)
      .stroke();

    let x = startX + 3;
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(6)
      .text(fila.fecha, x, y + 5, { width: fechaW - 4 });
    x += fechaW;

    doc
      .fillColor('#475569')
      .font('Helvetica')
      .fontSize(5.5)
      .text(fila.numero_guia, x, y + 5, { width: guiaW - 4 });
    x += guiaW;

    for (const nombre of matriz.columnas_trabajadores) {
      const celda = fila.celdas[nombre];
      if (celda) {
        dibujarCeldaConColor(doc, x + 1, y + 2, workerW - 2, rowH - 4, celda);
      }
      x += workerW;
    }
    y += rowH;
  }

  if (y > doc.page.height - 50) {
    doc.addPage();
    y = 40;
  }

  const totalH = 16;
  doc.rect(startX, y, pageWidth, totalH).fill(TOTAL_ROW_BG);
  doc.fillColor(NAVY).fontSize(7).font('Helvetica-Bold');
  doc.text('GRAN TOTAL', startX + 3, y + 4, { width: fechaW + guiaW - 4 });

  let x = startX + fechaW + guiaW;
  for (const nombre of matriz.columnas_trabajadores) {
    const total = matriz.totales_por_trabajador[nombre] || 0;
    doc.text(total > 0 ? `$${total.toFixed(0)}` : '—', x, y + 4, {
      width: workerW,
      align: 'center',
    });
    x += workerW;
  }
  y += totalH + 10;

  doc.fillColor('#64748b').fontSize(6).font('Helvetica');
  doc
    .rect(startX, y, 10, 6)
    .fill(CHOFER_BG)
    .strokeColor(CHOFER_BORDER)
    .lineWidth(0.5)
    .stroke();
  doc.text('Chofer', startX + 14, y);
  doc
    .rect(startX + 50, y, 10, 6)
    .fill(CUSTODIO_BG)
    .strokeColor(CUSTODIO_BORDER)
    .lineWidth(0.5)
    .stroke();
  doc.text('Custodios', startX + 64, y);
  doc
    .fillColor(NAVY)
    .font('Helvetica-Bold')
    .text(
      matriz.ajustes_usd
        ? `Total viajes: $${(matriz.gran_total || 0).toFixed(0)} USD  ·  Ajustes: $${matriz.ajustes_usd.toFixed(2)}  ·  Neto: $${((matriz.gran_total || 0) + matriz.ajustes_usd).toFixed(2)} USD`
        : `Total período: $${(matriz.gran_total || 0).toFixed(0)} USD`,
      startX,
      y,
      {
        width: pageWidth,
        align: 'right',
      },
    );
}


interface ColumnaTabla {
  titulo: string;
  ancho: number;
  align?: 'left' | 'right' | 'center';
}

const usd = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;
const usdFirmado = (n: unknown) => `${Number(n ?? 0) < 0 ? '-' : ''}$${Math.abs(Number(n ?? 0)).toFixed(2)}`;

/**
 * Tabla simple con el encabezado repetido en cada página y una fila de total al final. La usan «Matriz de todo el
 * personal» (una fila por persona) y «Detalle de viajes» (una fila por persona y viaje); sus columnas son las mismas
 * que la primera hoja del Excel del mismo contenido.
 */
function dibujarTabla(
  doc: any,
  columnas: ColumnaTabla[],
  filas: string[][],
  totales: string[],
  startX: number,
) {
  const anchoTotal = columnas.reduce((s, c) => s + c.ancho, 0);
  const rowH = 15;
  const cabecera = (y: number) => {
    doc.rect(startX, y, anchoTotal, 18).fill(NAVY);
    doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold');
    let x = startX;
    for (const c of columnas) {
      doc.text(c.titulo, x + 3, y + 5, { width: c.ancho - 6, align: c.align ?? 'left', lineBreak: false });
      x += c.ancho;
    }
    return y + 18;
  };
  const fila = (valores: string[], y: number, fondo: string, negrita: boolean) => {
    doc.rect(startX, y, anchoTotal, rowH).fill(fondo);
    doc.fillColor(NAVY).fontSize(7).font(negrita ? 'Helvetica-Bold' : 'Helvetica');
    let x = startX;
    columnas.forEach((c, i) => {
      doc.text(valores[i] ?? '', x + 3, y + 4, { width: c.ancho - 6, align: c.align ?? 'left', lineBreak: false, ellipsis: true });
      x += c.ancho;
    });
    doc.moveTo(startX, y + rowH).lineTo(startX + anchoTotal, y + rowH).strokeColor(ROW_DIVIDER).lineWidth(0.5).stroke();
    return y + rowH;
  };

  let y = cabecera(doc.y + 4);
  filas.forEach((f, i) => {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = cabecera(40);
    }
    y = fila(f, y, i % 2 ? '#f8fafc' : '#ffffff', false);
  });
  if (y > doc.page.height - 60) {
    doc.addPage();
    y = 40;
  }
  y = fila(totales, y, TOTAL_ROW_BG, true);
  doc.x = startX;
  doc.y = y + 10;
}

@Injectable()
export class NominaPdfService {
  private nuevoDoc(opts: any): { doc: any; listo: Promise<Buffer> } {
    const doc = new (PDFDocument as any)(opts);
    const chunks: Buffer[] = [];
    const listo = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    return { doc, listo };
  }

  /** Matriz de todo el personal: una fila por persona (viajes, por tipo, subtotal, ajustes y neto). */
  async generarPdfResumen(nominaData: any): Promise<Buffer> {
    const empleados: any[] = nominaData.empleados_detalle ?? [];
    if (!empleados.length) throw new Error('No hay datos para exportar en el período.');
    const { doc, listo } = this.nuevoDoc({ margin: 30, size: 'LETTER', layout: 'landscape' });
    encabezado(doc, 'Liquidación de Nómina — Matriz de todo el personal', nominaData.periodo);
    const columnas: ColumnaTabla[] = [
      { titulo: 'PERSONA', ancho: 170 },
      { titulo: 'CÉDULA', ancho: 70 },
      { titulo: 'VIAJES', ancho: 45, align: 'right' },
      { titulo: 'HACIENDA', ancho: 65, align: 'right' },
      { titulo: 'PUERTO', ancho: 60, align: 'right' },
      { titulo: 'VIP', ancho: 50, align: 'right' },
      { titulo: 'SUBTOTAL', ancho: 70, align: 'right' },
      { titulo: 'AJUSTES', ancho: 65, align: 'right' },
      { titulo: 'TOTAL NETO', ancho: 75, align: 'right' },
    ];
    const suma = (f: (e: any) => number) => empleados.reduce((s, e) => s + (f(e) || 0), 0);
    dibujarTabla(
      doc,
      columnas,
      empleados.map((e) => [
        e.nombre, e.cedula || '—', String(e.total_viajes ?? 0),
        usd(e.subtotales?.HACIENDA), usd(e.subtotales?.PUERTO), usd(e.subtotales?.VIP),
        usd(e.subtotal_viajes_usd ?? e.total_usd), usdFirmado(e.ajustes_usd), usd(e.total_usd),
      ]),
      [
        'TOTAL', '', String(suma((e) => e.total_viajes)),
        usd(suma((e) => e.subtotales?.HACIENDA)), usd(suma((e) => e.subtotales?.PUERTO)), usd(suma((e) => e.subtotales?.VIP)),
        usd(suma((e) => e.subtotal_viajes_usd)), usdFirmado(suma((e) => e.ajustes_usd)), usd(suma((e) => e.total_usd)),
      ],
      30,
    );
    doc.end();
    return listo;
  }

  /** Detalle de viajes: una fila por persona y viaje. */
  async generarPdfDetalle(nominaData: any): Promise<Buffer> {
    const empleados: any[] = nominaData.empleados_detalle ?? [];
    const filas: string[][] = [];
    let total = 0;
    for (const e of empleados) {
      for (const v of e.detalle ?? []) {
        total += v.monto ?? 0;
        filas.push([
          e.nombre, e.cedula || '—', formatFechaHoraEC(v.fecha_hora_salida ?? v.fecha_registro).slice(0, 10),
          v.numero_guia, v.rol, v.tipo_custodia, v.cliente || '—', v.placa || '—', usd(v.monto),
        ]);
      }
    }
    if (!filas.length) throw new Error('No hay datos para exportar en el período.');
    const { doc, listo } = this.nuevoDoc({ margin: 30, size: 'LEGAL', layout: 'landscape' });
    encabezado(doc, 'Liquidación de Nómina — Detalle de viajes', nominaData.periodo);
    const columnas: ColumnaTabla[] = [
      { titulo: 'PERSONA', ancho: 150 },
      { titulo: 'CÉDULA', ancho: 70 },
      { titulo: 'FECHA', ancho: 60 },
      { titulo: 'GUÍA', ancho: 75 },
      { titulo: 'ROL', ancho: 65 },
      { titulo: 'TIPO', ancho: 60 },
      { titulo: 'CLIENTE', ancho: 190 },
      { titulo: 'PLACA', ancho: 65 },
      { titulo: 'MONTO', ancho: 65, align: 'right' },
    ];
    dibujarTabla(doc, columnas, filas, ['TOTAL', '', '', '', '', '', '', '', usd(total)], 30);
    doc.end();
    return listo;
  }

  async generarPdfNomina(nominaData: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new (PDFDocument as any)({
        margin: 30,
        size: 'LEGAL',
        layout: 'landscape',
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const startX = 30;
      const pageWidth = doc.page.width - 60;
      encabezado(
        doc,
        'Liquidación de Nómina — Matriz por Fecha',
        nominaData.periodo,
      );
      doc
        .fillColor(NAVY)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Matriz de Nómina');
      doc.moveDown(0.3);

      if (nominaData.matriz?.filas?.length) {
        dibujarMatrizPdf(doc, nominaData.matriz, startX, pageWidth);
      } else {
        doc
          .fontSize(9)
          .fillColor('#718096')
          .text('Sin custodias liquidables en el período.');
      }

      doc.end();
    });
  }

  async generarPdfIndividual(nominaData: any, cedula: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const emp = nominaData.empleados_detalle?.find(
        (e: any) => e.cedula === cedula,
      );
      if (!emp) {
        reject(new Error('Empleado no encontrado en la nómina del período.'));
        return;
      }

      const doc = new (PDFDocument as any)({ margin: 40, size: 'LETTER' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      encabezado(doc, 'Rol de Pago / Liquidación Personal', nominaData.periodo);
      doc
        .fillColor(NAVY)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Liquidación Individual');
      doc.moveDown(0.5);

      doc
        .fillColor('#2d3748')
        .fontSize(9)
        .font('Helvetica')
        .text(`Trabajador: ${emp.nombre}`)
        .text(`Cédula: ${emp.cedula || '—'}`)
        .text(`Viajes: ${emp.total_viajes}`)
        .text(
          `HACIENDA: ${emp.por_tipo?.HACIENDA || 0} ($${(emp.subtotales?.HACIENDA || 0).toFixed(2)})`,
        )
        .text(
          `PUERTO: ${emp.por_tipo?.PUERTO || 0} ($${(emp.subtotales?.PUERTO || 0).toFixed(2)})`,
        )
        .text(
          `VIP: ${emp.por_tipo?.VIP || 0} ($${(emp.subtotales?.VIP || 0).toFixed(2)})`,
        );

      // Mismas columnas y orden que la hoja «Rol de pago» del Excel: viajes, subtotal, extras y descuentos, total neto.
      doc.moveDown(0.6);
      doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text('Detalle de Viajes');
      const subtotal = Number(emp.subtotal_viajes_usd ?? emp.total_usd);
      dibujarTabla(
        doc,
        [
          { titulo: 'FECHA', ancho: 62 },
          { titulo: 'GUÍA', ancho: 70 },
          { titulo: 'ROL', ancho: 64 },
          { titulo: 'TIPO', ancho: 58 },
          { titulo: 'CLIENTE', ancho: 138 },
          { titulo: 'PLACA', ancho: 62 },
          { titulo: 'MONTO', ancho: 58, align: 'right' },
        ],
        (emp.detalle || []).map((v: any) => [
          formatFechaHoraEC(v.fecha_hora_salida ?? v.fecha_registro).slice(0, 10),
          v.numero_guia, v.rol, v.tipo_custodia, v.cliente || '—', v.placa || '—', usd(v.monto),
        ]),
        ['', '', '', '', 'Subtotal de viajes', '', usd(subtotal)],
        40,
      );

      // Extras y descuentos de la liquidación (no son tarifa): uno por uno, y se suman al total.
      const ajustes: any[] = emp.ajustes || [];
      if (ajustes.length) {
        doc.fillColor('#2d3748').fontSize(9).font('Helvetica-Bold').text('Extras y descuentos', 40);
        doc.font('Helvetica');
        for (const a of ajustes) {
          const signo = a.tipo === 'DESCUENTO' ? '-' : '+';
          const guia = a.numeroGuia ? ` (guía ${a.numeroGuia})` : '';
          doc.text(
            `${signo} $${Number(a.monto).toFixed(2)}  ${a.tipo === 'DESCUENTO' ? 'Descuento' : 'Extra'} · ${formatFechaEC(a.fecha)} · ${a.concepto}${guia}`,
            40,
          );
        }
        doc
          .font('Helvetica-Bold')
          .text(`Ajustes (extras menos descuentos): ${usdFirmado(emp.ajustes_usd)}`, 40);
      }

      doc.moveDown(0.5);
      doc
        .fillColor(GOLD)
        .fontSize(14)
        .font('Helvetica-Bold')
        .text(`TOTAL NETO A PAGAR: $${emp.total_usd.toFixed(2)} USD`, 40);

      doc.end();
    });
  }

  async generarPdfTodosTrabajadores(nominaData: any): Promise<Buffer> {
    if (!nominaData.matriz?.filas?.length) {
      throw new Error('No hay datos de matriz para exportar en el período.');
    }
    return this.generarPdfNomina(nominaData);
  }
}
