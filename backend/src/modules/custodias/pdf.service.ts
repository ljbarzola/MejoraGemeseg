import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

const NAVY = '#100f31';
const ORANGE = '#ee3d1d';
const TEXTO = '#1f2937';
const GRIS = '#6b7280';
const LINEA = '#e5e7eb';
const FONDO = '#f3f4f6';

const ESTADO_LABELS: Record<string, string> = {
  LISTO_PARA_CUSTODIAR: 'LISTO PARA CUSTODIAR',
  EN_CAMINO: 'EN CAMINO',
  LLEGO: 'LLEGÓ',
};
const ESTADO_COLORES: Record<string, string> = {
  LISTO_PARA_CUSTODIAR: '#b7791f',
  EN_CAMINO: '#2b6cb0',
  LLEGO: '#2f855a',
};
const TIPO_LABELS: Record<string, string> = { HACIENDA: 'Hacienda', PUERTO: 'Puerto', VIP: 'VIP' };

// Logo de Gemeseg (versión para fondo blanco). Va dentro del código (src/assets, que Nest copia a dist al
// compilar) porque el servidor no tiene la carpeta del frontend.
const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'logo-gemeseg.png');
function leerLogo(): Buffer | null {
  try {
    return fs.readFileSync(LOGO_PATH);
  } catch {
    return null; // sin logo la orden se arma igual, solo con el texto
  }
}

// Las fechas se guardan como instante (UTC); en la orden se imprimen en hora de Ecuador (UTC-5).
// Antes se imprimía la hora UTC y salía 5 horas adelantada.
function formatFechaHoraEC(date?: Date | string | null): string {
  if (!date) return '—';
  const d = new Date(new Date(date).getTime() - 5 * 3600 * 1000);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}

const M = 40; // margen

/** Título de sección: franja gris con el nombre; devuelve la y donde empieza el contenido. */
function seccion(doc: any, titulo: string, y: number): number {
  const w = doc.page.width - 2 * M;
  doc.rect(M, y, w, 18).fill(FONDO);
  doc.rect(M, y, 3, 18).fill(ORANGE);
  doc
    .fillColor(NAVY)
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .text(titulo.toUpperCase(), M + 10, y + 5, { width: w - 16 });
  return y + 18 + 8;
}

/** Un dato (etiqueta chica + valor); devuelve la altura que ocupó. */
function dato(doc: any, etiqueta: string, valor: string, x: number, y: number, w: number): number {
  doc.fillColor(GRIS).font('Helvetica').fontSize(7).text(etiqueta.toUpperCase(), x, y, { width: w });
  doc.fillColor(TEXTO).font('Helvetica-Bold').fontSize(10);
  const texto = valor && valor.trim() ? valor : '—';
  doc.text(texto, x, y + 10, { width: w });
  return 10 + doc.heightOfString(texto, { width: w }) + 8;
}

/** Fila de datos en columnas iguales; devuelve la y siguiente. */
function fila(doc: any, datos: [string, string][], y: number): number {
  const w = doc.page.width - 2 * M;
  const gap = 14;
  const colW = (w - gap * (datos.length - 1)) / datos.length;
  let alto = 0;
  datos.forEach(([e, v], i) => {
    alto = Math.max(alto, dato(doc, e, v, M + i * (colW + gap), y, colW));
  });
  return y + alto;
}

function bloqueFirmas(doc: any, y: number) {
  const w = doc.page.width - 2 * M;
  const firmas = ['Cliente', 'Chofer', 'Custodio 1', 'Custodio 2'];
  const colW = w / firmas.length;
  firmas.forEach((label, i) => {
    const x = M + i * colW;
    doc
      .moveTo(x + 12, y + 44)
      .lineTo(x + colW - 12, y + 44)
      .lineWidth(0.8)
      .strokeColor('#9ca3af')
      .stroke();
    doc.fillColor(TEXTO).font('Helvetica-Bold').fontSize(8).text(label, x, y + 49, { width: colW, align: 'center' });
    doc.fillColor(GRIS).font('Helvetica').fontSize(7).text('Nombre y firma', x, y + 60, { width: colW, align: 'center' });
  });
}

