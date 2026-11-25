import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import type { CampoGuia, RutaConPuntos } from './custodias-config.service';
import type {
  GuiaContenedor,
  GuiaCustodia,
  GuiaEtiqueta,
  RefCustodio,
  ValorCampo,
} from './custodia-guia.types';
import type { MomentoFirma } from './custodias-campo.util';

const NAVY = '#100f31';
const ORANGE = '#ee3d1d';
const TEXTO = '#1f2937';
const GRIS = '#6b7280';
const LINEA = '#d1d5db';
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

/** Lo que el PDF necesita además del viaje (campos configurados, ruta con puntos y cuándo firma el cliente). */
export interface ContextoPdf {
  campos: CampoGuia[];
  ruta: RutaConPuntos | null;
  firmaMomento: MomentoFirma | null;
  /** Lo que pasó en campo (Fase 2): el recorrido, las firmas con su imagen y las fotos (miniaturas). */
  campo?: CampoPdf | null;
}

export interface CampoPdf {
  eventos: {
    tipo: string;
    puntoId: number | null;
    puntoNombre: string | null;
    novedadTipo: string | null;
    texto: string | null;
    ocurridoEn: Date;
  }[];
  firmas: { momento: string; nombre: string; cedula: string; firmadaEn: Date; imagen: Buffer | null }[];
  /** Hasta 24 miniaturas; `totalFotos` es cuántas tiene el viaje en total. */
  fotos: { momento: string; etiqueta: string | null; puntoNombre: string | null; tomadaEn: Date; miniatura: Buffer }[];
  totalFotos: number;
}

const MOMENTO_FOTO_LABELS: Record<string, string> = {
  SALIDA: 'Salida',
  PUNTO: 'Punto de control',
  LLEGADA: 'Llegada',
  NOVEDAD: 'Novedad',
  LIBRE: 'Foto',
};
const NOVEDAD_LABELS: Record<string, string> = {
  TRAFICO: 'Tráfico',
  RETEN: 'Retén',
  DESVIO: 'Desvío',
  AVERIA: 'Avería',
  ACCIDENTE: 'Accidente',
  OTRO: 'Otra novedad',
};
/** Cuántas fotos entran en el PDF; el resto se ve en el enlace del correo. */
export const MAX_FOTOS_PDF = 24;

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

