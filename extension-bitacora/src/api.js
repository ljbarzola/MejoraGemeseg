import { APP, SERVIDOR } from './config.js';

/** Llama al servidor de app.gemeseg. Nunca lanza: devuelve { ok, estado, datos, mensaje }. */
export async function llamar(ruta, { token, metodo = 'GET', cuerpo } = {}) {
  try {
    const respuesta = await fetch(`${SERVIDOR}${ruta}`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    let datos = null;
    try {
      datos = await respuesta.json();
    } catch {
      datos = null;
    }
    // Los textos de error del servidor están escritos en español para la persona; cualquier otro se resume.
    const mensaje =
      typeof datos?.message === 'string' && respuesta.status >= 400 && respuesta.status < 500
        ? datos.message
        : 'No se pudo completar. Inténtalo de nuevo en un momento.';
    return { ok: respuesta.ok, estado: respuesta.status, datos, mensaje };
  } catch {
    return { ok: false, estado: 0, datos: null, mensaje: 'No se pudo conectar con app.gemeseg. Revisa tu conexión.' };
  }
}

/** Dirección de «Mi hoja del día», en la pantalla de la app (no en el servidor). */
export const URL_MI_HOJA = `${APP}/bitacora/mi-hoja`;