@Injectable()
export class PdfService {
  async generarPdfOrdenCustodia(custodia: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new (PDFDocument as any)({
        margin: M,
        size: 'LETTER',
        info: { Title: `Orden de custodia ${custodia.numeroGuia}` },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ancho = doc.page.width - 2 * M;

      // ── Encabezado: logo a la izquierda; título, guía y estado a la derecha ──
      const logo = leerLogo();
      if (logo) {
        doc.image(logo, M, 36, { width: 150 });
      } else {
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(20).text('GEMESEG', M, 40);
      }
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(17).text('ORDEN DE CUSTODIA', M, 36, { width: ancho, align: 'right' });
      doc.fillColor(GRIS).font('Helvetica').fontSize(8).text('N.º DE GUÍA', M, 60, { width: ancho, align: 'right' });
      doc.fillColor(TEXTO).font('Helvetica-Bold').fontSize(13).text(String(custodia.numeroGuia || '—'), M, 69, { width: ancho, align: 'right' });

      const estado = ESTADO_LABELS[custodia.estado] || custodia.estado;
      const color = ESTADO_COLORES[custodia.estado] || GRIS;
      doc.font('Helvetica-Bold').fontSize(8);
      const pillW = doc.widthOfString(estado) + 18;
      const pillX = M + ancho - pillW;
      doc.roundedRect(pillX, 88, pillW, 16, 8).fill(color);
      doc.fillColor('#ffffff').text(estado, pillX, 93, { width: pillW, align: 'center', lineBreak: false });

      doc.moveTo(M, 112).lineTo(M + ancho, 112).lineWidth(2).strokeColor(ORANGE).stroke();

      // ── Servicio ──
      let y = seccion(doc, 'Servicio', 124);
      y = fila(
        doc,
        [
          ['Tipo de custodia', TIPO_LABELS[custodia.tipoCustodia] || custodia.tipoCustodia],
          ['Cliente', custodia.cliente],
          ['Placa GEMESEG', custodia.placa],
        ],
        y,
      );
      if (custodia.tipoCustodia === 'HACIENDA' && (custodia.nombreHacienda || custodia.cantidadSacos)) {
        y = fila(
          doc,
          [
            ['Hacienda', custodia.nombreHacienda],
            ['Cantidad de sacos', custodia.cantidadSacos ? String(custodia.cantidadSacos) : ''],
          ],
          y,
        );
      }

      // ── Ruta y horarios ──
      y = seccion(doc, 'Ruta y horarios', y + 4);
      y = fila(
        doc,
        [
          ['Dirección de salida', custodia.direccionSalida],
          ['Dirección de llegada', custodia.direccionLlegada],
        ],
        y,
      );
      y = fila(
        doc,
        [
          ['Fecha y hora de salida', formatFechaHoraEC(custodia.fechaHoraSalida)],
          ['Fecha y hora de llegada', formatFechaHoraEC(custodia.fechaHoraLlegada)],
        ],
        y,
      );

      // ── Personal ──
      y = seccion(doc, 'Personal asignado', y + 4);
      const personal: [string, string, string][] = [
        ['Chofer', custodia.choferName, custodia.choferCedula],
        ['Custodio 1', custodia.custodio1Name, custodia.custodio1Cedula],
        ['Custodio 2', custodia.custodio2Name, custodia.custodio2Cedula],
      ];
      const cols = [90, ancho - 90 - 130, 130];
      doc.fillColor(GRIS).font('Helvetica').fontSize(7);
      doc.text('ROL', M, y, { width: cols[0] });
      doc.text('NOMBRE', M + cols[0], y, { width: cols[1] });
      doc.text('CÉDULA', M + cols[0] + cols[1], y, { width: cols[2] });
      y += 12;
      for (const [rol, nombre, cedula] of personal) {
        doc.moveTo(M, y - 2).lineTo(M + ancho, y - 2).lineWidth(0.5).strokeColor(LINEA).stroke();
        doc.fillColor(GRIS).font('Helvetica-Bold').fontSize(9).text(rol, M, y + 2, { width: cols[0] });
        doc.fillColor(TEXTO).font('Helvetica-Bold').fontSize(10).text(nombre || '—', M + cols[0], y + 1, { width: cols[1] - 8 });
        doc.fillColor(TEXTO).font('Helvetica').fontSize(10).text(cedula || '—', M + cols[0] + cols[1], y + 1, { width: cols[2] });
        y += 19;
      }
      y += 4;

      // ── Contenedores (solo puerto) ──
      const contenedores: string[] = Array.isArray(custodia.contenedores) ? custodia.contenedores : [];
      if (custodia.tipoCustodia === 'PUERTO' && contenedores.length) {
        y = seccion(doc, 'Contenedores', y);
        doc.fillColor(TEXTO).font('Helvetica').fontSize(9.5);
        for (const c of contenedores) {
          doc.text(`•  ${c}`, M + 4, y, { width: ancho - 8 });
          y = doc.y + 3;
        }
        y += 6;
      }

      // ── Observaciones ──
      if (custodia.observaciones) {
        y = seccion(doc, 'Observaciones', y);
        doc.fillColor(TEXTO).font('Helvetica').fontSize(9.5).text(custodia.observaciones, M + 4, y, { width: ancho - 8 });
        y = doc.y + 10;
      }

      // ── Firmas (si no caben en la hoja, pasan a la siguiente) ──
      const altoFirmas = 100;
      if (y + altoFirmas > doc.page.height - 70) {
        doc.addPage();
        y = M;
      }
      y = seccion(doc, 'Firmas de conformidad', y + 4);
      bloqueFirmas(doc, y);

      // ── Pie ──
      doc.fillColor(GRIS).font('Helvetica').fontSize(7.5);
      doc.text(
        `GEMESEG Seguridad  ·  Registrado el ${formatFechaHoraEC(custodia.createdAt)} (hora de Ecuador)`,
        M,
        doc.page.height - 50,
        { width: ancho, align: 'center', lineBreak: false },
      );

      doc.end();
    });
  }
}
