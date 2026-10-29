// Service worker de la extensión. Cada minuto mira qué sitio está al frente y, solo si toca registrar
// (vinculada, hoja activa, dentro del horario, persona activa en el equipo), anota el DOMINIO. Cada 5
// minutos envía lo anotado. No lee páginas, ni teclas, ni formularios, ni toma capturas.
import { llamar } from './api.js';
import {
  IDLE_SEGUNDOS,
  MAX_MUESTRAS,
  colapsarMuestras,
  dominioDeUrl,
  motivoDePausa,
} from './lib.js';

const MIN = 60_000;
const CONFIG_CADA_MS = 15 * MIN;
const TRAMOS_POR_ENVIO = 150;

const leer = (claves) => chrome.storage.local.get(claves);
const guardar = (datos) => chrome.storage.local.set(datos);

// ───────────────────────── Alarmas ─────────────────────────

async function asegurarAlarmas() {
  for (const [nombre, minutos] of [
    ['muestra', 1],
    ['enviar', 5],
    ['config', 15],
  ]) {
    if (!(await chrome.alarms.get(nombre))) chrome.alarms.create(nombre, { periodInMinutes: minutos });
  }
}

chrome.runtime.onInstalled.addListener(() => void iniciar());
chrome.runtime.onStartup.addListener(() => void iniciar());

async function iniciar() {
  await asegurarAlarmas();
  await actualizarConfig(true);
  await pintarEstado(await motivoActual());
}

chrome.alarms.onAlarm.addListener((alarma) => {
  if (alarma.name === 'muestra') void tomarMuestra();
  else if (alarma.name === 'enviar') void enviar();
  else if (alarma.name === 'config') void actualizarConfig(true);
});

// La ventana emergente avisa cuando la persona se vincula o desvincula.
chrome.runtime.onMessage.addListener((mensaje, _remitente, responder) => {
  if (mensaje?.tipo === 'actualizar') {
    void (async () => {
      await asegurarAlarmas();
      await actualizarConfig(true);
      await pintarEstado(await motivoActual());
      responder({ ok: true });
    })();
    return true;
  }
  return false;
});

// ───────────────────────── Configuración ─────────────────────────

/** Trae del servidor si toca registrar y en qué horario. Un 401 significa que la vincularon de menos: se borra el token. */
async function actualizarConfig(forzar) {
  const { token, config } = await leer(['token', 'config']);
  if (!token) return;
  if (!forzar && config && Date.now() - config.obtenidaEn < CONFIG_CADA_MS) return;
  const r = await llamar('/bitacora/ext/config', { token });
  if (r.estado === 401) {
    await desvincularLocal();
    return;
  }
  if (r.ok && r.datos) {
    await guardar({
      config: {
        registrando: !!r.datos.registrando,
        horario: r.datos.horario ?? null,
        obtenidaEn: Date.now(),
      },
      nombre: r.datos.nombre ?? '',
    });
  }
}

async function desvincularLocal() {
  await chrome.storage.local.remove(['token', 'nombre', 'config', 'muestras', 'ultimoEnvio']);
  await pintarEstado('sin-vincular');
}

// ───────────────────────── Muestreo ─────────────────────────

/** Por qué no se registra ahora, mirando solo la configuración (sin tocar el navegador). */
async function motivoActual() {
  const { token, config } = await leer(['token', 'config']);
  return motivoDePausa({ token, config, ahoraMs: Date.now() });
}

async function tomarMuestra() {
  const motivoBase = await motivoActual();
  if (motivoBase) {
    await pintarEstado(motivoBase);
    return;
  }

  // Quien no toca el equipo hace rato no está trabajando en el navegador.
  const reposo = await chrome.idle.queryState(IDLE_SEGUNDOS);
  if (reposo !== 'active') {
    await pintarEstado('inactivo');
    return;
  }

  // Solo la ventana que está al frente: si la persona está en Word o Excel, el navegador no cuenta.
  let ventana;
  try {
    ventana = await chrome.windows.getLastFocused({ populate: true });
  } catch {
    ventana = null;
  }
  if (!ventana?.focused) {
    await pintarEstado('navegador-en-segundo-plano');
    return;
  }
  const pestana = ventana.tabs?.find((t) => t.active);
  if (!pestana || pestana.incognito || ventana.incognito) {
    await pintarEstado('privada');
    return;
  }
  const dominio = dominioDeUrl(pestana.url ?? '');
  if (!dominio) {
    await pintarEstado('sin-dominio');
    return;
  }

  const minuto = Math.floor(Date.now() / MIN) * MIN;
  const { muestras = [] } = await leer(['muestras']);
  if (!muestras.some((m) => m.t === minuto)) {
    muestras.push({ d: dominio, t: minuto });
    await guardar({ muestras: muestras.slice(-MAX_MUESTRAS) });
  }
  await pintarEstado(null);
}

// ───────────────────────── Envío ─────────────────────────

let enviando = false;

async function enviar() {
  if (enviando) return;
  enviando = true;
  try {
    await actualizarConfig(false);
    for (let vuelta = 0; vuelta < 5; vuelta++) {
      const { token, muestras = [] } = await leer(['token', 'muestras']);
      if (!token || muestras.length === 0) return;

      const tramos = colapsarMuestras(muestras).slice(0, TRAMOS_POR_ENVIO);
      // Las muestras que cubre este envío (por minuto), para quitarlas solo si salió bien.
      const minutosEnviados = new Set();
      for (const t of tramos) {
        const ini = Date.parse(t.inicio);
        for (let i = 0; i < t.minutos; i++) minutosEnviados.add(ini + i * MIN);
      }

      const r = await llamar('/bitacora/ext/eventos', { token, metodo: 'POST', cuerpo: { tramos } });
      if (r.estado === 401) {
        await desvincularLocal();
        return;
      }
      // Un error de red o del servidor se reintenta en el próximo envío; un rechazo (4xx) no mejora reintentando.
      if (!r.ok && r.estado >= 500) return;
      if (!r.ok && r.estado === 0) return;

      const { muestras: actuales = [] } = await leer(['muestras']);
      await guardar({
        muestras: actuales.filter((m) => !minutosEnviados.has(m.t)),
        ultimoEnvio: Date.now(),
      });
      if (r.ok && r.datos && r.datos.registrando === false) await actualizarConfig(true);
      if (colapsarMuestras(muestras).length <= TRAMOS_POR_ENVIO) return;
    }
  } finally {
    enviando = false;
  }
}

// ───────────────────────── Icono ─────────────────────────

/** Insignia del icono: verde «ON» cuando registra; vacía cuando no; «!» si falta vincular. */
async function pintarEstado(motivo) {
  if (motivo === null) {
    await chrome.action.setBadgeBackgroundColor({ color: '#2f855a' });
    await chrome.action.setBadgeText({ text: 'ON' });
    await chrome.action.setTitle({ title: 'Bitácora Gemeseg: registrando el sitio web (solo el dominio)' });
  } else if (motivo === 'sin-vincular') {
    await chrome.action.setBadgeBackgroundColor({ color: '#dd6b20' });
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setTitle({ title: 'Bitácora Gemeseg: falta vincular la extensión' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'Bitácora Gemeseg: en pausa, no se registra nada' });
  }
  await guardar({ ultimoMotivo: motivo });
}
