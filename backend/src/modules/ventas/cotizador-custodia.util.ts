import { BadRequestException } from '@nestjs/common';

// Cotizador de custodia móvil (2026-11-16). Es el cálculo de la hoja «GEMESEG | Cotizador de Custodia
// Móvil» (pestañas Cotizador, Tarifas y Desglose) pasado al servidor como una función PURA, para que la
// pantalla del Cotizador y, más adelante, el bot de WhatsApp usen exactamente el mismo cálculo.
//
// Reglas de la hoja que se conservan:
//  - Combustible: siempre ida y retorno del vehículo, aunque la custodia sea de un solo trayecto.
//  - Personal: tarifa fija POR VIAJE y región (agente); el chofer cobra la tarifa de la región + un adicional.
//    No sube con los km ni con las horas (así cotizan hoy; si cambia, se cambia aquí).
//  - Margen sobre el PRECIO: precio = costo total / (1 − margen). Ojo: es distinto al margen del resto del
//    Cotizador, que se suma sobre el costo. Se muestra con esa etiqueta para no confundirlos.
//  - El descuento comercial lo aplica la cotización completa (antes del IVA), no esta calculadora.
// Lo que cambia respecto a la hoja: el IVA SÍ se calcula (la hoja traía la celda sin fórmula), es
// configurable; hay un mínimo de custodios; y los costos que la hoja solo mencionaba en su guía (recargo
// nocturno, pernocta, seguro de carga…) son «extras» que se eligen en cada cotización.

export interface RegionTarifa {
  nombre: string;
  /** Tarifa del agente por viaje, en USD. El chofer cobra esto + `adicionalChofer`. */
  agente: number;
}

