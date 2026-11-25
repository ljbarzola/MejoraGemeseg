/* Service worker SOLO de la pantalla del celular del custodio (/campo, 2026-11-24).

   Para qué: si el custodio vuelve a abrir /campo sin señal (túnel, zona sin cobertura), el navegador mostraría su
   página de «sin conexión» y la cola de lo pendiente (que sí sobrevive en el celular) quedaría fuera de alcance.
   Con este archivo la pantalla abre igual y trabaja con lo último que vio.

   Por qué no afecta al resto de la app:
    - Se registra solo desde CampoPage y con alcance «/campo» (ninguna otra ruta queda bajo su control).
    - Aunque otra pestaña lo cargara, solo responde (a) la navegación a /campo y (b) los archivos con nombre único
      de /assets/. TODO lo demás (/api/*, cualquier otra navegación, el index.html de la app) pasa de largo sin
      que este archivo lo toque: el resto de la app siempre pide su index.html nuevo a la red.
    - Nunca guarda respuestas de /api/*. Lo que el custodio ve de su viaje sale de la memoria del celular
      (localStorage) y de la cola de IndexedDB, no de este caché. */

const VERSION = 'v1';
const CACHE = `campo-${VERSION}`;
const PAGINA = '/campo';
/** Con red lenta, tras estos milisegundos se abre lo guardado en vez de seguir esperando. */
const ESPERA_RED_MS = 4000;
/** Tope de archivos guardados (los más viejos se borran): cada publicación nueva trae archivos nuevos. */
const MAX_ARCHIVOS = 150;

const esArchivoDeApp = (url) => url.origin === self.location.origin && url.pathname.startsWith('/assets/');

self.addEventListener('install', (event) => {
  event.waitUntil(precachear());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Los cachés de versiones anteriores se borran.
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n.startsWith('campo-') && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const peticion = event.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  if (peticion.mode === 'navigate' && (url.pathname === PAGINA || url.pathname === `${PAGINA}/`)) {
    event.respondWith(paginaCampo(event));
    return;
  }
  if (esArchivoDeApp(url)) {
    event.respondWith(archivoPrimeroDelCache(peticion));
  }
  // Cualquier otra cosa (/api/*, otras páginas…): sin respondWith, el navegador la pide a la red como siempre.
});

self.addEventListener('message', (event) => {
  const d = event.data;
  if (!d || d.tipo !== 'CACHEAR' || !Array.isArray(d.urls)) return;
  event.waitUntil(guardarLista(d.urls.slice(0, 80)));
});

/** Guarda /campo y los archivos que su página nombra. Si algo falla, la instalación no se cae. */
async function precachear() {
  try {
    const cache = await caches.open(CACHE);
    const r = await fetch(PAGINA, { cache: 'reload' });
    if (!r.ok) return;
    const copia = r.clone();
    const html = await r.text();
    await cache.put(PAGINA, copia);
    const rutas = new Set();
    const re = /(?:src|href)="(\/assets\/[^"]+)"/g;
    let m;
    while ((m = re.exec(html))) rutas.add(m[1]);
    await Promise.all(Array.from(rutas).map((ruta) => guardarArchivo(cache, ruta)));
  } catch (e) {
    /* sin red al instalar: se guardará en la próxima visita */
  }
}

async function guardarArchivo(cache, ruta) {
  try {
    if (await cache.match(ruta, { ignoreVary: true })) return;
    const r = await fetch(ruta);
    if (r.ok && r.type === 'basic') await cache.put(ruta, r);
  } catch (e) {
    /* mejor esfuerzo */
  }
}

async function guardarLista(urls) {
  const cache = await caches.open(CACHE);
  const rutas = new Set();
  for (const u of urls) {
    try {
      const url = new URL(u, self.location.origin);
      if (esArchivoDeApp(url)) rutas.add(url.pathname);
    } catch (e) {
      /* dirección inválida: se ignora */
    }
  }
  await Promise.all(Array.from(rutas).map((ruta) => guardarArchivo(cache, ruta)));
  await limitar(cache);
}

/** Red primero (para tener siempre la versión nueva); sin red o muy lenta, la última guardada. */
async function paginaCampo(event) {
  const enRed = fetch(event.request).then(async (r) => {
    if (r.ok && r.type === 'basic') {
      const cache = await caches.open(CACHE);
      await cache.put(PAGINA, r.clone());
    }
    return r;
  });
  // Aunque se responda con lo guardado, la descarga sigue y deja lista la versión nueva.
  event.waitUntil(enRed.catch(() => null));
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(PAGINA, { ignoreVary: true });
  if (!guardada) return enRed;
  try {
    const tope = new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('tope')), ESPERA_RED_MS));
    const r = await Promise.race([enRed, tope]);
    return r.ok ? r : guardada;
  } catch (e) {
    return guardada;
  }
}

/** Los archivos de /assets/ tienen el contenido en su nombre: lo guardado nunca queda viejo. */
async function archivoPrimeroDelCache(peticion) {
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(peticion, { ignoreVary: true });
  if (guardado) return guardado;
  const r = await fetch(peticion);
  if (r.ok && r.type === 'basic') {
    cache.put(peticion, r.clone()).then(() => limitar(cache)).catch(() => null);
  }
  return r;
}

async function limitar(cache) {
  const claves = await cache.keys();
  const archivos = claves.filter((c) => new URL(c.url).pathname !== PAGINA);
  const sobran = archivos.length - MAX_ARCHIVOS;
  for (let i = 0; i < sobran; i++) await cache.delete(archivos[i]);
}
