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

const TARIFAS: Record<string, number> = { HACIENDA: 20, PUERTO: 10, VIP: 23 };

function formatFechaEC(date: Date | string): string {
  if (!date) return '—';
  const d = new Date(date);
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const anio = d.getUTCFullYear();
  return `${dia}/${mes}/${anio}`;
}

function formatFechaHoraEC(date: Date | string): string {
  if (!date) return '—';
  const d = new Date(date);
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const anio = d.getUTCFullYear();
  const hora = String(d.getUTCHours()).padStart(2, '0');
  const minuto = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${anio} ${hora}:${minuto}`;
}

function encabezado(doc: any, titulo: string, periodo?: { fecha_inicio: string; fecha_fin: string }) {
  doc.fillColor(NAVY).fontSize(18).font('Helvetica-Bold').text('GEMESEG', { align: 'center' });
  doc.fillColor('#4a5568').fontSize(10).font('Helvetica').text(titulo, { align: 'center' });
  doc.moveDown(0.3);
  doc.strokeColor(GOLD).lineWidth(2).moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
  doc.moveDown(0.5);
  if (periodo) {
    doc.fillColor('#2d3748').fontSize(9).font('Helvetica')
      .text(`Período: ${formatFechaEC(periodo.fecha_inicio)} — ${formatFechaEC(periodo.fecha_fin)}`)
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

function dibujarEncabezadoMatriz(doc: any, matriz: any, startX: number, pageWidth: number, y: number) {
  const { fechaW, guiaW, workerW } = calcularAnchosMatriz(pageWidth, matriz.columnas_trabajadores.length);
  const headerH = 16;

  doc.rect(startX, y, pageWidth, headerH).fill(NAVY);
  doc.fillColor('#ffffff').fontSize(6).font('Helvetica-Bold');

  let x = startX + 3;
  doc.text('FECHA', x, y + 4, { width: fechaW - 4 });
  x += fechaW;
  doc.text('GUÍA', x, y + 4, { width: guiaW - 4 });
  x += guiaW;

  for (const nombre of matriz.columnas_trabajadores) {
    doc.text(nombre, x + 1, y + 4, { width: workerW - 2, align: 'center', lineBreak: false });
    x += workerW;
  }

  return { y: y + headerH, fechaW, guiaW, workerW };
}

function dibujarCeldaConColor(doc: any, x: number, y: number, w: number, h: number, celda: any) {
  const esChofer = celda.rol === 'Chofer';
  const bg = esChofer ? CHOFER_BG : CUSTODIO_BG;
  const border = esChofer ? CHOFER_BORDER : CUSTODIO_BORDER;

  doc.rect(x, y, w, h).fill(bg);
  doc.rect(x, y, w, h).strokeColor(border).lineWidth(0.5).stroke();
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(4.5)
    .text(celda.label, x + 2, y + 2, { width: w - 4, align: 'center', lineGap: 0 });
  doc.font('Helvetica');
}

function dibujarMatrizPdf(doc: any, matriz: any, startX: number, pageWidth: number) {
  let { y, fechaW, guiaW, workerW } = dibujarEncabezadoMatriz(doc, matriz, startX, pageWidth, doc.y + 4);
  const rowH = 18;

  for (const fila of matriz.filas) {
    if (y > doc.page.height - 55) {
      doc.addPage();
      ({ y, fechaW, guiaW, workerW } = dibujarEncabezadoMatriz(doc, matriz, startX, pageWidth, 40));
    }

    doc.rect(startX, y, pageWidth, rowH).fill('#ffffff');
    doc.moveTo(startX, y + rowH).lineTo(startX + pageWidth, y + rowH).strokeColor(ROW_DIVIDER).lineWidth(0.5).stroke();

    let x = startX + 3;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(6)
      .text(fila.fecha, x, y + 5, { width: fechaW - 4 });
    x += fechaW;

    doc.fillColor('#475569').font('Helvetica').fontSize(5.5)
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
    doc.text(total > 0 ? `$${total.toFixed(0)}` : '—', x, y + 4, { width: workerW, align: 'center' });
    x += workerW;
  }
  y += totalH + 10;

  doc.fillColor('#64748b').fontSize(6).font('Helvetica');
  doc.rect(startX, y, 10, 6).fill(CHOFER_BG).strokeColor(CHOFER_BORDER).lineWidth(0.5).stroke();
  doc.text('Chofer', startX + 14, y);
  doc.rect(startX + 50, y, 10, 6).fill(CUSTODIO_BG).strokeColor(CUSTODIO_BORDER).lineWidth(0.5).stroke();
  doc.text('Custodio 1 / 2', startX + 64, y);
  doc.fillColor(NAVY).font('Helvetica-Bold')
    .text(`Total período: $${(matriz.gran_total || 0).toFixed(0)} USD`, startX, y, {
      width: pageWidth,
      align: 'right',
    });
}

function bloqueFirmas(doc: any) {
  doc.moveDown(2);
  doc.strokeColor(NAVY).lineWidth(1).moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
  doc.moveDown(0.8);
  doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text('Firmas de Conformidad', { align: 'center' });
  doc.moveDown(1);

  const firmas = ['Cliente', 'Chofer', 'Custodio 1', 'Custodio 2'];
  const colW = (doc.page.width - 80) / 2;
  let x = 40;
  let y = doc.y;

  firmas.forEach((label, i) => {
    if (i === 2) { y += 70; x = 40; }
    doc.fillColor('#2d3748').fontSize(8).font('Helvetica')
      .text(label, x, y, { width: colW - 20, align: 'center' });
    doc.moveTo(x + 10, y + 40).lineTo(x + colW - 30, y + 40).strokeColor('#94a3b8').stroke();
    doc.fontSize(7).fillColor('#718096').text('Nombre y Firma', x, y + 44, { width: colW - 20, align: 'center' });
    x += colW;
  });
}

@Injectable()
export class PdfService {
  async generarPdfOrdenCustodia(custodia: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new (PDFDocument as any)({ margin: 40, size: 'LETTER' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fillColor(NAVY).fontSize(18).font('Helvetica-Bold').text('GEMESEG', { align: 'center' });
      doc.fillColor('#4a5568').fontSize(11).font('Helvetica').text('Orden de Custodia', { align: 'center' });
      doc.moveDown(0.3);
      doc.strokeColor(GOLD).lineWidth(2).moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
      doc.moveDown(0.8);

      const tarifa = TARIFAS[custodia.tipoCustodia] || 0;
      const campos = [
        ['Número de Guía', custodia.numeroGuia],
        ['Tipo de Custodia', custodia.tipoCustodia],
        ['Estado', ESTADO_LABELS[custodia.estado] || custodia.estado],
        ['Tarifa por persona', `$${tarifa} USD`],
        ['Cliente', custodia.cliente],
        ['Placa GEMESEG', custodia.placa],
        ['Dirección de Salida', custodia.direccionSalida],
        ['Dirección de Llegada', custodia.direccionLlegada],
        ['Fecha/Hora Salida', custodia.fechaHoraSalida ? formatFechaHoraEC(custodia.fechaHoraSalida) : '—'],
        ['Fecha/Hora Llegada', custodia.fechaHoraLlegada ? formatFechaHoraEC(custodia.fechaHoraLlegada) : '—'],
        ['Chofer', `${custodia.choferName} (${custodia.choferCedula || '—'})`],
        ['Custodio 1', `${custodia.custodio1Name} (${custodia.custodio1Cedula || '—'})`],
        ['Custodio 2', `${custodia.custodio2Name} (${custodia.custodio2Cedula || '—'})`],
      ];

      doc.fillColor('#2d3748').fontSize(9).font('Helvetica');
      for (const [label, valor] of campos) {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(String(valor || '—'));
      }

      if (custodia.observaciones) {
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').text('Observaciones: ', { continued: true });
        doc.font('Helvetica').text(custodia.observaciones);
      }

      doc.fontSize(8).fillColor('#718096')
        .text(`Registrado: ${formatFechaHoraEC(custodia.createdAt)}`, { align: 'right' });

      bloqueFirmas(doc);
      doc.end();
    });
  }

  async generarPdfNomina(nominaData: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new (PDFDocument as any)({ margin: 30, size: 'LEGAL', layout: 'landscape' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const startX = 30;
      const pageWidth = doc.page.width - 60;
      encabezado(doc, 'Liquidación de Nómina — Matriz por Fecha', nominaData.periodo);
      doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text('Matriz de Nómina');
      doc.moveDown(0.3);

      if (nominaData.matriz?.filas?.length) {
        dibujarMatrizPdf(doc, nominaData.matriz, startX, pageWidth);
      } else {
        doc.fontSize(9).fillColor('#718096').text('Sin custodias liquidables en el período.');
      }

      doc.end();
    });
  }

  async generarPdfIndividual(nominaData: any, cedula: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const emp = nominaData.empleados_detalle?.find((e: any) => e.cedula === cedula);
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
      doc.fillColor(NAVY).fontSize(12).font('Helvetica-Bold').text('Liquidación Individual');
      doc.moveDown(0.5);

      doc.fillColor('#2d3748').fontSize(9).font('Helvetica')
        .text(`Trabajador: ${emp.nombre}`)
        .text(`Cédula: ${emp.cedula || '—'}`)
        .text(`Viajes: ${emp.total_viajes}`)
        .text(`HACIENDA: ${emp.por_tipo?.HACIENDA || 0} ($${(emp.subtotales?.HACIENDA || 0).toFixed(2)})`)
        .text(`PUERTO: ${emp.por_tipo?.PUERTO || 0} ($${(emp.subtotales?.PUERTO || 0).toFixed(2)})`)
        .text(`VIP: ${emp.por_tipo?.VIP || 0} ($${(emp.subtotales?.VIP || 0).toFixed(2)})`);

      doc.moveDown(0.5);
      doc.fillColor(GOLD).fontSize(14).font('Helvetica-Bold')
        .text(`TOTAL NETO A PAGAR: $${emp.total_usd.toFixed(2)} USD`);

      doc.moveDown(0.8);
      doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text('Detalle de Viajes');
      doc.moveDown(0.3);

      for (const v of emp.detalle || []) {
        if (doc.y > doc.page.height - 60) doc.addPage();
        doc.fontSize(7).fillColor('#2d3748').font('Helvetica')
          .text(`${formatFechaHoraEC(v.fecha_hora_salida)} | ${v.numero_guia} | ${v.rol} | $${v.monto}`)
          .text(`Cliente: ${v.cliente} | Placa: ${v.placa}`)
          .text(`${v.direccion_salida} → ${v.direccion_llegada}`)
          .moveDown(0.25);
      }

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
