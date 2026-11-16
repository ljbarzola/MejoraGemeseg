import { api } from './auth.service';
import type {
  EntradaCustodia,
  ResultadoCustodia,
  RutaCalculada,
  TarifasCustodia,
} from '../utils/cotizador/custodia';

// Custodia móvil del Cotizador. El cálculo lo hace siempre el servidor (una sola fórmula para la
// pantalla y para el bot de WhatsApp); aquí solo se piden las tarifas, el cálculo y la ruta del mapa.

export async function getTarifasCustodia(): Promise<TarifasCustodia> {
  const r = await api.get('/ventas/cotizador/custodia/tarifas');
  return r.data;
}

export async function guardarTarifasCustodia(t: TarifasCustodia): Promise<TarifasCustodia> {
  const r = await api.put('/ventas/cotizador/custodia/tarifas', t);
  return r.data;
}

export async function calcularCustodia(
  entrada: EntradaCustodia,
): Promise<{ entrada: EntradaCustodia; resultado: ResultadoCustodia }> {
  const r = await api.post('/ventas/cotizador/custodia/calcular', entrada);
  return r.data;
}

export async function rutaPorCarretera(
  origen: { lat: number; lng: number },
  destino: { lat: number; lng: number },
): Promise<RutaCalculada> {
  const r = await api.get('/ventas/ubicaciones/ruta', {
    params: { olat: origen.lat, olng: origen.lng, dlat: destino.lat, dlng: destino.lng },
  });
  return r.data;
}
