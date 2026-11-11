// Tipos que reflejan las entidades reales del backend
// (`backend/src/modules/contratacion-publica/**`, ver `schema.prisma`
// modelos `CP*`). No inventar campos — cualquier cambio debe empezar
// leyendo el DTO/servicio real del backend.

export interface CPEntidadPublica {
  id: number;
  nombre: string;
  ruc: string | null;
  direccion: string | null;
  /** Subcarpeta de la entidad en la carpeta raíz de Drive de Contratación Pública. */
  driveFolderId: string | null;
  /** Oculta de la lista (se ve con "Mostrar archivadas"); no borra nada. */
  archivada: boolean;
  /** Valores de los campos configurables: { "<idCampo>": valor }. */
  camposExtra: Record<string, string | number> | null;
  companyId: number;
  createdAt: string;
  updatedAt: string;
}

/** Al crear/editar una entidad: si la carpeta de Drive no se pudo crear o renombrar, viene el motivo. */
export type CPEntidadGuardada = CPEntidadPublica & { advertenciaDrive: string | null };

export const TIPOS_CAMPO_ENTIDAD = ['TEXTO', 'LISTA', 'NUMERO', 'FECHA'] as const;
export type TipoCampoEntidad = (typeof TIPOS_CAMPO_ENTIDAD)[number];

export const TIPO_CAMPO_LABEL: Record<TipoCampoEntidad, string> = {
  TEXTO: 'Texto',
  LISTA: 'Lista de opciones',
  NUMERO: 'Número',
  FECHA: 'Fecha',
};

/** Campo extra que la empresa define para sus entidades (tipo de entidad, contacto, provincia...). */
export interface CPEntidadCampo {
  id: number;
  nombre: string;
  tipo: TipoCampoEntidad;
  /** Solo en LISTA. */
  opciones: string[] | null;
  obligatorio: boolean;
  orden: number;
  activo: boolean;
}

export interface CPSyncEntidadesDrive {
  configurada: boolean;
  warning?: string;
  sincronizadoAt: string;
  /** Carpetas de Drive que no son ninguna entidad: se ofrece "Crear entidad". */
  carpetasSinEntidad: { carpetaId: string; nombre: string }[];
  /** Entidades sin carpeta en Drive: se ofrece "Crear carpeta". */
  entidadesSinCarpeta: { entidadId: number; nombre: string }[];
  renombradas: { entidadId: number; nombreSistema: string; nombreDrive: string }[];
  ausentes: { entidadId: number; nombre: string }[];
  avisos: string[];
}

export const ESTADOS_CONTRATO = ['ACTIVO', 'FINALIZADO'] as const;
export type EstadoContrato = (typeof ESTADOS_CONTRATO)[number];

export interface CPContratoAdenda {
  id: number;
  contratoId: number;
  numero: string;
  descripcion: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  archivoUrl: string | null;
  createdAt: string;
}

export interface CPContratoAdjunto {
  id: number;
  contratoId: number;
  nombre: string;
  tipo: string | null;
  filePath: string;
  createdAt: string;
}

export const TIPOS_TURNO_PUESTO = ['8H', '12H', '24H'] as const;
export type TipoTurnoPuesto = (typeof TIPOS_TURNO_PUESTO)[number];

export interface CPPuestoGuardia {
  id: number;
  puestoId: number;
  cedula: string;
  nombreGuardia: string;
  createdAt: string;
}

export interface CPPuestoServicio {
  id: number;
  companyId: number;
  contratoId: number;
  nombre: string;
  tipoTurno: string;
  cantidadGuardias: number;
  guardiasSimultaneosRequeridos: number;
  canton?: string | null;
  edificio?: string | null;
  ubicacion?: string | null;
  createdAt: string;
  updatedAt: string;
  guardias?: CPPuestoGuardia[];
}

export interface TramoPatron {
  codigoTurno: string;
  dias: number;
}

export interface GuardiaOrdenPatron {
  cedula: string;
  nombreGuardia: string;
}

export interface CPPatronRotacion {
  id: number;
  puestoId: number;
  tramos: TramoPatron[];
  coberturaSimultanea: number;
  ordenGuardias: GuardiaOrdenPatron[];
  fechaInicioCiclo: string;
  createdAt: string;
  updatedAt: string;
}

export interface PreviewPatronResultado {
  celdas: { cedula: string; nombreGuardia: string; fecha: string; codigoTurno: string }[];
  cicloLongitud: number;
  numGrupos: number;
  desfaseDias: number;
}

export interface CPContrato {
  id: number;
  companyId: number;
  entidadId: number;
  numero: string;
  objeto: string;
  referenciaProceso: string | null;
  fechaInicio: string;
  fechaFin: string;
  valorTotal: number | null;
  administradorNombre?: string | null;
  administradorCargo?: string | null;
  tipoCompra?: string | null;
  /** Día en que empieza el ciclo mensual (24 = del 24 al 23). Null o 1 = mes calendario. */
  diaCorte?: number | null;
  fechaEmisionOrden?: string | null;
  fechaAceptacionOrden?: string | null;
  fechaSuscripcionOrden?: string | null;
  plazoDias?: number | null;
  estado: string;
  contratoOrigenId: number | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  entidad?: CPEntidadPublica;
  _count?: { puestos: number };
  adendas?: CPContratoAdenda[];
  adjuntos?: CPContratoAdjunto[];
  puestos?: CPPuestoServicio[];
  contratoOrigen?: CPContrato | null;
  renovaciones?: CPContrato[];
}

