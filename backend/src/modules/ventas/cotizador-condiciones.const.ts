/**
 * Texto con el que se siembran las «Condiciones generales» de cada pilar del
 * Cotizador (2026-11-23). Antes vivía solo en el frontend (`DEFAULT_CONDITIONS`):
 * ahora cada empresa puede editarlo por pilar desde Configuración → Servicios.
 * Se guarda una copia por pilar la primera vez que se consulta; la cotización
 * sigue congelando el texto al guardarla, igual que siempre.
 */
export const CONDICIONES_GENERALES_POR_DEFECTO = [
  'Validez de la oferta: 15 días calendario desde la fecha de emisión.',
  'Forma de pago: 50% anticipo, 50% contra entrega (configurable según monto).',
  'Plazo de entrega: Por confirmar al momento de la orden.',
  'Garantía equipos: 12 a 24 meses según fabricante.',
  'Garantía mano de obra: 90 días.',
  'IVA: 15% incluido en el total.',
  'Moneda: Dólares de los Estados Unidos (USD).',
].join('\n');
