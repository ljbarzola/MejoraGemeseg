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
  puestos: { nombre: string; tipoTurno: string; cantidadGuardias: number }[];
  personal: { cedula: string; nombreGuardia: string; puesto: string }[];
  tieneHorarioAprobado: boolean;
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

/** Fila de las bandejas "Por entregar" y "Por aprobar" (todas las entidades juntas). */
export interface CPDocumentoBandeja {
  id: number;
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