export interface CPCodigoTurno {
  id: number;
  companyId: number;
  codigo: string;
  nombre: string;
  color: string | null;
  esDescanso: boolean;
  esCustodia: boolean;
  /** Ventana del turno ("07:00"–"19:00"); la usa el revisor de bitácoras. */
  horaInicio?: string | null;
  horaFin?: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export const ESTADOS_HORARIO = ['BORRADOR', 'ENVIADO', 'APROBADO', 'RECHAZADO'] as const;
export type EstadoHorario = (typeof ESTADOS_HORARIO)[number];

export interface CPHorarioCelda {
  id: number;
  horarioId: number;
  puestoId: number;
  cedula: string;
  nombreGuardia: string;
  fecha: string;
  codigoTurno: string;
  createdAt: string;
  updatedAt: string;
}

// Horario ejecutado: lo que realmente pasó (programado + faltas/reemplazos + cruce con Custodias)
export interface CPCeldaEjecutada {
  puestoId: number;
  cedula: string;
  nombre: string;
  fecha: string;
  programado: string | null;
  ejecutado: string | null;
  estado: 'IGUAL' | 'FALTO' | 'CUBRE';
  detalle: string | null;
}
export interface CPAvisoCustodia {
  tipo: 'DC_SIN_CUSTODIA' | 'CUSTODIA_SIN_DC';
  puestoId: number;
  cedula: string;
  nombre: string;
  fecha: string;
  texto: string;
}
export interface CPHorarioEjecutado {
  horarioId: number;
  rango: { inicio: string; fin: string };
  estado: string;
  puestos: { id: number; nombre: string }[];
  celdas: CPCeldaEjecutada[];
  avisos: CPAvisoCustodia[];
  resumen: { faltas: number; cubiertas: number; sinCubrir: number; avisosCustodia: number };
}

// Importar un horario desde Excel (vista previa y aplicar)
export interface CPImportGuardia {
  fila: number;
  nombre: string;
  cedula: string | null;
  estado: 'OK' | 'NO_ASIGNADO' | 'SIN_TURNOS' | 'REPETIDO';
  guardiaNombre?: string;
  celdas: number;
}
export interface CPImportPuesto {
  titulo: string;
  puestoId: number | null;
  puestoNombre: string | null;
  guardias: CPImportGuardia[];
}
export interface CPImportHorarioResultado {
  hojas: { nombre: string; puestos: number }[];
  hoja: string;
  rango: { inicio: string; fin: string };
  puestos: CPImportPuesto[];
  codigosDesconocidos: { codigo: string; veces: number }[];
  totalCeldas: number;
  avisos: string[];
  puedeAplicar: boolean;
  aplicado: boolean;
}

export interface CPHorarioMensual {
  id: number;
  companyId: number;
  contratoId: number;
  anio: number;
  mes: number;
  fechaInicio: string;
  fechaFin: string;
  estado: string;
  motivoRechazo: string | null;
  enviadoAt: string | null;
  aprobadoAt: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  contrato?: CPContrato;
  celdas?: CPHorarioCelda[];
}

export interface CPInformeMensual {
  /** Plantilla Word elegida; null = la primera. */
  plantillaId?: number | null;
  id: number;
  companyId: number;
  contratoId: number;
  horarioMensualId: number | null;
  anio: number;
  mes: number;
  retroalimentacion: string | null;
  conclusiones: string | null;
  estado: string;
  generatedPdfPath: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  contrato?: CPContrato;
  horarioMensual?: CPHorarioMensual | null;
}

export interface CPTextoInstitucional {
  id: number;
  companyId: number;
  clave: string;
  contenido: string;
  createdAt: string;
  updatedAt: string;
}

/** Una de las plantillas Word del informe (puede haber varias por empresa). */
export interface CPPlantillaInformeArchivo {
  id: number;
  nombre: string;
  updatedAt: string;
  /** La primera: la que se usa si un informe no elige otra. */
  porDefecto: boolean;
  /** Cuántos informes la tienen elegida. */
  informes: number;
}

export interface CPPlantillaInforme {
  id: number;
  companyId: number;
  driveUrl: string | null;
  docxPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CPDatosAutogeneradosInforme {
  entidad: string;
  numeroContrato: string;
  referenciaProceso: string | null;
  periodo: string;
  puestos: {
    nombre: string;
    tipoTurno: string;
    cantidadGuardias: number;
    canton?: string | null;
    edificio?: string | null;
    ubicacion?: string | null;
  }[];
  personal: { cedula: string; nombreGuardia: string; puesto: string }[];
  tieneHorarioAprobado: boolean;
  tipoCompra?: string | null;
  administradorNombre?: string | null;
  administradorCargo?: string | null;
  /** Periodo que cubre el informe: el del horario aprobado (puede cruzar de mes) o el mes calendario. */
  periodoTexto: string;
  fechaInforme: string;
  fechaInicioServicio: string;
  duracionContrato: string;
  descripcionPuestos: string;
  /** Conclusión armada con las bitácoras del periodo; null si no hay bitácoras. */
  conclusionSugerida: string | null;
  bitacorasDelPeriodo: number;
  /** Datos que faltan para que el informe salga completo. */
  faltantes: string[];
}

/** Claves sugeridas del boilerplate del informe — no es un enum cerrado
 * (ver `CLAVES_SUGERIDAS_INFORME` en el backend), cualquier clave nueva se
 * puede agregar sin migración. */
export const CLAVES_SUGERIDAS_INFORME = [
  'OBJETIVO',
  'CONDICIONES_GENERALES',
  'UNIFORME',
  'SUPERVISION',
  'EQUIPAMIENTO',
  'MATERIALES',
] as const;

// ==================== ENTREGAS DE DOCUMENTOS (otras áreas) ====================

export type CPEstadoEntrega = 'PENDIENTE' | 'ENTREGADO' | 'APROBADO' | 'RECHAZADO';

export interface CPSolicitudResumen {
  id: number;
  anio: number;
  mes: number;
  /** «24 ago – 23 sep» si el contrato va por ciclo; null si es el mes calendario. */
  periodoCiclo?: string | null;
  estado: 'BORRADOR' | 'ENVIADA';
  total: number;
  pendientes: number;
  entregadas: number;
  aprobadas: number;
  rechazadas: number;
  vencidas: number;
}

export interface CPSolicitudesDeEntidad {
  entidad: { id: number; nombre: string; driveFolderId: string | null };
  solicitudes: CPSolicitudResumen[];
}

export interface CPEntregaDocumento {
  id: number;
  nombre: string;
  descripcion: string | null;
  departmentId: number | null;
  departmentName: string | null;
  /** AAAA-MM-DD */
  fechaLimite: string;
  estado: CPEstadoEntrega;
  vencida: boolean;
  origen: 'ARCHIVO' | 'ENLACE' | null;
  url: string | null;
  motivoRechazo: string | null;
  entregadoPorNombre: string | null;
  entregadoAt: string | null;
  revisadoPorNombre: string | null;
  revisadoAt: string | null;
  responsables: { id: number; nombre: string }[];
  esMia: boolean;
  puedeEntregar: boolean;
}

export interface CPSolicitudMensual {
  id: number;
  entidadId: number;
  entidadNombre: string;
  anio: number;
  mes: number;
  periodoCiclo?: string | null;
  estado: 'BORRADOR' | 'ENVIADA';
  enviadaAt: string | null;
  entregas: CPEntregaDocumento[];
}

export interface CPCarpetaEntregas {
  driveFolderId: string;
  driveFolderName: string;
  driveFolderLink: string | null;
}

export const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export interface CPHistorialEntrega {
  id: number;
  accion: 'ENTREGADO' | 'RECHAZADO' | 'APROBADO';
  motivo: string | null;
  origen: 'ARCHIVO' | 'ENLACE' | null;
  usuarioNombre: string | null;
  createdAt: string;
}

/** Lo que dijo el Agente Revisor de Entregas de un documento. Solo sugiere: aprobar o rechazar es de una persona. */
export type CPEstadoRevisionIA = 'REVISANDO' | 'PARECE_CORRECTO' | 'REVISAR' | 'NO_LEIDO' | 'ERROR';

export interface CPRevisionIA {
  entregaId: number;
  estado: CPEstadoRevisionIA;
  /** Qué parece ser el documento (solo informativo). */
  tipoDocumento: string | null;
  resumen: string | null;
  motivos: string[];
  /** Motivo de rechazo propuesto; vacío si no hay nada que objetar. */
  mensajeRechazo: string;
  /** Por qué no se pudo revisar (NO_LEIDO / ERROR). */
  mensaje: string | null;
}

/** Fila de las bandejas "Por entregar" y "Por aprobar" (todas las entidades juntas). */
export interface CPDocumentoBandeja {
  id: number;
  periodoCiclo?: string | null;
  nombre: string;
  descripcion: string | null;
  estado: CPEstadoEntrega;
  /** AAAA-MM-DD */
  fechaLimite: string;
  vencida: boolean;
  motivoRechazo: string | null;
  solicitudId: number;
  anio: number;
  mes: number;
  entidadId: number;
  entidadNombre: string;
  // Solo en "Por aprobar":
  departmentName?: string | null;
  origen?: 'ARCHIVO' | 'ENLACE' | null;
  url?: string | null;
  entregadoPorNombre?: string | null;
  entregadoAt?: string | null;
  revisadoPorNombre?: string | null;
  revisadoAt?: string | null;
}
