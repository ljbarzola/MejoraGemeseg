// Enlaces profundos de las listas de Ventas → filtros de columna.
//
// Las tarjetas del Dashboard (y otras pantallas) abren una lista con parámetros en la URL
// (?estado=…&responsable=…&desde=…). Desde que los filtros viven en la cabecera de cada columna, esos
// parámetros se traducen al filtro de la columna que corresponde y la persona lo ve como un chip.
// Cada función devuelve SOLO los filtros que la URL pide (vacío si no pide ninguno); la pantalla los suma
// a los que ya tenía.

import { VACIO, filtroDeFecha, filtroDeValores, listaDeUrl, type FiltrosColumna } from './columnFilters';
import { filtroFechaDeUrl } from './rangoFechas';
import { ORIGEN_VENTAS_NUEVAS, claveTexto, esEstadoLista } from './oportunidadesMapa';

/** Los estados de un posible cliente que siguen abiertos: lo que la bandeja muestra al abrirse. */
export const ESTADOS_LEAD_PENDIENTES = ['NUEVO', 'EN_SEGUIMIENTO'];
/** «En curso» agrupa lo que el Dashboard cuenta como vigente en Contratos. */
export const ESTADOS_CONTRATO_EN_CURSO = ['VIGENTE', 'POR_VENCER', 'POR_INICIAR'];

/**
 * /ventas/leads?estado=pendientes|NUEVO|…&motivoDescarte=Spam&responsable=mine|<id>&desde=&hasta=
 * (`usuarioId` es quien mira la pantalla: «mine» = sus posibles clientes).
 */
export function filtrosDeUrlLeads(p: URLSearchParams, usuarioId?: number | string | null): FiltrosColumna {
  const filtros: FiltrosColumna = {};
  const estado = p.get('estado');
  if (estado) filtros.estado = filtroDeValores(estado === 'pendientes' ? ESTADOS_LEAD_PENDIENTES : listaDeUrl(estado));
  const motivo = p.get('motivoDescarte');
  if (motivo) filtros.motivoDescarte = filtroDeValores([motivo]);
  const resp = p.get('responsable');
  if (resp && resp !== 'all') {
    const id = resp === 'mine' ? (usuarioId == null ? '' : String(usuarioId)) : resp;
    if (id) filtros.responsable = filtroDeValores([id]);
  }
  const fecha = filtroFechaDeUrl(p.get('desde'), p.get('hasta'));
  if (fecha) filtros.llego = filtroDeFecha(fecha);
  return filtros;
}

/** /ventas/clientes?ciclo=PROSPECTO&desde=&hasta= (`ciclosValidos`: las claves de CICLO_LABEL). */
export function filtrosDeUrlClientes(p: URLSearchParams, ciclosValidos: string[], columnaFecha: string): FiltrosColumna {
  const filtros: FiltrosColumna = {};
  const ciclo = p.get('ciclo');
  if (ciclo && ciclosValidos.includes(ciclo)) filtros.__ciclo = filtroDeValores([ciclo]);
  const fecha = filtroFechaDeUrl(p.get('desde'), p.get('hasta'));
  if (fecha) filtros[columnaFecha] = filtroDeFecha(fecha);
  return filtros;
}

/** /ventas/contratos?estado=VIGENTE|EN_CURSO|…&motivo=Precio&desde=&hasta= */
export function filtrosDeUrlContratos(p: URLSearchParams): FiltrosColumna {
  const filtros: FiltrosColumna = {};
  const estado = p.get('estado');
  if (estado) filtros.estado = filtroDeValores(estado === 'EN_CURSO' ? ESTADOS_CONTRATO_EN_CURSO : listaDeUrl(estado));
  const motivo = p.get('motivo');
  if (motivo) filtros.motivoCierre = filtroDeValores([motivo]);
  const fecha = filtroFechaDeUrl(p.get('desde'), p.get('hasta'));
  if (fecha) filtros.vigencia = filtroDeFecha(fecha);
  return filtros;
}

/** Valor de la columna oculta «Ventas» cuando se pide solo ventas nuevas (?origen=NUEVAS). */
export const VENTAS_SOLO_NUEVAS = 'nuevas';

/**
 * /ventas/oportunidades?etapa=COTIZADO|none&responsable=mine|all|none|<id>&origen=REFERIDO|NUEVAS&motivo=Precio
 * &desde=&hasta=&provincia=&ciudad=(sin-ciudad)&estado=abiertas|cotizadas|aceptadas|perdidas&oportunidad=<id>
 * (`usuarioId` es quien mira la pantalla: «mine» = sus oportunidades). Provincia y ciudad llegan sin tildes ni
 * mayúsculas, como las cuenta el mapa del Dashboard. `origen=NUEVAS` (lo que cuenta el mapa: sin renovaciones ni
 * «Ya era cliente») es el filtro de la columna oculta «Ventas»; `estado` y `oportunidad` también son columnas ocultas
 * (sin embudo): salen como chip y se quitan desde ahí. «Para hoy» decide por su cuenta qué hace con `responsable`.
 */
export function filtrosDeUrlOportunidades(p: URLSearchParams, usuarioId?: number | string | null): FiltrosColumna {
  const filtros: FiltrosColumna = {};
  const etapa = p.get('etapa');
  if (etapa) filtros.etapa = filtroDeValores(etapa === 'none' ? [VACIO] : listaDeUrl(etapa));
  const resp = p.get('responsable');
  if (resp && resp !== 'all') {
    const id = resp === 'none' ? VACIO : resp === 'mine' ? (usuarioId == null ? '' : String(usuarioId)) : resp;
    if (id) filtros.responsable = filtroDeValores([id]);
  }
  const origen = p.get('origen');
  if (origen === ORIGEN_VENTAS_NUEVAS) filtros.ventas = filtroDeValores([VENTAS_SOLO_NUEVAS]);
  else if (origen) filtros.origen = filtroDeValores([origen]);
  const motivo = p.get('motivo');
  if (motivo) filtros.motivoPerdida = filtroDeValores([motivo]);
  const fecha = filtroFechaDeUrl(p.get('desde'), p.get('hasta'));
  if (fecha) filtros.llego = filtroDeFecha(fecha);
  const provincia = p.get('provincia');
  if (provincia) filtros.provincia = filtroDeValores([claveTexto(provincia)]);
  const ciudad = p.get('ciudad');
  if (ciudad) filtros.ciudad = filtroDeValores([claveTexto(ciudad)]);
  const estado = p.get('estado');
  if (esEstadoLista(estado)) filtros.estado = filtroDeValores([estado]);
  const id = Number(p.get('oportunidad'));
  if (id) filtros.oportunidad = filtroDeValores([String(id)]);
  return filtros;
}
