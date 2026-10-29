/**
 * Convierte un evento de la bitácora en una frase legible en español.
 * Se calcula al LEER, no al guardar: así se pueden mejorar los textos sin
 * perder ni reescribir lo ya registrado.
 */

export interface EventoDescribible {
  fuente: string;
  modulo: string;
  accion: string;
  ruta: string | null;
  nombre: string | null;
  /** Solo EXTENSION: minutos que duró el tramo en el sitio. */
  minutos?: number | null;
}

/** «25 min», «1 h», «1 h 5 min». */
export function duracionCorta(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const MODULOS: Record<string, string> = {
  tasks: 'Tareas',
  projects: 'Proyectos',
  ventas: 'Ventas y CRM',
  personal: 'Recursos Humanos',
  cacao: 'Cacao',
  custodias: 'Custodias',
  'contratacion-publica': 'Contratación Pública',
  ai: 'Asistente',
  agents: 'Agentes',
  tools: 'Herramientas',
  users: 'Usuarios',
  companies: 'Empresas',
  sistemas: 'Sistemas',
  permissions: 'Permisos',
  admin: 'Administración',
  auth: 'Sesión',
  drive: 'Drive',
  login: 'Google',
  web: 'Navegador',
};

const RECURSOS: Record<string, string> = {
  tasks: 'tarea',
  projects: 'proyecto',
  users: 'usuario',
  companies: 'empresa',
  oportunidades: 'oportunidad',
  entrantes: 'posible cliente',
  clientes: 'cliente',
  acuerdos: 'contrato',
  contratos: 'documento',
  cotizador: 'cotización',
  cotizaciones: 'cotización',
  visitas: 'visita',
  plantillas: 'plantilla',
  agents: 'agente',
  tools: 'herramienta',
  suppliers: 'proveedor',
  clients: 'cliente',
  receptions: 'recepción',
  lots: 'lote',
  settlements: 'liquidación',
  shipments: 'embarque',
  custodias: 'custodia',
  entidades: 'entidad pública',
  entregas: 'entrega',
  bitacoras: 'bitácora',
  quejas: 'queja',
  surveys: 'encuesta',
  trainings: 'capacitación',
  ai: 'consulta al asistente',
};

const VERBOS: Record<string, string> = {
  CREAR: 'Creó',
  EDITAR: 'Editó',
  ELIMINAR: 'Eliminó',
};

// Último tramo de la ruta que cambia el verbo (POST /tasks/:id/status → «Cambió el estado de»).
const VERBOS_POR_TRAMO: Record<string, string> = {
  status: 'Cambió el estado de',
  estado: 'Cambió el estado de',
  stage: 'Cambió la etapa de',
  etapa: 'Cambió la etapa de',
  complete: 'Completó',
  completar: 'Completó',
  enviar: 'Envió',
  send: 'Envió',
  'check-in': 'Hizo check-in en',
  'check-out': 'Hizo check-out en',
};

const EVENTOS_GOOGLE: Record<string, string> = {
  login_success: 'Inició sesión en Google',
  create: 'Creó un archivo en Drive',
  edit: 'Editó un archivo en Drive',
  upload: 'Subió un archivo a Drive',
  view: 'Abrió un archivo en Drive',
  rename: 'Renombró un archivo en Drive',
  move: 'Movió un archivo en Drive',
  delete: 'Eliminó un archivo de Drive',
  trash: 'Mandó a la papelera un archivo de Drive',
  download: 'Descargó un archivo de Drive',
};

export function moduloEtiqueta(modulo: string): string {
  return MODULOS[modulo] ?? capitalizar(modulo.replace(/-/g, ' '));
}

function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function tramosDeRuta(ruta: string | null): string[] {
  return (ruta ?? '').split('/').filter((t) => t && !t.startsWith(':'));
}

/** «Editó tarea», sin el nombre del registro. */
export function describirAccion(e: EventoDescribible): string {
  if (e.fuente === 'EXTENSION') return 'Sitio web';
  if (e.fuente === 'GOOGLE') {
    return EVENTOS_GOOGLE[e.accion] ?? `Actividad en Google (${e.accion})`;
  }
  if (e.accion === 'SESION') return 'Inició sesión en app.gemeseg';
  const tramos = tramosDeRuta(e.ruta);
  const ultimo = tramos[tramos.length - 1] ?? e.modulo;
  // Si el último tramo es un verbo (tasks/:id/status), el recurso es el tramo anterior.
  const tramoRecurso =
    ultimo in VERBOS_POR_TRAMO ? tramos[tramos.length - 2] : ultimo;
  const recurso =
    RECURSOS[tramoRecurso ?? ''] ??
    RECURSOS[e.modulo] ??
    (tramoRecurso ?? e.modulo).replace(/-/g, ' ');
  const verbo =
    VERBOS_POR_TRAMO[ultimo] ?? VERBOS[e.accion] ?? 'Hizo un cambio en';
  return `${verbo} ${recurso}`;
}

/** «Editó tarea: «Informe de custodias»». */
export function describirEvento(e: EventoDescribible): string {
  const base = describirAccion(e);
  if (e.fuente === 'EXTENSION') {
    const sitio = e.nombre ? `${base}: ${e.nombre}` : base;
    return e.minutos ? `${sitio} (${duracionCorta(e.minutos)})` : sitio;
  }
  return e.nombre ? `${base}: «${e.nombre}»` : base;
}