export interface ExtraCustodia {
  id: string;
  nombre: string;
  /** FIJO: valor × cantidad. PORCENTAJE: % del costo de los conceptos normales. */
  modo: 'FIJO' | 'PORCENTAJE';
  valor: number;
  /** Texto corto de lo que cuenta la cantidad (jornada, día, noche…). Solo informativo. */
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

// Valores de la hoja que Gemeseg usa hoy para cotizar. Cada empresa los edita en Ventas → Configuración.
// El IVA arranca en 15 % como el resto del Cotizador; confirmar con contabilidad si la custodia lleva IVA.
export const TARIFAS_CUSTODIA_POR_DEFECTO: TarifasCustodia = {
  combustibleGalon: 3.17,
  rendimientoKmGalon: 42,
  mantenimientoKm: 0.08,
  depreciacionKm: 0.06,
  alquilerDia: 100,
  seguroAlquilerDia: 0,
  cargoKmAlquilado: 0,
  regiones: [
    { nombre: 'Costa', agente: 25 },
    { nombre: 'Sierra', agente: 45 },
  ],
  adicionalChofer: 10,
  comida: 6,
  hospedaje: 30,
  seguroOperacion: 0,
  administracionFija: 10,
  equipos: 0,
  esperaVehiculoHora: 0,
  imprevistosPct: 5,
  margenPct: 30,
  ivaPct: 15,
  minAgentes: 1,
  extras: [
    { id: 'recargo-nocturno', nombre: 'Recargo nocturno', modo: 'PORCENTAJE', valor: 0, unidad: 'servicio' },
    { id: 'pernocta', nombre: 'Relevo / pernocta', modo: 'FIJO', valor: 0, unidad: 'jornada' },
    { id: 'seguro-carga', nombre: 'Seguro de carga (mercancía de alto valor)', modo: 'FIJO', valor: 0, unidad: 'servicio' },
    { id: 'ruta-alterna', nombre: 'Ruta alternativa / desvío', modo: 'FIJO', valor: 0, unidad: 'servicio' },
    { id: 'permisos', nombre: 'Permisos o equipo especializado', modo: 'FIJO', valor: 0, unidad: 'servicio' },
    { id: 'financiamiento', nombre: 'Financiamiento / cobranza diferida', modo: 'PORCENTAJE', valor: 0, unidad: 'servicio' },
  ],
};

export interface ExtraElegido {
  id: string;
  cantidad: number;
}

export interface EntradaCustodia {
  origen: string;
  destino: string;
  kmIda: number;
  incluyeRegreso: boolean;
  /** null = igual que la ida. */
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
  /** null = usar el de las tarifas. */
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
  /** Precio de venta antes de IVA. */
  precioSinIva: number;
  ivaPct: number;
  iva: number;
  totalConIva: number;
  utilidad: number;
  margenEfectivoPct: number;
  costoPorKm: number;
  precioPorKm: number;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

const bad = (msg: string): never => {
  throw new BadRequestException(msg);
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const texto = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v).slice(0, max) : '';

function rango(v: unknown, etiqueta: string, min: number, max: number, def: number): number {
  if (v === null || v === undefined || v === '') return def;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) {
    return bad(`${etiqueta} no es válido (entre ${min} y ${max}).`);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Tarifas
// ---------------------------------------------------------------------------

const PATRON_ID_EXTRA = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/**
 * Valida las tarifas que guarda una persona (lanza 400 con el motivo). Lo que falta se toma de `base`, así
 * una empresa que nunca las guardó usa las de la hoja y una que guardó pocas conserva el resto.
 */
export function limpiarTarifas(raw: unknown, base: TarifasCustodia = TARIFAS_CUSTODIA_POR_DEFECTO): TarifasCustodia {
  if (!isObj(raw)) return bad('Las tarifas no son válidas.');
  const m = 1_000_000;
  const regionesRaw = raw.regiones === undefined ? base.regiones : raw.regiones;
  if (!Array.isArray(regionesRaw) || regionesRaw.length < 1 || regionesRaw.length > 12) {
    return bad('Define entre 1 y 12 regiones.');
  }
  const nombres = new Set<string>();
  const regiones = regionesRaw.map((r): RegionTarifa => {
    if (!isObj(r)) return bad('Una región no es válida.');
    const nombre = texto(r.nombre, 40);
    if (!nombre) return bad('Cada región necesita un nombre.');
    const clave = nombre.toLowerCase();
    if (nombres.has(clave)) return bad(`La región «${nombre}» está repetida.`);
    nombres.add(clave);
    return { nombre, agente: rango(r.agente, `La tarifa del agente de ${nombre}`, 0, m, 0) };
  });

  const extrasRaw = raw.extras === undefined ? base.extras : raw.extras;
  if (!Array.isArray(extrasRaw) || extrasRaw.length > 30) return bad('Los extras no son válidos (máximo 30).');
  const ids = new Set<string>();
  const extras = extrasRaw.map((e): ExtraCustodia => {
    if (!isObj(e)) return bad('Un extra no es válido.');
    const id = texto(e.id, 40);
    if (!PATRON_ID_EXTRA.test(id)) return bad('Un extra tiene un identificador no válido.');
    if (ids.has(id)) return bad('Hay extras repetidos.');
    ids.add(id);
    const nombre = texto(e.nombre, 80);
    if (!nombre) return bad('Cada extra necesita un nombre.');
    const modo = e.modo === 'PORCENTAJE' ? 'PORCENTAJE' : 'FIJO';
    return {
      id,
      nombre,
      modo,
      valor: rango(e.valor, `El valor de «${nombre}»`, 0, modo === 'PORCENTAJE' ? 100 : m, 0),
      unidad: texto(e.unidad, 30),
    };
  });

  const rendimiento = rango(raw.rendimientoKmGalon, 'El rendimiento', 0, 1000, base.rendimientoKmGalon);
  if (!(rendimiento > 0)) return bad('El rendimiento (km por galón) debe ser mayor que 0.');
  return {
    combustibleGalon: rango(raw.combustibleGalon, 'El precio del combustible', 0, 1000, base.combustibleGalon),
    rendimientoKmGalon: rendimiento,
    mantenimientoKm: rango(raw.mantenimientoKm, 'El mantenimiento por km', 0, 1000, base.mantenimientoKm),
    depreciacionKm: rango(raw.depreciacionKm, 'La depreciación por km', 0, 1000, base.depreciacionKm),
    alquilerDia: rango(raw.alquilerDia, 'El alquiler por día', 0, m, base.alquilerDia),
    seguroAlquilerDia: rango(raw.seguroAlquilerDia, 'El seguro del alquiler', 0, m, base.seguroAlquilerDia),
    cargoKmAlquilado: rango(raw.cargoKmAlquilado, 'El cargo por km alquilado', 0, 1000, base.cargoKmAlquilado),
    regiones,
    adicionalChofer: rango(raw.adicionalChofer, 'El adicional del chofer', 0, m, base.adicionalChofer),
    comida: rango(raw.comida, 'El costo de la comida', 0, m, base.comida),
    hospedaje: rango(raw.hospedaje, 'El costo del hospedaje', 0, m, base.hospedaje),
    seguroOperacion: rango(raw.seguroOperacion, 'El seguro de la operación', 0, m, base.seguroOperacion),
    administracionFija: rango(raw.administracionFija, 'La administración fija', 0, m, base.administracionFija),
    equipos: rango(raw.equipos, 'Equipos y comunicaciones', 0, m, base.equipos),
    esperaVehiculoHora: rango(raw.esperaVehiculoHora, 'La espera del vehículo', 0, m, base.esperaVehiculoHora),
    imprevistosPct: rango(raw.imprevistosPct, 'Los imprevistos', 0, 100, base.imprevistosPct),
    margenPct: rango(raw.margenPct, 'El margen', 0, 95, base.margenPct),
    ivaPct: rango(raw.ivaPct, 'El IVA', 0, 100, base.ivaPct),
    minAgentes: Math.trunc(rango(raw.minAgentes, 'El mínimo de custodios', 0, 20, base.minAgentes)),
    extras,
  };
}

/** Tarifas guardadas (o las de la hoja). Si lo guardado no se puede leer, se usan las de la hoja. */
export function tarifasDe(guardadas: unknown): TarifasCustodia {
  if (!isObj(guardadas)) return TARIFAS_CUSTODIA_POR_DEFECTO;
  try {
    return limpiarTarifas(guardadas);
  } catch {
    return TARIFAS_CUSTODIA_POR_DEFECTO;
  }
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/** Deja solo los campos conocidos y acota los números (lanza 400 si algo no es un número razonable). */
export function limpiarEntrada(raw: unknown): EntradaCustodia {
  if (!isObj(raw)) return bad('Los datos de la custodia no son válidos.');
  const extrasRaw = raw.extras === undefined || raw.extras === null ? [] : raw.extras;
  if (!Array.isArray(extrasRaw) || extrasRaw.length > 30) return bad('Los extras elegidos no son válidos.');
  const nullable = (v: unknown, etiqueta: string, max: number): number | null =>
    v === null || v === undefined || v === '' ? null : rango(v, etiqueta, 0, max, 0);
  return {
    origen: texto(raw.origen, 150),
    destino: texto(raw.destino, 150),
    kmIda: rango(raw.kmIda, 'Los km de ida', 0, 20_000, 0),
    incluyeRegreso: raw.incluyeRegreso === true || raw.incluyeRegreso === 'Sí',
    kmRegreso: nullable(raw.kmRegreso, 'Los km de regreso', 20_000),
    kmAdicionales: rango(raw.kmAdicionales, 'Los km adicionales', 0, 20_000, 0),
    vehiculoTipo: raw.vehiculoTipo === 'PROPIO' ? 'PROPIO' : 'ALQUILADO',
    vehiculos: Math.trunc(rango(raw.vehiculos, 'Los vehículos', 0, 100, 1)),
    diasAlquiler: Math.trunc(rango(raw.diasAlquiler, 'Los días de alquiler', 0, 365, 1)),
    region: texto(raw.region, 40),
    viajes: Math.trunc(rango(raw.viajes, 'Los viajes', 0, 1000, 1)),
    horasTraslado: rango(raw.horasTraslado, 'Las horas de traslado', 0, 10_000, 0),
    horasEspera: rango(raw.horasEspera, 'Las horas de espera', 0, 10_000, 0),
    horasOtras: rango(raw.horasOtras, 'Las otras horas', 0, 10_000, 0),
    agentes: Math.trunc(rango(raw.agentes, 'Los agentes', 0, 200, 0)),
    choferes: Math.trunc(rango(raw.choferes, 'Los choferes', 0, 200, 0)),
    comidasAgente: rango(raw.comidasAgente, 'Las comidas por agente', 0, 100, 0),
    comidasChofer: rango(raw.comidasChofer, 'Las comidas por chofer', 0, 100, 0),
    noches: rango(raw.noches, 'Las noches de hospedaje', 0, 365, 0),
    peajes: rango(raw.peajes, 'Los peajes', 0, 10_000_000, 0),
    parqueos: rango(raw.parqueos, 'Los parqueos', 0, 10_000_000, 0),
    trasladosExtra: rango(raw.trasladosExtra, 'Los traslados extra', 0, 10_000_000, 0),
    otrosGastos: rango(raw.otrosGastos, 'Los otros gastos', 0, 10_000_000, 0),
    extras: extrasRaw.map((e): ExtraElegido => {
      if (!isObj(e)) return bad('Un extra elegido no es válido.');
      const id = texto(e.id, 40);
      if (!PATRON_ID_EXTRA.test(id)) return bad('Un extra elegido tiene un identificador no válido.');
      return { id, cantidad: rango(e.cantidad, 'La cantidad de un extra', 0, 10_000, 1) };
    }),
    imprevistosPct: nullable(raw.imprevistosPct, 'Los imprevistos', 100),
    margenPct: nullable(raw.margenPct, 'El margen', 95),
    ivaPct: nullable(raw.ivaPct, 'El IVA', 100),
  };
}

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

const VACIO: Omit<ResultadoCustodia, 'ok' | 'errores'> = {
  kmServicio: 0,
  kmVehiculo: 0,
  horasTotales: 0,
  conceptos: [],
  costoDirecto: 0,
  imprevistosPct: 0,
  imprevistos: 0,
  costoTotal: 0,
  margenPct: 0,
  precioSinIva: 0,
  ivaPct: 0,
  iva: 0,
  totalConIva: 0,
  utilidad: 0,
  margenEfectivoPct: 0,
  costoPorKm: 0,
  precioPorKm: 0,
};

/** Calcula la custodia. Nunca lanza: si falta algo, devuelve `ok: false` con la lista de motivos. */
export function calcularCustodia(e: EntradaCustodia, t: TarifasCustodia): ResultadoCustodia {
  const errores: string[] = [];
  const region = t.regiones.find((r) => r.nombre.toLowerCase() === e.region.toLowerCase());

  if (!(e.kmIda > 0)) errores.push('Indica los km de ida (con el mapa o a mano).');
  if (e.vehiculos < 1) errores.push('Indica al menos un vehículo.');
  if (e.viajes < 1) errores.push('Indica al menos un viaje.');
  if (e.vehiculoTipo === 'ALQUILADO' && e.diasAlquiler < 1) errores.push('Indica los días de alquiler del vehículo.');
  if (!region) errores.push('Elige la región del servicio.');
  if (e.agentes < t.minAgentes) {
    errores.push(
      t.minAgentes === 1
        ? 'Se necesita al menos 1 custodio (los choferes no cuentan como custodios).'
        : `Se necesitan al menos ${t.minAgentes} custodios (los choferes no cuentan como custodios).`,
    );
  }
  const margenPct = e.margenPct ?? t.margenPct;
  if (margenPct >= 100) errores.push('El margen debe ser menor a 100 %.');
  for (const x of e.extras) {
    if (!t.extras.some((ex) => ex.id === x.id)) errores.push('Un extra elegido ya no existe en las tarifas.');
  }
  if (errores.length > 0 || !region) {
    return { ok: false, errores: [...new Set(errores)], ...VACIO };
  }

  const imprevistosPct = e.imprevistosPct ?? t.imprevistosPct;
  const ivaPct = e.ivaPct ?? t.ivaPct;

  // Kilómetros. El vehículo siempre vuelve; el servicio solo cuenta el regreso si la custodia lo cubre.
  const kmRegreso = e.kmRegreso ?? e.kmIda;
  const kmServicio = e.kmIda + (e.incluyeRegreso ? kmRegreso : 0) + e.kmAdicionales;
  const kmVehiculo = e.kmIda + kmRegreso + e.kmAdicionales;
  const horasTotales = e.horasTraslado + e.horasEspera + e.horasOtras;

  const propio = e.vehiculoTipo === 'PROPIO';
  const kmTotalesVehiculos = kmVehiculo * e.vehiculos;
  const diasVehiculos = e.vehiculos * e.diasAlquiler;
  const personas = e.agentes + e.choferes;
  const costoKmCombustible = t.rendimientoKmGalon > 0 ? t.combustibleGalon / t.rendimientoKmGalon : 0;

  // Igual que la hoja: se suma SIN redondear cada concepto y solo se redondea lo que se muestra. Así el
  // precio coincide al centavo con el de la hoja que usan hoy (redondear antes daba hasta 1 centavo menos).
  const conceptos: ConceptoCustodia[] = [];
  let suma = 0;
  const agregar = (clave: string, concepto: string, unidades: number, costoUnitario: number, formula: string) => {
    const bruto = unidades * costoUnitario;
    suma += bruto;
    conceptos.push({
      clave,
      concepto,
      unidades,
      costoUnitario: Math.round(costoUnitario * 10_000) / 10_000,
      total: r2(bruto),
      formula,
    });
  };

  agregar('combustible', 'Combustible', kmTotalesVehiculos, costoKmCombustible, 'Km del vehículo (con regreso) × vehículos × (precio del galón ÷ rendimiento)');
  if (propio) {
    agregar('mantenimiento', 'Mantenimiento propio', kmTotalesVehiculos, t.mantenimientoKm, 'Km del vehículo × vehículos × tarifa por km');
    agregar('depreciacion', 'Depreciación propia', kmTotalesVehiculos, t.depreciacionKm, 'Km del vehículo × vehículos × tarifa por km');
  } else {
    agregar('alquiler', 'Alquiler del vehículo', diasVehiculos, t.alquilerDia, 'Vehículos × días de alquiler × tarifa por día');
    agregar('seguro-alquiler', 'Seguro del alquiler', diasVehiculos, t.seguroAlquilerDia, 'Vehículos × días de alquiler × tarifa por día');
    agregar('cargo-km', 'Cargo por km alquilado', kmTotalesVehiculos, t.cargoKmAlquilado, 'Km del vehículo × vehículos × tarifa por km');
  }
  agregar('agentes', `Custodios (${region.nombre})`, e.agentes * e.viajes, region.agente, 'Agentes × viajes × tarifa de la región');
  agregar('choferes', `Choferes (${region.nombre})`, e.choferes * e.viajes, region.agente + t.adicionalChofer, 'Choferes × viajes × (tarifa de la región + adicional del chofer)');
  agregar('comidas-agentes', 'Comidas de custodios', e.agentes * e.comidasAgente, t.comida, 'Agentes × comidas por agente × costo de la comida');
  agregar('comidas-choferes', 'Comidas de choferes', e.choferes * e.comidasChofer, t.comida, 'Choferes × comidas por chofer × costo de la comida');
  agregar('hospedaje', 'Hospedaje del personal', personas * e.noches, t.hospedaje, '(Agentes + choferes) × noches × costo por noche');
  agregar('peajes', 'Peajes', 1, e.peajes, 'Monto total de peajes');
  agregar('parqueos', 'Parqueos', 1, e.parqueos, 'Monto total de parqueos');
  agregar('traslados', 'Traslados adicionales', 1, e.trasladosExtra, 'Monto de los traslados extra');
  agregar('otros', 'Otros gastos directos', 1, e.otrosGastos, 'Gastos directos adicionales');
  agregar('seguro-operacion', 'Seguro de la operación', 1, t.seguroOperacion, 'Valor fijo de las tarifas');
  agregar('administracion', 'Administración fija', 1, t.administracionFija, 'Coordinación, planificación y control (valor fijo)');
  agregar('equipos', 'Equipos y comunicaciones', 1, t.equipos, 'Radio, GPS, monitoreo (valor fijo)');
  agregar('espera', 'Espera del vehículo', e.horasEspera * e.vehiculos, t.esperaVehiculoHora, 'Horas de espera × vehículos × tarifa por hora');

  // Extras elegidos. Los de porcentaje se calculan sobre los conceptos de arriba (no sobre otros extras).
  const baseNormal = suma;
  for (const x of e.extras) {
    const def = t.extras.find((ex) => ex.id === x.id);
    if (!def || !(x.cantidad > 0)) continue;
    if (def.modo === 'PORCENTAJE') {
      agregar(`extra-${def.id}`, def.nombre, 1, baseNormal * (def.valor / 100), `${def.valor} % del costo de los conceptos normales`);
    } else {
      agregar(`extra-${def.id}`, def.nombre, x.cantidad, def.valor, `Cantidad${def.unidad ? ` (${def.unidad})` : ''} × valor del extra`);
    }
  }

  const imprevistosBruto = suma * (imprevistosPct / 100);
  const costoTotalBruto = suma + imprevistosBruto;
  // Margen sobre el precio (como la hoja): 30 % significa que de cada $100 vendidos, $30 son utilidad.
  const precioBruto = costoTotalBruto / (1 - margenPct / 100);
  const costoDirecto = r2(suma);
  const imprevistos = r2(imprevistosBruto);
  const costoTotal = r2(costoTotalBruto);
  const precioSinIva = r2(precioBruto);
  const iva = r2(precioSinIva * (ivaPct / 100));
  const utilidad = r2(precioBruto - costoTotalBruto);

  return {
    ok: true,
    errores: [],
    kmServicio,
    kmVehiculo,
    horasTotales,
    conceptos,
    costoDirecto,
    imprevistosPct,
    imprevistos,
    costoTotal,
    margenPct,
    precioSinIva,
    ivaPct,
    iva,
    totalConIva: r2(precioSinIva + iva),
    utilidad,
    margenEfectivoPct: precioSinIva > 0 ? r2((utilidad / precioSinIva) * 100) : 0,
    costoPorKm: kmServicio > 0 ? r2(costoTotalBruto / kmServicio) : 0,
    precioPorKm: kmServicio > 0 ? r2(precioBruto / kmServicio) : 0,
  };
}

// ---------------------------------------------------------------------------
// Línea de la cotización
// ---------------------------------------------------------------------------

/** El precio con el que se cotizó, congelado: aunque las tarifas cambien, la cotización no se mueve. */
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

const MAX_DINERO = 1_000_000_000;

/** Valida una línea de custodia que llega al guardar una cotización o plantilla (lanza 400). */
export function limpiarLineaCustodia(raw: Record<string, unknown>): CotCustodiaLine {
  const r = raw.resultado;
  if (!isObj(r)) return bad('Falta el cálculo de la custodia.');
  const din = (v: unknown, etiqueta: string) => rango(v, etiqueta, 0, MAX_DINERO, 0);
  const conceptosRaw = Array.isArray(r.conceptos) ? r.conceptos : [];
  if (conceptosRaw.length > 60) return bad('El cálculo de la custodia tiene demasiados conceptos.');
  const precio = din(r.precioSinIva, 'El precio de la custodia');
  return {
    isCustodia: true,
    id: texto(raw.id, 60) || 'custodia',
    description: texto(raw.description, 300) || 'Servicio de custodia móvil',
    qty: rango(raw.qty, 'La cantidad', 0, 10_000, 1),
    entrada: limpiarEntrada(raw.entrada),
    resultado: {
      precioSinIva: precio,
      ivaPct: rango(r.ivaPct, 'El IVA', 0, 100, 0),
      costoDirecto: din(r.costoDirecto, 'El costo directo'),
      imprevistos: din(r.imprevistos, 'Los imprevistos'),
      costoTotal: din(r.costoTotal, 'El costo total'),
      utilidad: rango(r.utilidad, 'La utilidad', -MAX_DINERO, MAX_DINERO, 0),
      margenPct: rango(r.margenPct, 'El margen', 0, 100, 0),
      margenEfectivoPct: rango(r.margenEfectivoPct, 'El margen efectivo', -1000, 100, 0),
      kmServicio: rango(r.kmServicio, 'Los km del servicio', 0, 100_000, 0),
      kmVehiculo: rango(r.kmVehiculo, 'Los km del vehículo', 0, 100_000, 0),
      horasTotales: rango(r.horasTotales, 'Las horas totales', 0, 100_000, 0),
      conceptos: conceptosRaw.map((c): ConceptoCustodia => {
        if (!isObj(c)) return bad('Un concepto de la custodia no es válido.');
        return {
          clave: texto(c.clave, 60),
          concepto: texto(c.concepto, 120),
          unidades: rango(c.unidades, 'Las unidades', 0, MAX_DINERO, 0),
          costoUnitario: rango(c.costoUnitario, 'El costo unitario', 0, MAX_DINERO, 0),
          total: rango(c.total, 'El total', 0, MAX_DINERO, 0),
          formula: texto(c.formula, 200),
        };
      }),
      calculadoEn: texto(r.calculadoEn, 40),
    },
  };
}
