// Custodia móvil dentro del Cotizador (2026-11-16). Tipos que espejan lo que devuelve el servidor
// (`/ventas/cotizador/custodia/*`) y ayudas puras para armar la línea de la cotización. El cálculo NO está
// aquí: lo hace siempre el servidor, para que la pantalla y el bot de WhatsApp usen la misma fórmula.

export interface RegionTarifa {
  nombre: string;
  agente: number;
}

export interface ExtraCustodia {
  id: string;
  nombre: string;
  modo: 'FIJO' | 'PORCENTAJE';
  valor: number;
  unidad: string;
}

export interface TarifasCustodia {
  combustibleGalon: number;
  rendimientoKmGalon: number;
  mantenimientoKm: number;
  depreciacionKm: number;
  alquilerDia: number;
  seguroAlquilerDia: number;
  cargoKmAlquilado: number;
  regiones: RegionTarifa[];
  adicionalChofer: number;
  comida: number;
  hospedaje: number;
  seguroOperacion: number;
  administracionFija: number;
  equipos: number;
  esperaVehiculoHora: number;
  imprevistosPct: number;
  margenPct: number;
  ivaPct: number;
  minAgentes: number;
  extras: ExtraCustodia[];
}

export interface ExtraElegido {
  id: string;
  cantidad: number;
}

export interface EntradaCustodia {
  origen: string;
  destino: string;
  kmIda: number;
  incluyeRegreso: boolean;
  kmRegreso: number | null;
  kmAdicionales: number;
  vehiculoTipo: 'PROPIO' | 'ALQUILADO';
  vehiculos: number;
  diasAlquiler: number;
  region: string;
  viajes: number;
  horasTraslado: number;
  horasEspera: number;
  horasOtras: number;
  agentes: number;
  choferes: number;
  comidasAgente: number;
  comidasChofer: number;
  noches: number;
  peajes: number;
  parqueos: number;
  trasladosExtra: number;
  otrosGastos: number;
  extras: ExtraElegido[];
  imprevistosPct: number | null;
  margenPct: number | null;
  ivaPct: number | null;
}

export interface ConceptoCustodia {
  clave: string;
  concepto: string;
  unidades: number;
  costoUnitario: number;
  total: number;
  formula: string;
}

export interface ResultadoCustodia {
  ok: boolean;
  errores: string[];
  kmServicio: number;
  kmVehiculo: number;
  horasTotales: number;
  conceptos: ConceptoCustodia[];
  costoDirecto: number;
  imprevistosPct: number;
  imprevistos: number;
  costoTotal: number;
  margenPct: number;
  precioSinIva: number;
  ivaPct: number;
  iva: number;
  totalConIva: number;
  utilidad: number;
  margenEfectivoPct: number;
  costoPorKm: number;
  precioPorKm: number;
}

/** Lo que se guarda en la cotización: el precio de ese momento (las tarifas pueden cambiar después). */
export interface ResumenCustodiaGuardado {
  precioSinIva: number;
  ivaPct: number;
  costoDirecto: number;
  imprevistos: number;
  costoTotal: number;
  utilidad: number;
  margenPct: number;
  margenEfectivoPct: number;
  kmServicio: number;
  kmVehiculo: number;
  horasTotales: number;
  conceptos: ConceptoCustodia[];
  calculadoEn: string;
}

export interface CotCustodiaLine {
  isCustodia: true;
  id: string;
  description: string;
  qty: number;
  entrada: EntradaCustodia;
  resultado: ResumenCustodiaGuardado;
}

export interface RutaCalculada {
  km: number;
  minutos: number;
  trazo: [number, number][];
}

/** Valores con los que arranca la calculadora: la región más usada y el mínimo de custodios de las tarifas. */
export function entradaInicial(t: TarifasCustodia): EntradaCustodia {
  const region = t.regiones.find((r) => r.nombre.toLowerCase() === 'sierra') ?? t.regiones[0];
  return {
    origen: '',
    destino: '',
    kmIda: 0,
    incluyeRegreso: false,
    kmRegreso: null,
    kmAdicionales: 0,
    vehiculoTipo: 'ALQUILADO',
    vehiculos: 1,
    diasAlquiler: 1,
    region: region?.nombre ?? '',
    viajes: 1,
    horasTraslado: 0,
    horasEspera: 0,
    horasOtras: 0,
    agentes: Math.max(1, t.minAgentes),
    choferes: 1,
    comidasAgente: 0,
    comidasChofer: 0,
    noches: 0,
    peajes: 0,
    parqueos: 0,
    trasladosExtra: 0,
    otrosGastos: 0,
    extras: [],
    imprevistosPct: null,
    margenPct: null,
    ivaPct: null,
  };
}

const km = (n: number) => `${Math.round(n * 10) / 10}`.replace('.', ',');

/** Texto de la línea en la cotización y en el PDF (nunca lleva costos). */
export function descripcionCustodia(e: EntradaCustodia, kmServicio: number): string {
  const ruta = e.origen && e.destino ? `${e.origen} → ${e.destino}` : e.origen || e.destino || '';
  return `Servicio de custodia móvil${ruta ? `: ${ruta}` : ''} (${km(kmServicio)} km)`;
}

export function lineaDesdeResultado(
  entrada: EntradaCustodia,
  r: ResultadoCustodia,
  idExistente?: string,
): CotCustodiaLine {
  return {
    isCustodia: true,
    id: idExistente ?? `custodia-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    description: descripcionCustodia(entrada, r.kmServicio),
    qty: 1,
    entrada,
    resultado: {
      precioSinIva: r.precioSinIva,
      ivaPct: r.ivaPct,
      costoDirecto: r.costoDirecto,
      imprevistos: r.imprevistos,
      costoTotal: r.costoTotal,
      utilidad: r.utilidad,
      margenPct: r.margenPct,
      margenEfectivoPct: r.margenEfectivoPct,
      kmServicio: r.kmServicio,
      kmVehiculo: r.kmVehiculo,
      horasTotales: r.horasTotales,
      conceptos: r.conceptos,
      calculadoEn: new Date().toISOString(),
    },
  };
}
