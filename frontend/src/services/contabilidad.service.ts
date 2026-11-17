import { api } from './auth.service';

// Contabilidad (2026-11-16): el dinero de las custodias (tarifas, nómina, ganancias por cédula).
export interface TarifaHistorial {
  id: number;
  tipo: string;
  valorPorPersona: number;
  vigenteDesde: string;
  creadaEn: string;
  /** Ya está en vigor (su día de inicio es hoy o pasó). */
  rige: boolean;
}

export interface TarifasRespuesta {
  hoy: string;
  personasPorViaje: number;
  /** Tarifa vigente HOY de cada tipo; null = sin definir. */
  vigentes: Record<string, number | null>;
  historial: TarifaHistorial[];
}

export const getContabilidadDashboard = (mes?: string) =>
  api.get('/contabilidad/dashboard', { params: { mes } }).then((r) => r.data);

export const getTarifas = (): Promise<TarifasRespuesta> =>
  api.get('/contabilidad/tarifas').then((r) => r.data);
export const crearTarifa = (data: { tipo: string; valorPorPersona: number; vigenteDesde: string }): Promise<TarifasRespuesta> =>
  api.post('/contabilidad/tarifas', data).then((r) => r.data);
export const actualizarTarifa = (id: number, data: { valorPorPersona: number; vigenteDesde: string }): Promise<TarifasRespuesta> =>
  api.patch(`/contabilidad/tarifas/${id}`, data).then((r) => r.data);
export const eliminarTarifa = (id: number): Promise<TarifasRespuesta> =>
  api.delete(`/contabilidad/tarifas/${id}`).then((r) => r.data);

/** Un pago es lo que cobra UNA persona por UN viaje que llegó a su destino. */
export interface Pago {
  id: string;
  /** Fecha del viaje (salida o, sin hora de salida, registro). */
  fecha: string;
  numeroGuia: string;
  tipo: string;
  rol: string;
  persona: string;
  cedula: string;
  cliente: string;
  placa: string;
  /** Lo de la tarifa. */
  monto: number;
  /** Extras menos descuentos ligados a este viaje y esta persona. */
  ajuste: number;
  /** Tarifa + ajuste. */
  total: number;
  custodiaId: number;
  sinTarifa: boolean;
  /** Día (YYYY-MM-DD) con el que se busca la tarifa del viaje. */
  diaViaje: string;
  /** Si no hay tarifa: desde qué día existe la primera de este tipo (null = este tipo no tiene ninguna). */
  tarifaDesde: string | null;
  /** Ya se registró como pagado; en ese caso monto, ajuste y total son los que se congelaron. */
  pagado: boolean;
  pagoId: number | null;
  /** Día del pago (YYYY-MM-DD). */
  pagadoEn: string | null;
  referencia: string | null;
}

/** Extra (suma) o descuento (resta) a una persona al liquidar, ligado a un viaje o suelto en una fecha. */
export interface Ajuste {
  id: number;
  tipo: 'EXTRA' | 'DESCUENTO';
  cedula: string;
  persona: string;
  /** Día (YYYY-MM-DD). */
  fecha: string;
  /** Siempre positivo; el signo lo da el tipo. */
  monto: number;
  firmado: number;
  concepto: string;
  custodiaId: number | null;
  numeroGuia: string | null;
}
export interface AjusteForm {
  tipo: string;
  persona: string;
  cedula: string;
  fecha?: string;
  monto: number;
  concepto: string;
  custodiaId?: number | null;
}

export const getAjustes = (): Promise<{ ajustes: Ajuste[] }> => api.get('/contabilidad/ajustes').then((r) => r.data);
export const crearAjuste = (data: AjusteForm) => api.post('/contabilidad/ajustes', data).then((r) => r.data);
export const actualizarAjuste = (id: number, data: AjusteForm) => api.patch(`/contabilidad/ajustes/${id}`, data).then((r) => r.data);
export const eliminarAjuste = (id: number) => api.delete(`/contabilidad/ajustes/${id}`).then((r) => r.data);

export const getPagos = (): Promise<{ pagos: Pago[]; tarifasHoy: Record<string, number | null> }> =>
  api.get('/contabilidad/pagos').then((r) => r.data);

/** Registrar como pagados (con día y referencia), corregir el registro y deshacerlo. */
export const registrarPagos = (data: { items: { custodiaId: number; rol: string }[]; fecha?: string; referencia?: string }): Promise<{ registrados: number; yaPagados: number }> =>
  api.post('/contabilidad/pagos/registrar', data).then((r) => r.data);
export const editarPagoRegistrado = (id: number, data: { fecha: string; referencia?: string }) =>
  api.patch(`/contabilidad/pagos/registrados/${id}`, data).then((r) => r.data);
export const deshacerPagos = (ids: number[]): Promise<{ deshechos: number }> =>
  api.post('/contabilidad/pagos/deshacer', { ids }).then((r) => r.data);

/** Matriz cronológica (sin `cedula`) o rol de pago de una persona (con `cedula`) de un período, en PDF o en Excel. */
export const getNominaArchivo = (
  formato: 'pdf' | 'excel',
  params: { fechaInicio: string; fechaFin: string; cedula?: string },
): Promise<Blob> =>
  api.get(`/contabilidad/nomina/${formato}`, { params, responseType: 'blob' }).then((r) => r.data);
