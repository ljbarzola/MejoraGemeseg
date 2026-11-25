/**
 * Registra el service worker de la pantalla del celular (`/campo`) para que abra aunque no haya señal.
 *
 * Solo en la versión publicada (`import.meta.env.PROD`: el servidor de desarrollo no sirve archivos con nombre
 * único y el worker los guardaría mal) y SOLO se llama desde `CampoPage`, así que el resto de la app nunca lo carga.
 * Se registra con alcance `/campo`: ninguna otra pantalla de la app queda bajo su control.
 *
 * Después de registrarlo, le avisa qué archivos (`/assets/…`) cargó esta pantalla, para que los guarde: así la
 * primera vez que se abra sin señal ya tiene todo lo que necesita. Todo es mejor esfuerzo: si algo falla, la
 * pantalla funciona igual (solo que sin señal no abrirá desde cero).
 */
export function registrarSwCampo(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const registrar = async () => {
    try {
      await navigator.serviceWorker.register('/sw-campo.js', { scope: '/campo' });
      const lista = await navigator.serviceWorker.ready;
      const urls = performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .filter((n) => {
          try {
            const u = new URL(n);
            return u.origin === window.location.origin && u.pathname.startsWith('/assets/');
          } catch {
            return false;
          }
        });
      lista.active?.postMessage({ tipo: 'CACHEAR', urls });
    } catch {
      /* sin service worker la pantalla sigue funcionando con señal */
    }
  };

  // Tras la carga, para no competir con lo que la pantalla necesita para abrir.
  if (document.readyState === 'complete') void registrar();
  else window.addEventListener('load', () => { void registrar(); }, { once: true });
}
