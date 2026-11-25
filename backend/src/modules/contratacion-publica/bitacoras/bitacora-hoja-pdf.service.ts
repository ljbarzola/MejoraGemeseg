import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';

// Hoja de bitácora en blanco, lista para imprimir (2026-11-25, etapa 3 del rediseño de las bitácoras).
// SIEMPRE UNA SOLA HOJA A4 (pedido de Leidy). Dos formatos:
//  - PUBLICA: trae la dotación del puesto con lo que entrega Gemeseg al lado de lo que es del cliente o la entidad,
//    porque en los contratos públicos la Contraloría la audita. Lo ya registrado sale en «Inicial» y el guardia solo
//    anota lo que HAY hoy.
//  - ESTANDAR: para privados y entidades sin formato propio; sin dotación, más espacio para anotaciones.
// El ingreso de personas y de vehículos NO lleva tablas: ese registro suele pedirlo y llevarlo el cliente, así que la
// hoja solo da un espacio general de anotaciones con la hora, como la bitácora original. Va el logo de Gemeseg y
// nada de colores de relleno (se imprime en blanco y negro sin perder nada). Si el cliente impone su plantilla,
// esta hoja no se usa.

const TINTA = '#1a202c';
const GRIS = '#4a5568';
const BORDE = '#718096';
const LINEA = '#cbd5e0';

// El logo va dentro del código (src/assets, que Nest copia a dist): ver custodias/pdf.service.ts.
const LOGO_PATH = path.join(__dirname, '..', '..', '..', 'assets', 'logo-gemeseg.png');
function leerLogo(): Buffer | null {
  try {
    return fs.readFileSync(LOGO_PATH);
  } catch {
    return null; // sin logo la hoja se arma igual, solo con el texto
  }
}

export type TipoHoja = 'PUBLICA' | 'ESTANDAR';

export interface HojaEnBlancoData {
  tipo: TipoHoja;
  entidadNombre: string;
  contratoNumero: string;
  puestoNombre: string;
  /** Dotación registrada del puesto (puede venir vacía). */
  dotacionBase: Array<{ ambito: string; articulo: string; cantidad: number | null }>;
}

const M = 30; // margen
const ALTO_PAGINA = 841.89;
const ANCHO = 595.28 - M * 2;

@Injectable()
export class BitacoraHojaPdfService {
  generar(d: HojaEnBlancoData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new (PDFDocument as any)({ margin: M, size: 'A4', autoFirstPage: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Lo de abajo (observaciones y firma del supervisor) tiene alto fijo; el movimiento del turno ocupa lo que sobra.
      const ALTO_PIE = 96;
      let y = this.encabezado(doc, d);
      y = this.datos(doc, d, y);
      y = this.cambioDeTurno(doc, y);
      if (d.tipo === 'PUBLICA') y = this.dotacion(doc, d, y);
      this.movimiento(doc, y, ALTO_PAGINA - M - ALTO_PIE);
      this.pie(doc, ALTO_PAGINA - M - ALTO_PIE + 8);
      doc.end();
    });
  }

  // ------------------------------------------------------------------ piezas

  private encabezado(doc: any, d: HojaEnBlancoData): number {
    const logo = leerLogo();
    if (logo) {
      try {
        doc.image(logo, M, M, { width: 130 });
      } catch {
        doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(14).text('GEMESEG', M, M + 4, { lineBreak: false });
      }
    } else {
      doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(14).text('GEMESEG', M, M + 4, { lineBreak: false });
    }
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(14).text('BITÁCORA DE PUESTO', M, M + 2, { width: ANCHO, align: 'right', lineBreak: false });
    doc.fillColor(GRIS).font('Helvetica').fontSize(9.5).text(
      d.tipo === 'PUBLICA' ? 'Contrato público · con dotación' : 'Formato estándar',
      M,
      M + 20,
      { width: ANCHO, align: 'right', lineBreak: false },
    );
    doc.strokeColor(TINTA).lineWidth(1).moveTo(M, M + 38).lineTo(M + ANCHO, M + 38).stroke();
    return M + 46;
  }

  /** Una celda con borde; `etiqueta` arriba pequeña, `valor` debajo (vacío si es para escribir). */
  private celda(doc: any, x: number, y: number, w: number, h: number, etiqueta: string, valor = '') {
    doc.lineWidth(0.7).strokeColor(BORDE).rect(x, y, w, h).stroke();
    doc.fillColor(GRIS).font('Helvetica').fontSize(7.5).text(etiqueta.toUpperCase(), x + 4, y + 3, { width: w - 8, lineBreak: false });
    if (valor) {
      doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(11).text(valor, x + 4, y + 14, { width: w - 8, height: h - 15, ellipsis: true });
    }
  }

  private datos(doc: any, d: HojaEnBlancoData, y: number): number {
    const mitad = ANCHO / 2;
    const cuarto = mitad / 2;
    this.celda(doc, M, y, mitad, 30, 'Entidad', d.entidadNombre);
    this.celda(doc, M + mitad, y, mitad, 30, 'Contrato', d.contratoNumero);
    this.celda(doc, M, y + 30, mitad, 30, 'Puesto', d.puestoNombre);
    this.celda(doc, M + mitad, y + 30, cuarto, 30, 'Fecha');
    this.celda(doc, M + mitad + cuarto, y + 30, cuarto, 30, 'Turno');
    // Guías en la celda para que se vea dónde se escribe: «__ / __ / ____» y «de ___ a ___».
    doc.fillColor(LINEA).font('Helvetica').fontSize(10);
    doc.text('___ / ___ / ______', M + mitad + 6, y + 45, { width: cuarto - 10, lineBreak: false });
    doc.text('de _____ a _____', M + mitad + cuarto + 6, y + 45, { width: cuarto - 10, lineBreak: false });
    return y + 68;
  }

