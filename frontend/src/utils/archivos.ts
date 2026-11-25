/**
 * Baja un archivo que el navegador ya tiene en memoria (un `Blob` pedido con el token de sesión).
 *
 * Los PDF de Custodias y Contabilidad se abrían con `window.open(url)`, y esa petición no lleva el token:
 * la API contestaba 401 y la persona veía un error en vez del PDF (2026-11-16). Por eso se piden con
 * `api.get(..., { responseType: 'blob' })` y se descargan con esto.
 */
export function descargarBlob(blob: Blob, nombre: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => window.URL.revokeObjectURL(url), 10_000);
}

/** Nombre de archivo seguro: sin tildes, espacios ni símbolos. */
export const nombreSeguro = (texto: string, separador = '_') =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, separador)
    .replace(new RegExp(`^${separador}|${separador}$`, 'g'), '');
