/**
 * Tablas «vivas»: mejora TODA tabla de listado (`.tasks-table-wrapper`) de la app
 * sin tocar pantalla por pantalla. Se instala una sola vez en main.tsx, igual que
 * overlayClickGuard, y cubre también las tablas futuras.
 *
 * Qué resuelve (pedido de la usuaria, 2026-10-20):
 *  1. Altura propia. Antes la tabla crecía con todas sus filas y su barra de
 *     scroll horizontal quedaba al final de la lista, por debajo de la pantalla:
 *     había que bajar «hasta poder arrastrar» y al subir se perdía. Ahora la
 *     tabla ocupa lo que queda de pantalla desde donde empieza, se desplaza por
 *     dentro, el encabezado queda fijo y la barra horizontal siempre se ve al pie.
 *  2. Arrastrar con el mouse. Se agarra la tabla por cualquier celda y se mueve a
 *     los lados/arriba/abajo. Los clics en botones, enlaces y campos siguen igual.
 *  3. Columnas fijas. La primera columna (el dato principal) y, si la pantalla lo
 *     pide, una segunda, no se van al desplazar. El número lo manda el atributo
 *     `data-fijas` de la <table> (0, 1 o 2); sin atributo se fija 1.
 *
 * Las reglas visuales viven en styles.css, sección «TABLAS VIVAS».
 *
 * Quedan fuera las tablas dentro de un modal o diálogo (ahí ya hay un scroll
 * propio y anidar otro sería confuso) y las de una zona marcada con
 * `data-tablas-vivas="off"`.
 */
const WRAPPER = '.tasks-table-wrapper';
// `[data-tablas-vivas="off"]`: zona que ya tiene su propio scroll o solo lista catálogos cortos
// (ej. el panel de Configuración de Ventas); ahí una tabla con altura propia sería un scroll dentro de otro.
const EN_MODAL = '.modal-overlay, .modal-backdrop, .modal, [role="dialog"], .revision-panel, [data-tablas-vivas="off"]';
const INTERACTIVO = 'a, button, input, select, textarea, label, summary, [role="button"], [contenteditable], .col-resizer, thead';
const MARGEN_INFERIOR = 16;
const ALTO_MINIMO = 320;
const UMBRAL_ARRASTRE = 4;

const vivas = new Set<HTMLElement>();

function ajustarAlto(w: HTMLElement) {
  const arriba = w.getBoundingClientRect().top + window.scrollY;
  const alto = Math.max(ALTO_MINIMO, window.innerHeight - arriba - MARGEN_INFERIOR);
  w.style.setProperty('--tabla-alto', `${Math.round(alto)}px`);
}

function marcarDesplazamiento(w: HTMLElement) {
  w.toggleAttribute('data-scrolled', w.scrollLeft > 0);
  w.toggleAttribute('data-desborda', w.scrollWidth > w.clientWidth + 1);
}

function activarArrastre(w: HTMLElement) {
  let origen: { x: number; y: number; left: number; top: number } | null = null;
  let arrastrando = false;

  w.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !w.hasAttribute('data-desborda')) return;
    if ((e.target as Element).closest(INTERACTIVO)) return;
    origen = { x: e.clientX, y: e.clientY, left: w.scrollLeft, top: w.scrollTop };
    arrastrando = false;
  });

  document.addEventListener('mousemove', (e) => {
    if (!origen) return;
    const dx = e.clientX - origen.x;
    const dy = e.clientY - origen.y;
    if (!arrastrando && Math.hypot(dx, dy) < UMBRAL_ARRASTRE) return;
    if (!arrastrando) {
      arrastrando = true;
      w.setAttribute('data-arrastrando', '');
      document.body.style.userSelect = 'none';
    }
    w.scrollLeft = origen.left - dx;
    w.scrollTop = origen.top - dy;
  });

  const soltar = () => {
    if (!origen) return;
    const fueArrastre = arrastrando;
    origen = null;
    arrastrando = false;
    w.removeAttribute('data-arrastrando');
    document.body.style.userSelect = '';
    // Si se arrastró, el clic que el navegador dispara al soltar no debe abrir la fila.
    if (fueArrastre) {
      const tragar = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
      w.addEventListener('click', tragar, { capture: true, once: true });
      setTimeout(() => w.removeEventListener('click', tragar, true), 0);
    }
  };
  document.addEventListener('mouseup', soltar);
}

function medirFijas(tabla: HTMLTableElement) {
  const primera = tabla.querySelector('thead th:first-child');
  if (primera) tabla.style.setProperty('--fija-2', `${Math.round(primera.getBoundingClientRect().width)}px`);
}

function activar(w: HTMLElement) {
  if (w.hasAttribute('data-viva') || w.closest(EN_MODAL)) return;
  w.setAttribute('data-viva', '');
  w.classList.add('tabla-viva');
  vivas.add(w);

  const tabla = w.querySelector('table');
  if (tabla instanceof HTMLTableElement) {
    if (!tabla.hasAttribute('data-fijas')) tabla.setAttribute('data-fijas', '1');
    // El segundo bloque fijo se ancla justo después del primero: se mide su ancho
    // ahora y cada vez que cambia (arrastre del tirador, columnas nuevas).
    const primera = tabla.querySelector('thead th:first-child');
    if (primera) new ResizeObserver(() => medirFijas(tabla)).observe(primera);
    medirFijas(tabla);
  }

  ajustarAlto(w);
  marcarDesplazamiento(w);
  w.addEventListener('scroll', () => marcarDesplazamiento(w), { passive: true });
  new ResizeObserver(() => marcarDesplazamiento(w)).observe(w);
  if (tabla) new ResizeObserver(() => marcarDesplazamiento(w)).observe(tabla);
  activarArrastre(w);
}

export function installTablasVivas() {
  const barrer = () => {
    document.querySelectorAll<HTMLElement>(`${WRAPPER}:not([data-viva])`).forEach(activar);
    // Una tabla que se desmontó deja de recalcularse.
    vivas.forEach((w) => { if (!w.isConnected) vivas.delete(w); });
  };

  let pendiente = false;
  const programar = () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      barrer();
      vivas.forEach(ajustarAlto);
    });
  };

  // El cuerpo cambia de alto cuando algo encima de la tabla crece o se achica
  // (un aviso, un filtro): se recalcula cuánta pantalla le queda.
  new MutationObserver(programar).observe(document.body, { childList: true, subtree: true });
  new ResizeObserver(programar).observe(document.body);
  window.addEventListener('resize', programar);
  programar();
}
