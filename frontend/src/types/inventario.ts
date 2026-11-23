export type TipoArticulo = 'UNIFORME' | 'IMPLEMENTO' | 'MUNICION';
export type TipoMovimiento = 'ENTRADA' | 'ENTREGA' | 'DEVOLUCION' | 'BAJA' | 'AJUSTE';
export type EstadoStock = 'SIN_STOCK' | 'BAJO_MINIMO' | 'NORMAL' | 'SOBRE_MAXIMO';
export type EstadoArma = 'DISPONIBLE' | 'ASIGNADA' | 'MANTENIMIENTO' | 'BAJA';
export type EstadoPermiso = 'SIN_PERMISO' | 'VIGENTE' | 'POR_VENCER' | 'VENCIDO';
export type ClaseArma = 'PISTOLA' | 'REVOLVER' | 'ESCOPETA' | 'OTRA';
export type CategoriaArma = 'LETAL' | 'TRAUMATICA' | 'FOGUEO' | 'LETAL_MOVIL';

export const TIPOS_ARTICULO: TipoArticulo[] = ['UNIFORME', 'IMPLEMENTO', 'MUNICION'];
export const TIPO_ARTICULO_LABEL: Record<TipoArticulo, string> = {
  UNIFORME: 'Uniforme',
  IMPLEMENTO: 'Implemento',
  MUNICION: 'Munición',
};
export const TIPO_MOVIMIENTO_LABEL: Record<TipoMovimiento, string> = {
  ENTRADA: 'Entrada',
  ENTREGA: 'Entrega',
  DEVOLUCION: 'Devolución',
  BAJA: 'Baja',
  AJUSTE: 'Ajuste',
};
export const ESTADO_STOCK_LABEL: Record<EstadoStock, string> = {
  SIN_STOCK: 'Agotado',
  BAJO_MINIMO: 'Por reponer',
  NORMAL: 'Normal',
  SOBRE_MAXIMO: 'Sobre el máximo',
};
export const ESTADO_ARMA_LABEL: Record<EstadoArma, string> = {
  DISPONIBLE: 'Disponible',
  ASIGNADA: 'Asignada',
  MANTENIMIENTO: 'En mantenimiento',
  BAJA: 'De baja',
};
export const ESTADO_PERMISO_LABEL: Record<EstadoPermiso, string> = {
  SIN_PERMISO: 'Sin permiso registrado',
  VIGENTE: 'Vigente',
  POR_VENCER: 'Por vencer',
  VENCIDO: 'Vencido',
};
export const CATEGORIA_ARMA_LABEL: Record<CategoriaArma, string> = {
  LETAL: 'Letal',
  TRAUMATICA: 'Traumática',
  FOGUEO: 'De fogueo',
  LETAL_MOVIL: 'Letal móvil',
};
export const CLASE_ARMA_LABEL: Record<ClaseArma, string> = {
  PISTOLA: 'Pistola',
  REVOLVER: 'Revólver',
  ESCOPETA: 'Escopeta',
  OTRA: 'Otra',
};

export interface Articulo {
  id: number;
  tipo: TipoArticulo;
  nombre: string;
  variante: string;
  unidad: string;
  stockMinimo: number;
  stockMaximo: number | null;
  activo: boolean;
  enBodega: number;
  entregado: number;
  total: number;
  estado: EstadoStock;
  alerta: boolean;
  reponer: number;
}

export interface MovimientoInventario {
  id: number;
  articuloId: number;
  articulo: string;
  variante: string;
  tipoArticulo: TipoArticulo;
  unidad: string;
  tipo: TipoMovimiento;
  cantidad: number;
  fecha: string;
  puestoNombre: string | null;
  guardiaNombre: string | null;
  guardiaCedula: string | null;
  estadoDevuelto: 'NUEVO' | 'USADO' | 'DANADO' | null;
  motivo: string | null;
  documento: string | null;
  porNombre: string;
  createdAt: string;
}

export interface NuevoMovimiento {
  articuloId: number;
  tipo: TipoMovimiento;
  cantidad: number;
  fecha?: string;
  puestoId?: number | null;
  guardiaCedula?: string | null;
  guardiaNombre?: string | null;
  estadoDevuelto?: 'NUEVO' | 'USADO' | 'DANADO' | null;
  motivo?: string | null;
  documento?: string | null;
}