  /** Guardia saliente y entrante: cada uno con su casilla de nombre y su casilla de firma. */
  private cambioDeTurno(doc: any, y: number): number {
    const mitad = ANCHO / 2;
    const alto = 40;
    const bloque = (x: number, titulo: string) => {
      doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(10).text(titulo, x, y, { width: mitad - 6, lineBreak: false });
      const ancho = mitad - 6;
      const nombre = ancho * 0.58;
      this.celda(doc, x, y + 14, nombre, alto, 'Nombre');
      this.celda(doc, x + nombre, y + 14, ancho - nombre, alto, 'Firma');
    };
    bloque(M, 'GUARDIA SALIENTE');
    bloque(M + mitad + 6, 'GUARDIA ENTRANTE');
    return y + 14 + alto + 12;
  }

  private titulo(doc: any, y: number, texto: string, nota?: string): number {
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(11).text(texto, M, y, { width: ANCHO, lineBreak: false });
    if (nota) {
      doc.fillColor(GRIS).font('Helvetica').fontSize(8.5).text(nota, M, y + 14, { width: ANCHO, lineBreak: false });
      return y + 28;
    }
    return y + 17;
  }

  /** Tabla en el ancho `ancho` desde `x0`: cabecera en negrita con línea, filas de texto precargado y filas en blanco. */
  private tabla(doc: any, x0: number, ancho: number, y: number, anchos: number[], cabecera: string[], filas: string[][], nFilas: number, alto: number): number {
    const total = anchos.reduce((a, b) => a + b, 0);
    const ws = anchos.map((a) => (a / total) * ancho);
    let x = x0;
    doc.lineWidth(0.7).strokeColor(BORDE).rect(x0, y, ancho, 17).stroke();
    cabecera.forEach((c, i) => {
      doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(9).text(c, x + 3, y + 4.5, { width: ws[i] - 6, lineBreak: false });
      if (i > 0) doc.moveTo(x, y).lineTo(x, y + 17).stroke();
      x += ws[i];
    });
    y += 17;
    for (let r = 0; r < nFilas; r++) {
      x = x0;
      for (let c = 0; c < ws.length; c++) {
        doc.lineWidth(0.5).strokeColor(BORDE).rect(x, y, ws[c], alto).stroke();
        const t = filas[r]?.[c];
        if (t) doc.fillColor(TINTA).font('Helvetica').fontSize(10).text(t, x + 3, y + (alto - 10) / 2 - 0.5, { width: ws[c] - 6, height: alto - 2, ellipsis: true, lineBreak: false });
        x += ws[c];
      }
      y += alto;
    }
    return y;
  }

  /** Lo que entrega Gemeseg (izquierda) al lado de lo que es del cliente o la entidad (derecha). */
  private dotacion(doc: any, d: HojaEnBlancoData, y: number): number {
    const gap = 12;
    const ancho = (ANCHO - gap) / 2;
    const deGemeseg = d.dotacionBase.filter((x) => x.ambito !== 'CLIENTE');
    const delCliente = d.dotacionBase.filter((x) => x.ambito === 'CLIENTE');
    // Al menos 6 filas por lado (más de las 5 que pidió Operaciones); si hay más artículos, las que hagan falta hasta 10.
    const filasN = Math.min(10, Math.max(6, deGemeseg.length, delCliente.length));
    const fila = (x: { articulo: string; cantidad: number | null }) => [x.articulo, x.cantidad === null ? '' : String(x.cantidad), ''];
    const cab = ['Artículo', 'Inicial', 'Hay hoy'];
    const an = [140, 38, 44];

    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(11).text('DOTACIÓN DEL PUESTO', M, y, { width: ANCHO, lineBreak: false });
    doc.fillColor(GRIS).font('Helvetica').fontSize(8.5).text('Anote lo que HAY hoy. «Inicial» es lo registrado del puesto.', M, y + 2, { width: ANCHO, align: 'right', lineBreak: false });
    y += 17;
    doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(9.5).text('Lo que entrega Gemeseg', M, y, { width: ancho, lineBreak: false });
    doc.text('Lo que entrega el cliente o la entidad', M + ancho + gap, y, { width: ancho, lineBreak: false });
    y += 14;
    const fin1 = this.tabla(doc, M, ancho, y, an, cab, deGemeseg.slice(0, filasN).map(fila), filasN, 20);
    this.tabla(doc, M + ancho + gap, ancho, y, an, cab, delCliente.slice(0, filasN).map(fila), filasN, 20);
    return fin1 + 10;
  }

  /** Espacio general de anotaciones con su hora: rondas, ingresos, novedades… hasta donde llega la hoja. */
  private movimiento(doc: any, y: number, hasta: number) {
    y = this.titulo(doc, y, 'ANOTACIONES DEL TURNO', 'Rondas, ingresos, novedades y lo que haga falta, una línea por anotación y con su hora.');
    // Dos renglones menos que los que caben; los que quedan se reparten el alto para que haya donde escribir grande.
    const libre = hasta - y - 17;
    const n = Math.max(3, Math.floor(libre / 21) - 2);
    this.tabla(doc, M, ANCHO, y, [56, 483], ['Hora', 'Anotación'], [], n, libre / n);
  }

  private pie(doc: any, y: number) {
    const w = ANCHO / 3;
    const mitad = ANCHO - w - 6;
    // Observaciones (ancho doble) junto a la firma del supervisor o cliente.
    this.celda(doc, M, y, mitad, 78, 'Observaciones');
    this.celda(doc, M + mitad + 6, y, w, 78, 'Supervisor o cliente (firma)');
  }
}
