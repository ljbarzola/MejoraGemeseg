import L from 'leaflet';

// Piezas comunes de los mapas de Ventas (cuadro «Ubicación» y mapa del Dashboard). Mapa de OpenStreetMap
// con Leaflet: gratis, sin llave. Las baldosas se piden a tile.openstreetmap.org, que pide poner la
// atribución (Leaflet la muestra abajo a la derecha) y no abusar del servicio (uso interno, poco tráfico).

// Ecuador continental. Galápagos queda fuera del encuadre inicial a propósito: alejaría todo el mapa.
export const LIMITES_ECUADOR: L.LatLngBoundsLiteral = [
  [-5.1, -81.2],
  [1.5, -75.1],
];

export const capaBase = () =>
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  });

// Pin hecho con HTML (los iconos por defecto de Leaflet no cargan bien con el empaquetador).
export const ESTILO_PIN: L.DivIconOptions = {
  className: 'ubicacion-pin',
  html: '<span aria-hidden="true">📍</span>',
  iconSize: [32, 32],
  iconAnchor: [16, 30],
};
