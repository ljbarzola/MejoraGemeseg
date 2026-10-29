import { URL_MI_HOJA, llamar } from './api.js';
import { MOTIVOS, nombreEquipo, textoHorario } from './lib.js';

const $ = (id) => document.getElementById(id);

function mostrarMensaje(texto) {
  const caja = $('mensaje');
  caja.textContent = texto;
  caja.hidden = !texto;
}

function horaLegible(ms) {
  return new Date(ms).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
}

async function pintar() {
  const { token, nombre, config, muestras = [], ultimoEnvio, ultimoMotivo } = await chrome.storage.local.get([
    'token',
    'nombre',
    'config',
    'muestras',
    'ultimoEnvio',
    'ultimoMotivo',
  ]);
  $('vistaVincular').hidden = !!token;
  $('vistaVinculada').hidden = !token;

  const estado = $('estado');
  estado.hidden = !token;
  if (!token) return;

  // `ultimoMotivo` es null cuando se está registrando; si aún no hubo ninguna lectura, no se dice que registra.
  const activo = ultimoMotivo === null;
  estado.textContent = activo ? 'Registrando' : 'En pausa';
  estado.classList.toggle('activo', activo);

  $('saludo').textContent = nombre ? `Vinculada como ${nombre}` : 'Vinculada';
  $('detalle').textContent = activo
    ? 'Ahora se registra el sitio web que tienes al frente (solo el dominio).'
    : `No se registra nada: ${(MOTIVOS[ultimoMotivo] ?? 'en pausa').toLowerCase()}.`;
  $('horario').textContent = config?.horario ? `Horario: ${textoHorario(config.horario)}.` : '';
  $('envio').textContent = ultimoEnvio
    ? `Último envío a las ${horaLegible(ultimoEnvio)}${muestras.length ? ` · ${muestras.length} min por enviar` : ''}.`
    : muestras.length
      ? `${muestras.length} min por enviar.`
      : 'Todavía no se envió nada.';
}

$('codigo').addEventListener('input', (e) => {
  // «k7m29qxp» → «K7M2-9QXP»: se escribe tal cual, sin pensar en el guion.
  const limpio = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
  e.target.value = limpio.length > 4 ? `${limpio.slice(0, 4)}-${limpio.slice(4)}` : limpio;
});

$('vincular').addEventListener('click', async () => {
  mostrarMensaje('');
  const codigo = $('codigo').value;
  if (codigo.replace('-', '').length !== 8) {
    mostrarMensaje('Escribe el código completo (8 caracteres).');
    return;
  }
  $('vincular').disabled = true;
  const r = await llamar('/bitacora/ext/vincular', {
    metodo: 'POST',
    cuerpo: { codigo, equipo: nombreEquipo(navigator.userAgent) },
  });
  $('vincular').disabled = false;
  if (!r.ok || !r.datos?.token) {
    mostrarMensaje(r.mensaje);
    return;
  }
  await chrome.storage.local.set({ token: r.datos.token, nombre: r.datos.nombre ?? '', muestras: [] });
  $('codigo').value = '';
  await chrome.runtime.sendMessage({ tipo: 'actualizar' });
  await pintar();
});

let confirmando = false;
$('desvincular').addEventListener('click', async () => {
  const boton = $('desvincular');
  if (!confirmando) {
    confirmando = true;
    boton.textContent = '¿Seguro? Pulsa otra vez';
    boton.classList.add('peligro');
    setTimeout(() => {
      confirmando = false;
      boton.textContent = 'Desvincular';
      boton.classList.remove('peligro');
    }, 4000);
    return;
  }
  confirmando = false;
  boton.classList.remove('peligro');
  boton.textContent = 'Desvincular';
  const { token } = await chrome.storage.local.get(['token']);
  // Primero se avisa al servidor; si no hay conexión, igual se borra aquí y la persona puede quitarla en «Mi hoja del día».
  if (token) await llamar('/bitacora/ext/desvincular', { token, metodo: 'POST' });
  await chrome.storage.local.remove(['token', 'nombre', 'config', 'muestras', 'ultimoEnvio']);
  await chrome.runtime.sendMessage({ tipo: 'actualizar' });
  await pintar();
});

$('abrirHoja').addEventListener('click', () => {
  void chrome.tabs.create({ url: URL_MI_HOJA });
});

void pintar();
