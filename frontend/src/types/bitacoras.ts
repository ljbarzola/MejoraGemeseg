// Bitácoras de guardianía (Contratación Pública → Bitácoras). Ver
// backend/src/modules/contratacion-publica/bitacoras/.

export type ResultadoBitacora = 'SIN_REVISAR' | 'CONFORME' | 'A_REVISAR' | 'CON_ERRORES' | 'SIN_COMPARAR';
export type Severidad = 'ALTA' | 'MEDIA' | 'BAJA';
export type EstadoHallazgo = 'ABIERTO' | 'RESUELTO' | 'DESCARTADO';
export type EstadoLectura = 'LEIDA' | 'SIN_LECTURA' | 'ERROR';
export type OrigenLectura = 'IA' | 'IA_CORREGIDA' | 'MANUAL';

export type CategoriaNovedad =
  | 'SIN_NOVEDAD'
  | 'ACCESO'
  | 'VEHICULOS'
  | 'RONDA'
  | 'ENTREGA_TURNO'
  | 'EQUIPOS'
  | 'INCIDENTE'
  | 'OTRO';

export interface BitacoraResumen {
  id: number;
  puestoId: number;
  puestoNombre: string;
  contratoId: number;
  contratoNumero: string;
  entidadId: number;
  entidadNombre: string;
  subidoPorNombre: string;
  archivoKey: string | null;
  archivoNombre: string | null;
  origenLectura: OrigenLectura;
  estadoLectura: EstadoLectura;
  mensajeLectura: string | null;
  fechaDesde: string | null;
  fechaHasta: string | null;
  resultado: ResultadoBitacora;
  createdAt: string;
  lineas: number;
  novedades: number;
  hallazgosAbiertos: number;
  hallazgosAltos: number;
}

export interface ListaBitacoras {
  total: number;
  page: number;
  pageSize: number;
  items: BitacoraResumen[];
}

export interface RegistroBitacora {
  id?: number;
  fecha: string;
  guardiaLeido: string;
  cedula: string | null;
  guardiaNombre: string | null;
  coincidencia: number | null;
  horaEntrada: string | null;
  horaSalida: string | null;
  legible: boolean;
}

export interface NovedadBitacora {
  id?: number;
  fecha: string;
  hora: string | null;
  guardiaLeido: string | null;
  texto: string;
  categoria: CategoriaNovedad;
  gravedad: Severidad;
}

export interface HallazgoBitacora {
  id: number;
  fecha: string | null;
  tipo: string;
  severidad: Severidad;
  mensaje: string;
  estado: EstadoHallazgo;
  nota: string | null;
  resueltoPorNombre: string | null;
  resueltoAt: string | null;
}

export interface EsperadoDelDia {
  cedula: string;
  nombre: string;
  codigo: string;
  codigoNombre: string | null;
  descanso: boolean;
  horaInicio: string | null;
  horaFin: string | null;
}

export interface EstadoAgenteBitacoras {
  nombre: string;
  activo: boolean;
  iaConfigurada: boolean;
}

export interface BitacoraDetalle extends Omit<BitacoraResumen, 'lineas' | 'novedades' | 'hallazgosAbiertos' | 'hallazgosAltos'> {
  companyId: number;
  puestoLeido: string | null;
  observaciones: string | null;
  fechas: string[];
  revisadaAt: string | null;
  registros: (RegistroBitacora & { fecha: string })[];
  novedades: (NovedadBitacora & { fecha: string })[];
  hallazgos: HallazgoBitacora[];
  puestoExiste: boolean;
  /** Lo que decía el horario cada día (YYYY-MM-DD → personas). */
  esperadoPorFecha: Record<string, EsperadoDelDia[]>;
  /** Estado del horario que cubre cada día; un día sin entrada no tiene horario. */
  horarioPorFecha: Record<string, string>;
  categorias: { codigo: CategoriaNovedad; etiqueta: string }[];
  agente: EstadoAgenteBitacoras;
}

export interface OpcionPuestoBitacora {
  contratoId: number;
  numero: string;
  objeto: string;
  entidadId: number;
  entidadNombre: string;
  puestos: { id: number; nombre: string }[];
}

export interface LecturaParaGuardar {
  puestoLeido?: string | null;
  fechas?: string[];
  registros: { fecha: string; guardia: string; horaEntrada?: string | null; horaSalida?: string | null; legible?: boolean }[];
  novedades: { fecha?: string | null; hora?: string | null; guardia?: string | null; texto: string; categoria: CategoriaNovedad }[];
}

export interface ResumenBitacoras {
  desde: string;
  hasta: string;
  totales: {
    bitacoras: number;
    conformes: number;
    aRevisar: number;
    conErrores: number;
    sinComparar: number;
    cumplimiento: number | null;
    novedades: number;
    hallazgosAbiertos: number;
    hallazgosAltos: number;
  };
  categorias: { codigo: CategoriaNovedad; etiqueta: string; cantidad: number }[];
  diasConMasNovedades: { fecha: string; cantidad: number; graves: number }[];
  porDiaSemana: { dia: string; cantidad: number }[];
  puestosConMasNovedades: { puestoId: number; puestoNombre: string; entidadNombre: string; cantidad: number }[];
  hallazgosPorTipo: { tipo: string; cantidad: number }[];
  novedadesGraves: {
    id: number;
    bitacoraId: number;
    fecha: string;
    hora: string | null;
    texto: string;
    categoria: CategoriaNovedad;
    etiqueta: string;
    gravedad: Severidad;
    puestoNombre: string;
    entidadNombre: string;
  }[];
}

export interface FiltrosBitacoras {
  entidadId?: string;
  contratoId?: string;
  puestoId?: string;
  resultado?: string;
  desde?: string;
  hasta?: string;
}