export interface Tenencia {
  articuloId: number;
  articulo: string;
  variante: string;
  tipoArticulo: TipoArticulo;
  unidad: string;
  tenedor: string;
  tenedorTipo: 'GUARDIA' | 'PUESTO';
  nombre: string;
  cedula: string | null;
  puestoNombre: string | null;
  cantidad: number;
  ultimaFecha: string | null;
}

export interface Arma {
  id: number;
  serie: string;
  clase: ClaseArma;
  marca: string | null;
  modelo: string | null;
  calibre: string | null;
  estado: EstadoArma;
  puestoId: number | null;
  puestoNombre: string | null;
  guardiaCedula: string | null;
  guardiaNombre: string | null;
  asignadaAt: string | null;
  permisoNumero: string | null;
  permisoVence: string | null;
  permiso: EstadoPermiso;
  diasParaVencer: number | null;
  notas: string | null;
  /** La nota empieza por «CORREGIR»: un dato del Excel de la carga inicial quedó con duda. */
  requiereCorreccion: boolean;
  categoria: CategoriaArma | null;
  municiones: number | null;
  ciudad: string | null;
  uso: string | null;
}

export interface EventoArma {
  id: number;
  tipo: string;
  detalle: string | null;
  puestoNombre: string | null;
  guardiaNombre: string | null;
  porNombre: string;
  createdAt: string;
}

export interface ResumenInventario {
  fecha: string;
  articulos: { total: number; porReponer: number; sobreMaximo: number };
  armas: {
    total: number;
    asignadas: number;
    disponibles: number;
    mantenimiento: number;
    permisosVencidos: number;
    permisosPorVencer: number;
    sinPermiso: number;
  };
  reposicion: {
    id: number;
    tipo: TipoArticulo;
    nombre: string;
    variante: string;
    unidad: string;
    enBodega: number;
    stockMinimo: number;
    reponer: number;
    estado: EstadoStock;
  }[];
  permisos: {
    id: number;
    serie: string;
    clase: ClaseArma;
    marca: string | null;
    modelo: string | null;
    estado: EstadoArma;
    permisoNumero: string | null;
    permisoVence: string | null;
    permiso: EstadoPermiso;
    diasParaVencer: number | null;
  }[];
}

export interface DatosArma {
  serie?: string;
  clase?: ClaseArma;
  marca?: string | null;
  modelo?: string | null;
  calibre?: string | null;
  permisoNumero?: string | null;
  permisoVence?: string | null;
  notas?: string | null;
  categoria?: CategoriaArma | null;
  municiones?: number | null;
  ciudad?: string | null;
  uso?: string | null;
}

/** Respuesta de «Importar desde Excel» (vista previa o carga hecha). */
export interface ResultadoImportacion {
  confirmado: boolean;
  avisos: string[];
  armas: {
    enElExcel: number;
    nuevas: number;
    yaRegistradas: number;
    paraCorregir: { serie: string; puesto: string | null; nota: string }[];
  };
  chalecos: {
    articulo: string;
    filasACargar: number;
    unidades: number;
    enBodega: number;
    enPuestos: number;
    filasEnCero: number;
    yaCargados: boolean;
  };
  accesorios: {
    aCargar: { nombre: string; variante: string; tipo: string; cantidad: number; yaCargado: boolean }[];
    sinCantidad: number;
  };
  /** Puestos del Excel que ya existen en la aplicación (se enlazan) y los que aún no (quedan por nombre). */
  puestos: { enlazados: string[]; sinEnlazar: string[] };
}

/** Armas y equipo de un puesto de un contrato (columna «Armas y equipo» del contrato en Operaciones). */
export interface InventarioDePuesto {
  puestoId: number;
  nombre: string;
  armas: {
    id: number;
    serie: string;
    clase: ClaseArma;
    marca: string | null;
    modelo: string | null;
    calibre: string | null;
    categoria: CategoriaArma | null;
    municiones: number | null;
    permisoVence: string | null;
    permiso: EstadoPermiso;
    requiereCorreccion: boolean;
  }[];
  equipo: { articuloId: number; articulo: string; variante: string; unidad: string; cantidad: number }[];
  totalArmas: number;
  totalEquipo: number;
}

export interface DatosArticulo {
  tipo?: TipoArticulo;
  nombre?: string;
  variante?: string;
  unidad?: string;
  stockMinimo?: number;
  stockMaximo?: number | null;
  activo?: boolean;
}
