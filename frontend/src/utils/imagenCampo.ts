/**
 * Fotos de la pantalla de campo: las de la cámara tienen que ser de ahora (las de la galería se aceptan con su fecha) y se comprimen en el celular
 * (lado mayor 1600 px y ≤ 300 KB; miniatura de 400 px y ≤ 40 KB) para que suban rápido por datos móviles.
 * Todo con canvas nativo, sin librerías.
 */

const LADO_FOTO = 1600;
const MAX_FOTO = 300 * 1024;
const LADO_MINI = 400;
const MAX_MINI = 40 * 1024;
/** Una foto de la cámara con más de 15 min de antigüedad no se tomó «ahora» (el celular abrió la galería). */
const MAX_EDAD_MS = 15 * 60_000;

export class FotoRechazada extends Error {}

export type OrigenFotoCampo = 'CAMARA' | 'GALERIA';

/** Lanza `FotoRechazada` con un mensaje para mostrar si el archivo no sirve. La de la galería puede ser de cualquier fecha. */
export function validarFoto(archivo: File, origen: OrigenFotoCampo = 'CAMARA'): void {
  if (!archivo.type.startsWith('image/')) throw new FotoRechazada('Ese archivo no es una foto.');
  if (origen === 'GALERIA') return;
  // Algunos celulares dejan `lastModified` en 0: sin dato no se puede comprobar y se acepta.
  if (archivo.lastModified > 0 && Date.now() - archivo.lastModified > MAX_EDAD_MS) {
    throw new FotoRechazada('Esa foto no es de ahora. Usa «Subir de la galería» para elegirla.');
  }
}

/**
 * Cuándo se tomó una foto. La de la cámara vale la hora de este momento (así vale aunque se suba horas después).
 * La de la galería, la fecha de su archivo si es una fecha real: no del futuro y no anterior a la creación del
 * viaje (el servidor no la aceptaría); si no, la de ahora.
 */
export function horaDeFoto(archivo: File, origen: OrigenFotoCampo, viajeCreadoEn?: string | null): string {
  const ahora = Date.now();
  if (origen === 'CAMARA') return new Date(ahora).toISOString();
  const t = archivo.lastModified;
  const desde = viajeCreadoEn ? new Date(viajeCreadoEn).getTime() - 23 * 3600_000 : 0;
  // 23 h y no 24: queda un margen frente a la regla del servidor (un día antes de crearse el viaje).
  if (!Number.isFinite(t) || t <= 0 || t > ahora || t < desde) return new Date(ahora).toISOString();
  return new Date(t).toISOString();
}

interface Fuente { ancho: number; alto: number; dibujar: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; liberar: () => void }

async function abrirImagen(archivo: Blob): Promise<Fuente> {
  if (typeof createImageBitmap === 'function') {
    try {
      // `from-image` respeta la rotación que guarda la cámara.
      const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { ancho: bmp.width, alto: bmp.height, dibujar: (c, w, h) => c.drawImage(bmp, 0, 0, w, h), liberar: () => bmp.close() };
    } catch { /* se cae a <img> */ }
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new FotoRechazada('No se pudo leer la foto. Prueba con otra.'));
      i.src = url;
    });
    return { ancho: img.naturalWidth, alto: img.naturalHeight, dibujar: (c, w, h) => c.drawImage(img, 0, 0, w, h), liberar: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function aBlob(canvas: HTMLCanvasElement, calidad: number): Promise<Blob> {
  return new Promise((ok, mal) => {
    canvas.toBlob((b) => (b ? ok(b) : mal(new FotoRechazada('No se pudo preparar la foto. Prueba con otra.'))), 'image/jpeg', calidad);
  });
}

/** JPEG con el lado mayor `lado`, bajando la calidad (y, si hace falta, el tamaño) hasta no pasar de `tope` bytes. */
async function reducir(fuente: Fuente, lado: number, tope: number, calidadInicial: number): Promise<Blob> {
  let ladoActual = lado;
  let ultimo: Blob | null = null;
  for (let ronda = 0; ronda < 4; ronda++) {
    const escala = Math.min(1, ladoActual / Math.max(fuente.ancho, fuente.alto));
    const w = Math.max(1, Math.round(fuente.ancho * escala));
    const h = Math.max(1, Math.round(fuente.alto * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new FotoRechazada('Este celular no puede preparar la foto.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    fuente.dibujar(ctx, w, h);
    for (let q = calidadInicial; q >= 0.4 - 1e-9; q -= 0.1) {
      ultimo = await aBlob(canvas, q);
      if (ultimo.size <= tope) return ultimo;
    }
    ladoActual = Math.round(ladoActual * 0.8);
  }
  if (!ultimo) throw new FotoRechazada('No se pudo preparar la foto. Prueba con otra.');
  return ultimo;
}

export interface FotoPreparada { foto: Blob; miniatura: Blob }

export async function prepararFoto(archivo: File, origen: OrigenFotoCampo = 'CAMARA'): Promise<FotoPreparada> {
  validarFoto(archivo, origen);
  const fuente = await abrirImagen(archivo);
  try {
    const foto = await reducir(fuente, LADO_FOTO, MAX_FOTO, 0.8);
    const miniatura = await reducir(fuente, LADO_MINI, MAX_MINI, 0.7);
    return { foto, miniatura };
  } finally {
    fuente.liberar();
  }
}

export const mensajeFoto = (e: unknown): string =>
  e instanceof FotoRechazada ? e.message : 'No se pudo preparar la foto. Prueba con otra.';
