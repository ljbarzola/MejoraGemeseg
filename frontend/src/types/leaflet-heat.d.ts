// leaflet.heat no trae tipos: solo se usa heatLayer en el mapa de calor del Dashboard de Ventas.
declare module 'leaflet.heat';

declare namespace L {
  function heatLayer(
    latlngs: Array<[number, number, number?]>,
    options?: {
      minOpacity?: number;
      maxZoom?: number;
      max?: number;
      radius?: number;
      blur?: number;
      gradient?: Record<number, string>;
    },
  ): import('leaflet').Layer;
}