// «24/11 14:35» en hora de Ecuador, para la columna de hora del detalle de ruta.
function formatDiaHoraCortaEC(date?: Date | string | null): string {
  if (!date) return '';
  const d = new Date(new Date(date).getTime() - 5 * 3600 * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}

const M = 40; // margen
const PIE = 62; // alto reservado abajo para el pie de página

/** Si lo que sigue no cabe en la hoja, pasa a la siguiente. Devuelve la y donde seguir. */
function asegurar(doc: any, y: number, alto: number): number {
  if (y + alto > doc.page.height - PIE) {
    doc.addPage();
    return M;
  }
  return y;
}

/** Título de sección: franja gris con el nombre; devuelve la y donde empieza el contenido. */
function seccion(doc: any, titulo: string, y: number): number {
  y = asegurar(doc, y, 60);
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
  // Se mide primero para no partir una fila entre dos hojas.
  let alto = 0;
  doc.font('Helvetica-Bold').fontSize(10);
  datos.forEach(([, v]) => {
    alto = Math.max(alto, 10 + doc.heightOfString(v && v.trim() ? v : '—', { width: colW }) + 8);
  });
  y = asegurar(doc, y, alto);
  datos.forEach(([e, v], i) => {
    dato(doc, e, v, M + i * (colW + gap), y, colW);
  });
  return y + alto;
}

/** Varias filas de datos de a `porFila` columnas. */
function datosEnFilas(doc: any, datos: [string, string][], porFila: number, y: number): number {
  for (let i = 0; i < datos.length; i += porFila) {
    y = fila(doc, datos.slice(i, i + porFila), y);
  }
  return y;
}

interface ColumnaTabla {
  titulo: string;
  ancho: number;
}

/**
 * Tabla con borde fino: encabezado gris (se repite si la tabla pasa a otra hoja) y filas de alto según su
 * contenido (`altoMinimo` para dejar espacio de escribir a mano). Devuelve la y siguiente.
 */
function tabla(
  doc: any,
  y: number,
  columnas: ColumnaTabla[],
  filas: string[][],
  opciones: { altoMinimo?: number; primeraEtiqueta?: boolean; tamano?: number } = {},
): number {
  const tamano = opciones.tamano ?? 8.5;
  const pad = 4;
  const ancho = columnas.reduce((s, c) => s + c.ancho, 0);
  const altoEncabezado = 16;

  const encabezado = (yy: number) => {
    doc.rect(M, yy, ancho, altoEncabezado).fill(FONDO);
    let x = M;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7.5);
    for (const c of columnas) {
      doc.text(c.titulo.toUpperCase(), x + pad, yy + 5, { width: c.ancho - 2 * pad, lineBreak: false, ellipsis: true });
      x += c.ancho;
    }
    doc.rect(M, yy, ancho, altoEncabezado).lineWidth(0.5).strokeColor(LINEA).stroke();
    return yy + altoEncabezado;
  };

  y = asegurar(doc, y, altoEncabezado + (opciones.altoMinimo ?? 18));
  y = encabezado(y);

  for (const celdas of filas) {
    let alto = opciones.altoMinimo ?? 18;
    columnas.forEach((c, i) => {
      doc.font(i === 0 && opciones.primeraEtiqueta ? 'Helvetica-Bold' : 'Helvetica').fontSize(tamano);
      alto = Math.max(alto, doc.heightOfString(celdas[i] ?? '', { width: c.ancho - 2 * pad }) + 2 * pad + 1);
    });
    if (y + alto > doc.page.height - PIE) {
      doc.addPage();
      y = encabezado(M);
    }
    let x = M;
    columnas.forEach((c, i) => {
      if (i === 0 && opciones.primeraEtiqueta) doc.rect(x, y, c.ancho, alto).fill('#fafafa');
      doc
        .fillColor(i === 0 && opciones.primeraEtiqueta ? GRIS : TEXTO)
        .font(i === 0 && opciones.primeraEtiqueta ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(tamano)
        .text(celdas[i] ?? '', x + pad, y + pad, { width: c.ancho - 2 * pad });
      doc.rect(x, y, c.ancho, alto).lineWidth(0.5).strokeColor(LINEA).stroke();
      x += c.ancho;
    });
    y += alto;
  }
  return y + 10;
}

/** Valor de un campo configurable, listo para imprimir. */
function textoValor(v: ValorCampo | undefined, tipo: string): string {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (tipo === 'FECHA' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [a, m, d] = v.slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
  }
  return String(v);
}

interface CampoImprimible {
  id: string;
  nombre: string;
  tipo: string;
  esSello: boolean;
  orden: number;
}

/**
 * Los campos de un bloque que salen en el PDF. Se usa la foto que el viaje guardó (`guia.etiquetas`) para que un
 * viaje viejo se lea igual aunque luego se renombre u oculte el campo; si el viaje no la tiene, el campo vigente.
 * Salen los campos activos que aplican al tipo (aunque estén vacíos, para llenarlos a mano) y los que el viaje ya
 * trae con valor.
 */
function camposDeBloque(
  bloque: string,
  tipo: string,
  campos: CampoGuia[],
  etiquetas: Record<string, GuiaEtiqueta>,
  conValor: Set<string>,
): CampoImprimible[] {
  const salida: CampoImprimible[] = [];
  const ids = new Set<string>();
  for (const c of campos) {
    const id = String(c.id);
    const aplica = c.bloque === bloque && (c.tipoServicio === tipo || c.tipoServicio === 'TODOS');
    if ((c.activo && aplica) || (conValor.has(id) && etiquetas[id]?.bloque === bloque)) ids.add(id);
  }
  // Un campo que el viaje usó y ya no está en la lista (no debería pasar: «borrar» solo desactiva).
  for (const id of conValor) if (etiquetas[id]?.bloque === bloque) ids.add(id);
  for (const id of ids) {
    const foto = etiquetas[id];
    const vivo = campos.find((c) => String(c.id) === id);
    const fuente = foto ?? (vivo ? { nombre: vivo.nombre, tipo: vivo.tipo, bloque: vivo.bloque, enPdf: vivo.enPdf, esSello: vivo.esSello, orden: vivo.orden } : null);
    if (!fuente || !fuente.enPdf) continue;
    salida.push({ id, nombre: fuente.nombre, tipo: fuente.tipo, esSello: fuente.esSello, orden: fuente.orden });
  }
  return salida.sort((a, b) => a.orden - b.orden || Number(a.id) - Number(b.id));
}

function clavesConValor(registros: (Record<string, ValorCampo> | undefined)[]): Set<string> {
  const s = new Set<string>();
  for (const r of registros) {
    for (const [k, v] of Object.entries(r ?? {})) {
      if (v !== null && v !== undefined && v !== '') s.add(k);
    }
  }
  return s;
}

@Injectable()
export class PdfService {
  async generarPdfOrdenCustodia(custodia: any, contexto?: Partial<ContextoPdf>): Promise<Buffer> {
    const campos = contexto?.campos ?? [];
    const ruta = contexto?.ruta ?? null;
    const firmaMomento: MomentoFirma = contexto?.firmaMomento ?? 'LLEGADA';
    const campoPdf = contexto?.campo ?? null;
    const guia: GuiaCustodia =
      custodia.guia && typeof custodia.guia === 'object' && !Array.isArray(custodia.guia) ? custodia.guia : {};
    const etiquetas = guia.etiquetas ?? {};
    const tipo: string = custodia.tipoCustodia;

    return new Promise((resolve, reject) => {
      const doc = new (PDFDocument as any)({
        margin: M,
        size: 'LETTER',
        bufferPages: true,
        info: { Title: `Orden de custodia ${custodia.numeroGuia}` },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ancho = doc.page.width - 2 * M;

      // ── 1. Encabezado: logo a la izquierda; título, guía y estado a la derecha ──
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

      // ── 2. Datos generales ──
      let y = seccion(doc, 'Datos generales', 124);
      const contacto = guia.contactoSitio;
      y = datosEnFilas(
        doc,
        [
          ['Tipo de custodia', TIPO_LABELS[tipo] || tipo],
          ['Cliente', custodia.cliente],
          [
            'Contacto en sitio',
            contacto ? [contacto.nombre, contacto.telefono].filter(Boolean).join(' · ') : '',
          ],
          ['Salida (fecha y hora)', formatFechaHoraEC(custodia.fechaHoraSalida)],
          ['Ciudad de salida', custodia.ciudadSalida],
          ['Dirección de salida', custodia.direccionSalida],
          ['Llegada (fecha y hora)', formatFechaHoraEC(custodia.fechaHoraLlegada)],
          ['Ciudad de llegada', custodia.ciudadLlegada],
          ['Dirección de llegada', custodia.direccionLlegada],
          ['N.º de patrulla', custodia.patrulla],
          ['Placa GEMESEG', custodia.placa],
          ['Ruta', ruta?.nombre ?? ''],
        ],
        3,
        y,
      );
      const generales = camposDeBloque('GENERAL', tipo, campos, etiquetas, clavesConValor([guia.campos]));
      if (generales.length) {
        y = datosEnFilas(
          doc,
          generales.map((c) => [c.nombre, textoValor(guia.campos?.[c.id], c.tipo)] as [string, string]),
          3,
          y,
        );
      }

      // ── 3. Contenedores (solo Puerto) ──
      const contenedores: GuiaContenedor[] = Array.isArray(guia.contenedores) ? guia.contenedores : [];
      if (tipo === 'PUERTO' && contenedores.length) {
        y = seccion(doc, 'Contenedores', y + 4);
        const etiquetaW = 118;
        const colW = (ancho - etiquetaW) / contenedores.length;
        const columnas: ColumnaTabla[] = [
          { titulo: '', ancho: etiquetaW },
          ...contenedores.map((_, i) => ({ titulo: `Contenedor ${i + 1}`, ancho: colW })),
        ];
        const delCampo = (c: CampoImprimible) => contenedores.map((k) => textoValor(k.campos?.[c.id], c.tipo));
        const deContenedor = camposDeBloque('CONTENEDOR', tipo, campos, etiquetas, clavesConValor(contenedores.map((k) => k.campos)));
        const sellos = deContenedor.filter((c) => c.esSello);
        const otros = deContenedor.filter((c) => !c.esSello);
        const filas: string[][] = [
          ['N.º de contenedor', ...contenedores.map((k) => k.numero)],
          ['Chofer del cabezal', ...contenedores.map((k) => k.choferNombre)],
          ['Cédula del chofer', ...contenedores.map((k) => k.choferCedula)],
          ['Placa del cabezal', ...contenedores.map((k) => k.placaCabezal)],
          ['Guía', ...contenedores.map((k) => k.guia)],
          ['Lote', ...contenedores.map((k) => k.lote)],
          ...sellos.map((c) => [c.nombre, ...delCampo(c)]),
          ...otros.map((c) => [c.nombre, ...delCampo(c)]),
        ];
        y = tabla(doc, y, columnas, filas, { primeraEtiqueta: true });

        // Custodio de cabina interna: el custodio del viaje que va al lado del chofer del cabezal.
        const nombreDeRef = (ref: RefCustodio | null | undefined) => {
          if (!ref) return '';
          const n = custodia[`${ref}Name`];
          return typeof n === 'string' ? n : '';
        };
        y = seccion(doc, 'Custodio de cabina interna', y);
        y = tabla(
          doc,
          y,
          columnas,
          [
            ['Custodio', ...contenedores.map((k) => nombreDeRef(k.cabina?.custodio))],
            ['Placa del vehículo', ...contenedores.map((k) => k.cabina?.placa ?? '')],
            ['Tipo de vehículo', ...contenedores.map((k) => k.cabina?.tipoVehiculo ?? '')],
          ],
          { primeraEtiqueta: true },
        );
      } else if (tipo === 'PUERTO' && Array.isArray(custodia.contenedores) && custodia.contenedores.length) {
        // Viaje anterior a la guía digital: solo tiene el texto de cada contenedor.
        y = seccion(doc, 'Contenedores', y + 4);
        doc.fillColor(TEXTO).font('Helvetica').fontSize(9.5);
        for (const c of custodia.contenedores as string[]) {
          y = asegurar(doc, y, 16);
          doc.text(`•  ${c}`, M + 4, y, { width: ancho - 8 });
          y = doc.y + 3;
        }
        y += 6;
      }

      // ── 4. Furgón y haciendas (solo Hacienda) ──
      if (tipo === 'HACIENDA') {
        const haciendas = Array.isArray(guia.haciendas) ? guia.haciendas : [];
        if (guia.furgon && (guia.furgon.placa || guia.furgon.choferNombre || guia.furgon.choferCedula)) {
          y = seccion(doc, 'Furgón', y + 4);
          y = fila(
            doc,
            [
              ['Placa del furgón', guia.furgon.placa],
              ['Chofer', guia.furgon.choferNombre],
              ['Cédula', guia.furgon.choferCedula],
            ],
            y,
          );
        }
        if (haciendas.length) {
          y = seccion(doc, 'Haciendas', y + 4);
          const extras = camposDeBloque('HACIENDA', tipo, campos, etiquetas, clavesConValor(haciendas.map((h) => h.campos)));
          const fijas = 30 + 70 + 52;
          const resto = ancho - fijas;
          const nombreW = extras.length ? resto * 0.4 : resto;
          const extraW = extras.length ? (resto - nombreW) / extras.length : 0;
          const columnas: ColumnaTabla[] = [
            { titulo: 'N.º', ancho: 30 },
            { titulo: 'Hacienda', ancho: nombreW },
            { titulo: 'Guía', ancho: 70 },
            { titulo: 'Sacos', ancho: 52 },
            ...extras.map((c) => ({ titulo: c.nombre, ancho: extraW })),
          ];
          y = tabla(
            doc,
            y,
            columnas,
            haciendas.map((h, i) => [
              String(i + 1),
              h.nombre,
              h.guia,
              h.sacos ? String(h.sacos) : '',
              ...extras.map((c) => textoValor(h.campos?.[c.id], c.tipo)),
            ]),
          );
        } else if (custodia.nombreHacienda || custodia.cantidadSacos) {
          // Viaje anterior a la guía digital: la hacienda vive en sus columnas de siempre.
          y = seccion(doc, 'Haciendas', y + 4);
          y = fila(
            doc,
            [
              ['Hacienda', custodia.nombreHacienda],
              ['Cantidad de sacos', custodia.cantidadSacos ? String(custodia.cantidadSacos) : ''],
            ],
            y,
          );
        }
      }

      // ── 5. Personal asignado ──
      y = seccion(doc, 'Personal asignado', y + 4);
      const personas: { rol: string; nombre: string; cedula: string }[] = [
        { rol: 'Chofer custodio', nombre: custodia.choferName, cedula: custodia.choferCedula },
        { rol: 'Custodio 1', nombre: custodia.custodio1Name, cedula: custodia.custodio1Cedula },
        { rol: 'Custodio 2', nombre: custodia.custodio2Name, cedula: custodia.custodio2Cedula },
        { rol: 'Custodio 3', nombre: custodia.custodio3Name, cedula: custodia.custodio3Cedula },
        { rol: 'Custodio 4', nombre: custodia.custodio4Name, cedula: custodia.custodio4Cedula },
      ].filter((p) => (p.nombre ?? '').trim() !== '');
      y = tabla(
        doc,
        y,
        [
          { titulo: 'Rol', ancho: 110 },
          { titulo: 'Nombre', ancho: ancho - 110 - 130 },
          { titulo: 'Cédula', ancho: 130 },
        ],
        personas.map((p) => [p.rol, p.nombre, p.cedula || '—']),
        { primeraEtiqueta: true },
      );

      // ── 6. Detalle de ruta: con ruta, un renglón por punto; sin ruta, 14 renglones en blanco como la hoja ──
      y = seccion(doc, 'Detalle de ruta', y + 4);
      // Lo que el custodio marcó en campo (Fase 2): la hora real de cada punto, los puntos no previstos y las novedades.
      const eventosCampo = campoPdf?.eventos ?? [];
      const marcas = new Map<number, Date>();
      for (const e of eventosCampo) if (e.tipo === 'PUNTO' && e.puntoId) marcas.set(e.puntoId, e.ocurridoEn);
      const extrasCampo = eventosCampo.filter((e) => (e.tipo === 'PUNTO' && !e.puntoId) || e.tipo === 'NOVEDAD');
      const textoExtra = (e: (typeof eventosCampo)[number]) =>
        e.tipo === 'NOVEDAD'
          ? `Novedad – ${NOVEDAD_LABELS[e.novedadTipo ?? ''] ?? 'Novedad'}${e.texto ? `: ${e.texto}` : ''}`
          : `Punto no previsto: ${e.puntoNombre || e.texto || ''}`;
      if (ruta && ruta.puntos.length) {
        const w = [28, 0, 70, 80, 0];
        w[1] = (ancho - 28 - 70 - 80) * 0.45;
        w[4] = ancho - 28 - 70 - 80 - w[1];
        y = tabla(
          doc,
          y,
          [
            { titulo: 'N.º', ancho: w[0] },
            { titulo: 'Punto de control', ancho: w[1] },
            { titulo: 'Minutos', ancho: w[2] },
            { titulo: 'Hora', ancho: w[3] },
            { titulo: 'Observación', ancho: w[4] },
          ],
          [
            ...ruta.puntos.map((p, i) => [
              String(i + 1),
              p.nombre,
              p.minutosDesdeAnterior ? String(p.minutosDesdeAnterior) : '',
              formatDiaHoraCortaEC(marcas.get(p.id)),
              '',
            ]),
            ...extrasCampo.map((e) => ['+', '', '', formatDiaHoraCortaEC(e.ocurridoEn), textoExtra(e)]),
          ],
          { altoMinimo: 22 },
        );
      } else {
        const renglones: string[][] = extrasCampo.map((e) => [
          formatDiaHoraCortaEC(e.ocurridoEn).split(' ')[0] ?? '',
          formatDiaHoraCortaEC(e.ocurridoEn).split(' ')[1] ?? '',
          textoExtra(e),
        ]);
        while (renglones.length < 14) renglones.push(['', '', '']);
        y = tabla(
          doc,
          y,
          [
            { titulo: 'Fecha', ancho: 90 },
            { titulo: 'Hora', ancho: 70 },
            { titulo: 'Descripción', ancho: ancho - 160 },
          ],
          renglones,
          { altoMinimo: 20 },
        );
      }

      // ── 7. Novedades y observaciones ──
      y = seccion(doc, 'Novedades y observaciones', y + 4);
      const obs = (custodia.observaciones ?? '').trim();
      doc.font('Helvetica').fontSize(9.5);
      const altoObs = Math.max(70, obs ? doc.heightOfString(obs, { width: ancho - 16 }) + 16 : 0);
      y = asegurar(doc, y, Math.min(altoObs, 200));
      doc.rect(M, y, ancho, altoObs).lineWidth(0.5).strokeColor(LINEA).stroke();
      if (obs) doc.fillColor(TEXTO).text(obs, M + 8, y + 8, { width: ancho - 16 });
      y += altoObs + 12;

      // ── 8. Firmas: chofer, cada custodio con nombre y el cliente según el momento elegido ──
      interface FirmaPdf {
        rol: string;
        nombre: string;
        cedula: string;
        imagen?: Buffer | null;
        firmadaEn?: Date | null;
      }
      const firmas: FirmaPdf[] = [...personas.map((p) => ({ rol: p.rol, nombre: p.nombre, cedula: p.cedula }))];
      const nombreCliente = (custodia.cliente ?? '').trim();
      // Si el cliente ya firmó en el celular, su firma real va sobre la línea, con el nombre y la cédula de quien firmó.
      const deMomento = (momento: string) => (campoPdf?.firmas ?? []).find((f) => f.momento === momento);
      const firmaDe = (rol: string, momento: string): FirmaPdf => {
        const f = deMomento(momento);
        return f
          ? { rol, nombre: f.nombre, cedula: f.cedula, imagen: f.imagen, firmadaEn: f.firmadaEn }
          : { rol, nombre: nombreCliente, cedula: '' };
      };
      if (firmaMomento === 'SALIDA' || firmaMomento === 'AMBOS') {
        firmas.push(firmaDe('Cliente – entrega en origen', 'SALIDA'));
      }
      if (firmaMomento === 'LLEGADA' || firmaMomento === 'AMBOS') {
        firmas.push(firmaDe('Cliente – recepción en destino', 'LLEGADA'));
      }
      const porFila = 3;
      const colW = ancho / porFila;
      const altoFila = 78;
      y = seccion(doc, 'Firmas de conformidad', y + 4);
      for (let i = 0; i < firmas.length; i += porFila) {
        y = asegurar(doc, y, altoFila);
        firmas.slice(i, i + porFila).forEach((f, j) => {
          const x = M + j * colW;
          if (f.imagen) {
            try {
              doc.image(f.imagen, x + 20, y + 2, { fit: [colW - 40, 31], align: 'center', valign: 'bottom' });
            } catch {
              // una imagen dañada no debe impedir el PDF: la línea queda en blanco
            }
          }
          doc
            .moveTo(x + 12, y + 34)
            .lineTo(x + colW - 12, y + 34)
            .lineWidth(0.8)
            .strokeColor('#9ca3af')
            .stroke();
          doc.fillColor(TEXTO).font('Helvetica-Bold').fontSize(8).text(f.rol, x + 6, y + 39, { width: colW - 12, align: 'center' });
          doc.fillColor(GRIS).font('Helvetica').fontSize(7.5);
          doc.text(f.nombre || 'Nombre', x + 6, y + 50, { width: colW - 12, align: 'center', lineBreak: false, ellipsis: true });
          doc.text(f.cedula ? `C.I. ${f.cedula}` : 'C.I.', x + 6, y + 61, { width: colW - 12, align: 'center', lineBreak: false });
          if (f.firmadaEn) {
            doc.fontSize(6.5).text(`Firmado ${formatFechaHoraEC(f.firmadaEn)}`, x + 6, y + 70, { width: colW - 12, align: 'center', lineBreak: false });
          }
        });
        y += altoFila;
      }

      // ── 9. Fotos del recorrido (Fase 2): miniaturas, 3 por fila; el resto en el enlace del correo ──
      const fotos = campoPdf?.fotos ?? [];
      if (fotos.length) {
        y = seccion(doc, 'Fotos del recorrido', y + 4);
        const celdaW = ancho / 3;
        const altoImg = 104;
        const altoCelda = altoImg + 34;
        for (let i = 0; i < fotos.length; i += 3) {
          y = asegurar(doc, y, altoCelda);
          fotos.slice(i, i + 3).forEach((f, j) => {
            const x = M + j * celdaW;
            doc.rect(x + 3, y, celdaW - 6, altoImg).lineWidth(0.5).strokeColor(LINEA).stroke();
            try {
              doc.image(f.miniatura, x + 5, y + 2, { fit: [celdaW - 10, altoImg - 4], align: 'center', valign: 'center' });
            } catch {
              doc.fillColor(GRIS).font('Helvetica').fontSize(8).text('Foto no disponible', x + 6, y + altoImg / 2 - 4, { width: celdaW - 12, align: 'center' });
            }
            const detalle = [MOMENTO_FOTO_LABELS[f.momento] ?? f.momento, f.puntoNombre, f.etiqueta].filter(Boolean).join(' · ');
            doc.fillColor(TEXTO).font('Helvetica-Bold').fontSize(7.5).text(detalle, x + 5, y + altoImg + 4, { width: celdaW - 10, lineBreak: false, ellipsis: true });
            doc.fillColor(GRIS).font('Helvetica').fontSize(7).text(formatFechaHoraEC(f.tomadaEn), x + 5, y + altoImg + 15, { width: celdaW - 10, lineBreak: false });
          });
          y += altoCelda;
        }
        if ((campoPdf?.totalFotos ?? 0) > fotos.length) {
          y = asegurar(doc, y, 16);
          doc.fillColor(GRIS).font('Helvetica-Oblique').fontSize(8).text(
            `Se muestran ${fotos.length} de ${campoPdf!.totalFotos} fotos. Ver todas en el enlace del correo.`,
            M,
            y,
            { width: ancho },
          );
        }
      }

      // ── Pie en todas las hojas ──
      const rango = doc.bufferedPageRange();
      for (let i = 0; i < rango.count; i++) {
        doc.switchToPage(rango.start + i);
        doc.fillColor(GRIS).font('Helvetica').fontSize(7.5);
        doc.text(
          `GEMESEG Seguridad  ·  Guía ${custodia.numeroGuia}  ·  Registrado el ${formatFechaHoraEC(custodia.createdAt)} (hora de Ecuador)  ·  Hoja ${i + 1} de ${rango.count}`,
          M,
          doc.page.height - 50,
          { width: ancho, align: 'center', lineBreak: false },
        );
      }

      doc.end();
    });
  }
}
