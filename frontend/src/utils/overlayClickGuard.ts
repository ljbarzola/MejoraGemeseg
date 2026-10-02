/**
 * Evita que un modal se cierre por un "clic" que no empezó en el fondo.
 *
 * Los modales de la app cierran con `onClick` sobre su overlay. Pero si alguien
 * arrastra el mouse para seleccionar texto dentro del modal y suelta FUERA, el
 * navegador dispara el `click` sobre el ancestro común de donde se pulsó y donde
 * se soltó — que es el overlay — y el modal se cerraba perdiendo lo escrito.
 *
 * En vez de corregir los ~70 modales uno por uno, este guard (instalado una sola
 * vez en main.tsx) recuerda dónde empezó cada pulsación y, si el `click` llega a
 * un overlay que NO fue donde empezó, lo descarta en fase de captura, antes de
 * que React ejecute el `onClick` del modal. Cubre también los modales futuros:
 * no hace falta repetir nada en cada uno.
 */
const OVERLAY_SELECTOR = '.modal-overlay, .modal-backdrop, .unsaved-dialog-overlay, .chat-overlay';

export function installOverlayClickGuard() {
  let mouseDownTarget: EventTarget | null = null;

  document.addEventListener('mousedown', (e) => { mouseDownTarget = e.target; }, true);

  document.addEventListener(
    'click',
    (e) => {
      const target = e.target;
      if (!(target instanceof Element) || !target.matches(OVERLAY_SELECTOR)) return;
      if (mouseDownTarget !== target) e.stopPropagation();
    },
    true,
  );
}
