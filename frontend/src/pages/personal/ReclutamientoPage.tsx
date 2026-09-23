import { useState, useEffect, useRef, lazy, Suspense, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { buildDriveFolderLink } from '../../utils/driveLink';
import { formatFechaHoraSync } from '../../utils/formatFechaHora';
import { getUser } from '../../services/auth.service';
import CopyLinkButton from '../../components/common/CopyLinkButton';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  Pin,
  Users,
  Pencil,
  Check,
  X,
  FolderOpen,
  FileText,
  AlertTriangle,
  UserCheck,
  Sparkles,
  Lock,
  Trash2,
} from 'lucide-react';
import {
  getJobPositions,
  deleteJobPosition,
  createJobPosition,
  updateJobPosition,
  syncReclutamientoCandidates,
  syncJobPositionsFromDrive,
  getDriveConfig,
  getDocumentReviews,
  reviewDocument,
  reassignReclutamientoFile,
  saveCandidatoDatos,
  contratarCandidato,
  obtenerRevisionArchivos,
  type RevisionArchivos,
} from '../../services/personal.service';
import { usePerm } from '../../contexts/PermissionsContext';
import DocumentReviewModal from '../../components/personal/DocumentReviewModal';
// Lazy a propósito: este modal arrastra pdfjs-dist (~370 kB) y solo se abre
// para los postulantes que entregaron todo en un archivo. Importado de forma
// normal, ReclutamientoPage pasaba de 43 kB a 413 kB para todos los demás.
const AnalisisArchivoUnicoModal = lazy(
  () => import('./reclutamiento/AnalisisArchivoUnicoModal'),
);
const RevisionArchivosModal = lazy(
  () => import('./reclutamiento/RevisionArchivosModal'),
);
import { REVIEW_COLORS } from '../../components/personal/reviewStatus';
import { cedulaVisible, validarDatosPostulacion, valorCampoPostulacion } from '../../utils/postulacionValidacion';

interface CampoRequerido {
  nombre: string;
  tipo?: string;
  // Si es false, el campo se muestra al candidato/RRHH pero no bloquea nada
  // por no llenarse. Por compatibilidad con datos viejos, undefined = true.
  obligatorio?: boolean;
}

interface ArchivoRequerido {
  nombre: string;
  extensiones?: string[];
  // Si es false, no cuenta en el % de Completitud del candidato aunque falte.
  // Por compatibilidad con datos viejos, undefined = true.
  obligatorio?: boolean;
}

const CAMPO_TIPOS: { value: string; label: string }[] = [
  { value: 'TEXTO', label: 'Texto' },
  { value: 'NUMERICO', label: 'Numérico' },
  { value: 'CORREO', label: 'Correo electrónico' },
  { value: 'TELEFONO', label: 'Teléfono' },
  { value: 'FECHA', label: 'Fecha' },
];
const campoTipoLabel = (tipo?: string) => CAMPO_TIPOS.find((t) => t.value === tipo)?.label || 'Texto';

const ARCHIVO_EXTENSIONES = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png'];
const FORMATOS_POR_DEFECTO_PORTAL = '.pdf, .doc, .docx, .xls, .xlsx, .jpg, .jpeg, .png';

// Apellidos va primero porque es el orden en que se arma el nombre de la
// carpeta ("Apellidos Nombres", ver nombre-persona.util en el backend).
const DEFAULT_CAMPOS: CampoRequerido[] = [
  { nombre: 'Apellidos', tipo: 'TEXTO', obligatorio: true },
  { nombre: 'Nombres', tipo: 'TEXTO', obligatorio: true },
  { nombre: 'Cédula', tipo: 'NUMERICO', obligatorio: true },
  { nombre: 'Celular', tipo: 'TELEFONO', obligatorio: true },
  { nombre: 'Email', tipo: 'CORREO', obligatorio: true },
];

// Estándar único desde 2026-09-22: la carpeta del postulante en Drive se
// llama "Apellidos Nombres", sin guion, sin cédula y sin puesto (ver
// nombre-persona.util en el backend). Por eso Apellidos y Nombres son los
// DOS únicos campos que no se pueden quitar ni volver opcionales: sin ellos
// no hay con qué nombrar la carpeta y todas las postulaciones caerían juntas.
//
// La Cédula ya NO está bloqueada: es un campo normal como Celular o Email.
// Sigue siendo la llave que une postulación ↔ ficha ↔ cumplimiento, pero
// viaja dentro de candidato.json, no en el nombre de la carpeta.
const NOMBRES_KEY = 'nombres';
const APELLIDOS_KEY = 'apellidos';

function isLockedCampo(nombre: string): boolean {
  const key = nombre.trim().toLowerCase();
  return key === NOMBRES_KEY || key === APELLIDOS_KEY;
}

function lockedCampoReason(): string {
  return 'Con Apellidos y Nombres se arma el nombre de la carpeta en Drive, no se puede quitar';
}
const DEFAULT_ARCHIVOS: ArchivoRequerido[] = [
  { nombre: 'Hoja de Vida', extensiones: ['pdf', 'doc', 'docx'], obligatorio: true },
  { nombre: 'Cédula', extensiones: ['pdf', 'jpg', 'png'], obligatorio: true },
  { nombre: 'Antecedentes Penales', extensiones: ['pdf'], obligatorio: true },
  { nombre: 'Título de Bachiller', extensiones: ['pdf', 'jpg', 'png'], obligatorio: false },
];

interface JobPosition {
  id: number;
  puesto: string;
  descripcion?: string;
  camposRequeridos: CampoRequerido[];
  archivosRequeridos: ArchivoRequerido[];
  estado: string;
  // GUARDIA | ADMINISTRATIVO — decide a qué carpeta de Drive va el postulante
  // al contratarlo. Ver DriveService.contratarCandidato.
  tipoContratacion?: string;
  createdAt: string;
  driveFileId?: string | null;
}

interface Candidate {
  id: string;
  nombre: string;
  cedula: string;
  puestoAplicado: string;
  // Heredado de la vacante a la que postuló — define el destino al contratar.
  tipoContratacion?: string;
  // Cómo entregó su documentación: 'individual' (un archivo por documento) o
  // 'archivo_unico' (todo en un PDF). Lo elige el postulante en el portal.
  modoSubida?: 'individual' | 'archivo_unico';
  completitudPercent: number;
  archivosSubidosCount: number;
  archivosRequeridosCount: number;
  archivosRequeridos: ArchivoRequerido[];
  camposRequeridos: CampoRequerido[];
  archivosSubidosList: { id: string; name: string }[];
  archivosAdicionales: { id: string; name: string }[];
  folderUrl: string;
  datosFormulario: Record<string, any>;
  telefono?: string;
  email?: string;
  documentosRechazados: number;
  documentosPendientesRevision: number;
  slots?: { nombre: string; obligatorio: boolean; driveFileId: string | null; nombreEnJson?: string | null }[];
  alertaCedula?: string | null;
}

/**
 * Deja que RRHH le diga al sistema "este archivo adicional en realidad es el
 * documento requerido X" (p. ej. la cédula subida como adicional en vez de en
 * su casilla). Renombra el archivo en Drive para que el matching automático
 * lo reconozca en la próxima sincronización.
 */
function ReassignAdicionalControl({
  file,
  faltantes,
  onDone,
}: {
  file: { id: string; name: string };
  faltantes: ArchivoRequerido[];
  onDone: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (faltantes.length === 0) return null;

  const handleAssign = async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      await reassignReclutamientoFile(file.id, selected);
      await onDone();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo reasignar el archivo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={saving}
        style={{ fontSize: '0.75rem', padding: '5px 6px', border: '1px solid #e2e8f0', borderRadius: '6px', maxWidth: '180px' }}
      >
        <option value="">Es el documento...</option>
        {faltantes.map((req) => (
          <option key={req.nombre} value={req.nombre}>{req.nombre}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selected || saving}
        onClick={handleAssign}
        style={{
          padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', border: 'none',
          background: '#3182ce', color: 'white', whiteSpace: 'nowrap',
          cursor: !selected || saving ? 'default' : 'pointer', opacity: !selected || saving ? 0.5 : 1,
        }}
      >
        {saving ? '⏳' : 'Asignar'}
      </button>
      {error && <span style={{ fontSize: '0.72rem', color: '#c53030' }}>{error}</span>}
    </div>
  );
}

/** Interruptor on/off accesible (rol switch, operable con teclado por ser un <button>). */
function Switch({ checked, onChange, label, disabled, title }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || 'Obligatorio'}
      aria-disabled={disabled}
      title={title}
      onClick={() => { if (!disabled) onChange(!checked); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px', border: 'none', background: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer', padding: '2px', font: 'inherit',
        color: checked ? 'var(--naranja)' : '#8b93a1', opacity: disabled ? 0.55 : 1,
      }}
    >
      <span
        style={{
          width: '30px', height: '17px', borderRadius: '999px', position: 'relative', flexShrink: 0,
          background: checked ? 'var(--naranja)' : 'var(--gris-claro)', transition: 'background 0.15s',
        }}
      >
        <span
          style={{
            position: 'absolute', top: '2px', left: checked ? '15px' : '2px', width: '13px', height: '13px',
            borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          }}
        />
      </span>
      {label && <span style={{ fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>}
    </button>
  );
}

/** Encabezado de sub-sección dentro de un modal, en el color propio de la app. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--azul-oscuro)', paddingBottom: '6px', borderBottom: '1px solid var(--gris-claro)' }}>
      {children}
    </div>
  );
}

// La lista de candidatos viene de Drive (no de la BD) y sincronizarla es
// costoso — lista carpetas y lee un archivo por candidato. Sin esta caché, F5
// o volver a entrar a la página siempre mostraba la lista vacía y obligaba a
// sincronizar de nuevo para ver LO MISMO que ya se había traído antes. Se
// guarda en localStorage (por empresa, para no mezclar datos si el mismo
// navegador se usa con más de una cuenta) y solo se refresca cuando RRHH pulsa
// "Sincronizar" — nunca sola. `try/catch` porque localStorage puede fallar
// (modo privado, cuota llena) sin que eso deba romper la página.
function cacheKey(sufijo: string): string {
  const companyId = getUser()?.companyId ?? 'sin-empresa';
  return `reclutamiento_${companyId}_${sufijo}`;
}

function leerCandidatosCacheados(): Candidate[] {
  try {
    const raw = localStorage.getItem(cacheKey('candidatos'));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function leerUltimaSincronizacion(): string | null {
  try {
    return localStorage.getItem(cacheKey('ultima_sincronizacion'));
  } catch {
    return null;
  }
}

function guardarCandidatos(lista: Candidate[]) {
  try {
    localStorage.setItem(cacheKey('candidatos'), JSON.stringify(lista));
  } catch {
    /* la sesión sigue; solo no sobrevive a un F5 */
  }
}

function aplicarRevisiones(
  candidato: Candidate,
  reviews: { driveFileId?: string | null; status: string }[],
): Candidate {
  const porArchivo = new Map(
    reviews.filter((r) => r.driveFileId).map((r) => [r.driveFileId as string, r.status]),
  );
  const reqs = candidato.archivosRequeridos || [];
  const slots = candidato.slots?.length
    ? candidato.slots
    : reqs.map((req) => {
        const file = candidato.archivosSubidosList.find(
          (f) =>
            !f.name.toLowerCase().endsWith('.json') &&
            f.name.toLowerCase().includes(req.nombre.toLowerCase()),
        );
        return {
          nombre: req.nombre,
          obligatorio: req.obligatorio !== false,
          driveFileId: file?.id ?? null,
        };
      });
  if (slots.length === 0) return candidato;
  let rechazados = 0;
  let pendientes = 0;
  let aprobadosObligatorios = 0;
  let presentes = 0;
  const obligatorios = slots.filter((s) => s.obligatorio);
  for (const slot of slots) {
    if (!slot.driveFileId) continue;
    presentes++;
    const status = porArchivo.get(slot.driveFileId);
    if (status === 'RECHAZADO') rechazados++;
    else if (status === 'APROBADO') {
      if (slot.obligatorio) aprobadosObligatorios++;
    } else pendientes++;
  }
  return {
    ...candidato,
    completitudPercent:
      obligatorios.length === 0
        ? 100
        : Math.min(100, Math.round((aprobadosObligatorios / obligatorios.length) * 100)),
    archivosSubidosCount: presentes,
    archivosRequeridosCount: slots.length,
    documentosRechazados: rechazados,
    documentosPendientesRevision: pendientes,
  };
}

function documentosQueImpidenContratar(
  candidato: Candidate,
  reviews: { driveFileId?: string | null; status: string }[],
): string[] {
  const reqs = (candidato.archivosRequeridos || []).filter((r) => r.obligatorio !== false);
  const motivos: string[] = [];
  for (const req of reqs) {
    const slot = candidato.slots?.find((s) => s.nombre === req.nombre);
    const file = slot
      ? candidato.archivosSubidosList.find((f) => f.id === slot.driveFileId)
      : candidato.archivosSubidosList.find(
          (f) =>
            !f.name.toLowerCase().endsWith('.json') &&
            f.name.toLowerCase().includes(req.nombre.toLowerCase()),
        );
    if (!file) {
      motivos.push(`falta "${req.nombre}"`);
      continue;
    }
    const status = reviews.find((r) => r.driveFileId === file.id)?.status;
    if (status === 'RECHAZADO') motivos.push(`"${req.nombre}" está rechazado`);
    else if (status !== 'APROBADO') motivos.push(`"${req.nombre}" todavía no está aprobado`);
  }
  return motivos;
}

function guardarCacheSincronizacion(candidatos: Candidate[]): string {
  const ahora = new Date().toISOString();
  try {
    localStorage.setItem(cacheKey('candidatos'), JSON.stringify(candidatos));
    localStorage.setItem(cacheKey('ultima_sincronizacion'), ahora);
  } catch {
    /* localStorage no disponible (modo privado, cuota llena): la sesión
       sigue funcionando, solo no sobrevive a un F5. */
  }
  return ahora;
}

export default function ReclutamientoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { canWrite } = usePerm();

  const [puestos, setPuestos] = useState<JobPosition[]>([]);
  const [candidatos, setCandidatos] = useState<Candidate[]>(leerCandidatosCacheados);
  const [ultimaSincronizacion, setUltimaSincronizacion] = useState<string | null>(leerUltimaSincronizacion);
  const [loadingPuestos, setLoadingPuestos] = useState(true);
  const [syncing, setSyncing] = useState(false);
  // hasSynced arranca en true si ya hay una sincronización guardada (de una
  // visita anterior) — así RRHH ve la última lista conocida de inmediato, sin
  // el placeholder de "aún no sincronizado" pidiendo un clic innecesario.
  const [hasSynced, setHasSynced] = useState(() => leerUltimaSincronizacion() !== null);
  const [search, setSearch] = useState('');
  const [mostrarCerradas, setMostrarCerradas] = useState(false);

  const [showPuestoModal, setShowPuestoModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState<JobPosition | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  // Revisión de documentos del candidato seleccionado (Subido vs Validado)
  const [candidateReviews, setCandidateReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [pendingReviewKey, setPendingReviewKey] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ driveFileId: string; label: string; fileName?: string } | null>(null);
  const [reviewError, setReviewError] = useState('');

  // Formulario de datos del postulante (candidato.json), editado desde el
  // "Expediente del Candidato".
  const [editingDatos, setEditingDatos] = useState(false);
  const [datosForm, setDatosForm] = useState<Record<string, string>>({});
  const [savingDatos, setSavingDatos] = useState(false);
  const [datosError, setDatosError] = useState('');

  // Marcar como Contratado: mueve la carpeta del postulante a Guardias (Sin
  // Asignar) y ya no vuelve a aparecer en esta lista. Ver DriveService.contratarCandidato.
  const [contratando, setContratando] = useState(false);
  const [contratarError, setContratarError] = useState('');
  const [confirmandoContratar, setConfirmandoContratar] = useState(false);
  const contratarErrorRef = useRef<HTMLDivElement>(null);

  // El botón "Marcar como Contratado" vive en el footer fijo del modal; si
  // RRHH ya había bajado el scroll del modal-body para revisar documentos,
  // un error que se pinta arriba del todo queda fuera de vista. Se hace
  // scrollIntoView cada vez que aparece un error nuevo.
  useEffect(() => {
    if (contratarError) {
      contratarErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [contratarError]);

  // Revisión con IA de un PDF del postulante. No está limitado al caso
  // modoSubida='archivo_unico' (ese es solo el aviso destacado, el caso más
  // común): también se puede invocar sobre cualquier PDF que haya quedado
  // como "archivo adicional" (p. ej. alguien marcó 'individual' pero en
  // realidad subió todo junto, o subió varios documentos combinados en un
  // solo PDF fuera de su casilla). `analisisDriveFileId` es undefined cuando
  // se abre desde el aviso morado (el backend detecta solo el único PDF de la
  // carpeta); si trae un id, es el archivo concreto que se pidió analizar.
  const [showAnalisisModal, setShowAnalisisModal] = useState(false);
  const [analisisDriveFileId, setAnalisisDriveFileId] = useState<string | undefined>(undefined);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionArchivos, setRevisionArchivos] = useState<RevisionArchivos | null>(null);

  const openAnalisisModal = (driveFileId?: string) => {
    setAnalisisDriveFileId(driveFileId);
    setShowAnalisisModal(true);
  };

  // New Position Form
  const [nuevoPuesto, setNuevoPuesto] = useState('');
  const [nuevaDescripcion, setNuevaDescripcion] = useState('');
  const [camposList, setCamposList] = useState<CampoRequerido[]>(DEFAULT_CAMPOS);
  const [archivosList, setArchivosList] = useState<ArchivoRequerido[]>(DEFAULT_ARCHIVOS);

  const [nuevoCampoNombre, setNuevoCampoNombre] = useState('');
  const [nuevoCampoTipo, setNuevoCampoTipo] = useState('TEXTO');
  const [nuevoCampoObligatorio, setNuevoCampoObligatorio] = useState(true);
  const [nuevoArchivoNombre, setNuevoArchivoNombre] = useState('');
  const [nuevoArchivoExts, setNuevoArchivoExts] = useState<string[]>([]);
  const [nuevoArchivoObligatorio, setNuevoArchivoObligatorio] = useState(true);
  const [nuevoEstado, setNuevoEstado] = useState('ABIERTA');
  const [nuevoTipoContratacion, setNuevoTipoContratacion] = useState('GUARDIA');
  const [savingPuesto, setSavingPuesto] = useState(false);
  const [puestoError, setPuestoError] = useState('');
  const [campoAviso, setCampoAviso] = useState('');
  const [archivoAviso, setArchivoAviso] = useState('');
  const [syncError, setSyncError] = useState('');

  // Cambiar estado (Abierta/Cerrada) de una vacante, desde su tarjeta.
  const [confirmandoEliminarVacante, setConfirmandoEliminarVacante] = useState<JobPosition | null>(null);
  const [eliminandoVacante, setEliminandoVacante] = useState(false);
  const [estadoVacanteError, setEstadoVacanteError] = useState('');
  const estadoVacanteErrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (estadoVacanteError) {
      estadoVacanteErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [estadoVacanteError]);

  const [driveFolderUrl, setDriveFolderUrl] = useState('');

  const loadPositions = () => {
    setLoadingPuestos(true);
    getJobPositions()
      .then(setPuestos)
      .catch(() => setPuestos([]))
      .finally(() => setLoadingPuestos(false));
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncError('');
    try {
      const puestosRes: any = await syncJobPositionsFromDrive();
      if (puestosRes?.created || puestosRes?.updated || puestosRes?.deleted) {
        loadPositions();
      }
      const candRes: any = await syncReclutamientoCandidates();
      if (candRes?.candidatos) {
        setCandidatos(candRes.candidatos);
        setUltimaSincronizacion(guardarCacheSincronizacion(candRes.candidatos));
      }
      const warning = candRes?.warning || puestosRes?.warning;
      if (warning) setSyncError(warning);
    } catch (err: any) {
      // No se borra la lista actual: es la última que sí se sincronizó con
      // éxito (de esta visita o de una anterior, vía caché) — un fallo
      // pasajero de Drive no debería dejar la pantalla vacía de golpe.
      setSyncError(err.response?.data?.message || 'No se pudo sincronizar con Google Drive.');
    } finally {
      setSyncing(false);
      setHasSynced(true);
    }
  };

  // Solo carga los puestos (lectura de BD, barata) al entrar. La lista de
  // candidatos vive en Drive y se trae bajo demanda con "Sincronizar", para
  // no gastar cuota de la API de Drive en cada visita a la página.
  useEffect(() => {
    loadPositions();
    getDriveConfig('RECLUTAMIENTO')
      .then((data) => {
        if (data?.driveFolderId) {
          setDriveFolderUrl(data.driveFolderLink || buildDriveFolderLink(data.driveFolderId));
        }
      })
      .catch(() => {});
  }, []);

  const handleCreatePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    setPuestoError('');
    if (!nuevoPuesto.trim()) {
      setPuestoError('El nombre del puesto es obligatorio.');
      return;
    }

    setSavingPuesto(true);
    try {
      await createJobPosition({
        puesto: nuevoPuesto.trim(),
        descripcion: nuevaDescripcion.trim() || undefined,
        camposRequeridos: camposList,
        archivosRequeridos: archivosList,
        estado: nuevoEstado,
        tipoContratacion: nuevoTipoContratacion,
      });
      setShowPuestoModal(false);
      resetForm();
      loadPositions();
    } catch (err: any) {
      setPuestoError(err.response?.data?.message || 'Error al guardar el puesto.');
    } finally {
      setSavingPuesto(false);
    }
  };

  const handleEditPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    setPuestoError('');
    if (!editingPosition) return;
    if (!nuevoPuesto.trim()) {
      setPuestoError('El nombre del puesto es obligatorio.');
      return;
    }

    setSavingPuesto(true);
    try {
      const result: any = await updateJobPosition(editingPosition.id, {
        puesto: nuevoPuesto.trim(),
        descripcion: nuevaDescripcion.trim() || undefined,
        camposRequeridos: camposList,
        archivosRequeridos: archivosList,
        estado: nuevoEstado,
        tipoContratacion: nuevoTipoContratacion,
      });
      setShowPuestoModal(false);
      setEditingPosition(null);
      resetForm();
      loadPositions();
      if (result?.driveWarning) setSyncError(result.driveWarning);
    } catch (err: any) {
      setPuestoError(err.response?.data?.message || 'Error al actualizar el puesto.');
    } finally {
      setSavingPuesto(false);
    }
  };

  const openEditModal = (p: JobPosition) => {
    setEditingPosition(p);
    setNuevoPuesto(p.puesto);
    setNuevaDescripcion(p.descripcion || '');
    setCamposList(p.camposRequeridos || []);
    setArchivosList(p.archivosRequeridos || []);
    setNuevoEstado(p.estado || 'ABIERTA');
    setNuevoTipoContratacion(p.tipoContratacion || 'GUARDIA');
    setShowPuestoModal(true);
  };

  const resetForm = () => {
    setNuevoPuesto('');
    setNuevaDescripcion('');
    setCamposList(DEFAULT_CAMPOS);
    setArchivosList(DEFAULT_ARCHIVOS);
    setNuevoEstado('ABIERTA');
    setNuevoTipoContratacion('GUARDIA');
    setNuevoCampoNombre('');
    setNuevoCampoTipo('TEXTO');
    setNuevoCampoObligatorio(true);
    setNuevoArchivoNombre('');
    setNuevoArchivoExts([]);
    setNuevoArchivoObligatorio(true);
    setPuestoError('');
    setCampoAviso('');
    setArchivoAviso('');
  };

  const addCampo = () => {
    if (!nuevoCampoNombre.trim()) {
      setCampoAviso('Escribe el nombre del dato antes de agregarlo.');
      return;
    }
    setCampoAviso('');
    setCamposList((prev) => [...prev, { nombre: nuevoCampoNombre.trim(), tipo: nuevoCampoTipo, obligatorio: nuevoCampoObligatorio }]);
    setNuevoCampoNombre('');
    setNuevoCampoTipo('TEXTO');
    setNuevoCampoObligatorio(true);
  };

  const toggleCampoObligatorio = (idx: number) => {
    setCamposList((prev) => prev.map((c, i) => (i === idx ? { ...c, obligatorio: c.obligatorio === false } : c)));
  };

  const toggleArchivoObligatorio = (idx: number) => {
    setArchivosList((prev) => prev.map((a, i) => (i === idx ? { ...a, obligatorio: a.obligatorio === false } : a)));
  };

  const addArchivo = () => {
    if (!nuevoArchivoNombre.trim()) {
      setArchivoAviso('Escribe el nombre del documento antes de agregarlo.');
      return;
    }
    setArchivoAviso('');
    setArchivosList((prev) => [...prev, { nombre: nuevoArchivoNombre.trim(), extensiones: nuevoArchivoExts, obligatorio: nuevoArchivoObligatorio }]);
    setNuevoArchivoNombre('');
    setNuevoArchivoExts([]);
    setNuevoArchivoObligatorio(true);
  };

  const toggleNuevoArchivoExt = (ext: string) => {
    setNuevoArchivoExts((prev) => (prev.includes(ext) ? prev.filter((e) => e !== ext) : [...prev, ext]));
  };

  const handleToggleEstado = async (p: JobPosition) => {
    const nuevo = p.estado === 'CERRADA' ? 'ABIERTA' : 'CERRADA';
    setEstadoVacanteError('');
    try {
      await updateJobPosition(p.id, { estado: nuevo });
      loadPositions();
    } catch {
      setEstadoVacanteError('Error al cambiar el estado de la vacante.');
    }
  };

  // Eliminar una vacante. El backend manda su carpeta de Drive a la PAPELERA
  // (no la borra definitivamente), justamente porque ahí adentro pueden vivir
  // las carpetas de candidatos que ya se postularon: si se elimina por error,
  // se recupera desde Drive. Aun así se confirma antes, y el diálogo dice
  // cuántos postulantes hay dentro para que la decisión sea informada.
  const handleEliminarVacante = async () => {
    const vacante = confirmandoEliminarVacante;
    if (!vacante) return;
    setEliminandoVacante(true);
    setEstadoVacanteError('');
    try {
      await deleteJobPosition(vacante.id);
      setConfirmandoEliminarVacante(null);
      loadPositions();
      setCandidatos((prev) => {
        const next = prev.filter((c) => c.puestoAplicado !== vacante.puesto);
        guardarCandidatos(next);
        return next;
      });
    } catch (err: any) {
      setConfirmandoEliminarVacante(null);
      setEstadoVacanteError(
        err.response?.data?.message || 'No se pudo eliminar la vacante. Inténtalo de nuevo.',
      );
    } finally {
      setEliminandoVacante(false);
    }
  };

  // Postulantes ya sincronizados que apuntan a esta vacante, para avisar en el
  // diálogo. Solo cuenta lo que se trajo en la última sincronización.
  const contarCandidatosDe = (vacante: JobPosition) =>
    candidatos.filter((c) => c.puestoAplicado === vacante.puesto).length;

  const openCandidateModal = (c: Candidate) => {
    setSelectedCandidate(c);
    setRevisionArchivos(null);
    setReviewError('');
    setLoadingReviews(true);
    getDocumentReviews(c.cedula)
      .then((reviews: any[]) => setCandidateReviews(reviews || []))
      .catch(() => setCandidateReviews([]))
      .finally(() => setLoadingReviews(false));
    obtenerRevisionArchivos(c.id)
      .then((rev) => setRevisionArchivos(rev.success ? rev : null))
      .catch(() => setRevisionArchivos(null));
  };

  const closeCandidateModal = () => {
    setSelectedCandidate(null);
    setCandidateReviews([]);
    setReviewError('');
    setEditingDatos(false);
    setDatosError('');
    setContratarError('');
    setShowAnalisisModal(false);
    setAnalisisDriveFileId(undefined);
    setShowRevisionModal(false);
    setRevisionArchivos(null);
  };

  const sendReview = async (driveFileId: string, fileName: string | undefined, status: 'APROBADO' | 'RECHAZADO', reason?: string) => {
    if (!selectedCandidate) return;
    setPendingReviewKey(driveFileId);
    setReviewError('');
    try {
      await reviewDocument({ cedula: selectedCandidate.cedula, driveFileId, fileName, status, reason });
      const reviews = await getDocumentReviews(selectedCandidate.cedula);
      setCandidateReviews(reviews || []);
      setRejectTarget(null);
      setCandidatos((prev) => {
        const next = prev.map((c) =>
          c.id === selectedCandidate.id ? aplicarRevisiones(c, reviews || []) : c,
        );
        guardarCandidatos(next);
        return next;
      });
      setSelectedCandidate((prev) => (prev ? aplicarRevisiones(prev, reviews || []) : prev));
    } catch (err: any) {
      setReviewError(err.response?.data?.message || 'No se pudo guardar la revisión.');
    } finally {
      setPendingReviewKey(null);
    }
  };

  // Tras reasignar un archivo adicional o guardar datos del postulante, se
  // vuelve a sincronizar con Drive (el matching/los datos se recalculan ahí)
  // y se refresca tanto la lista como el candidato abierto en el modal.
  const refreshCandidatos = async () => {
    try {
      const candRes: any = await syncReclutamientoCandidates();
      if (candRes?.candidatos) {
        setCandidatos(candRes.candidatos);
        setUltimaSincronizacion(guardarCacheSincronizacion(candRes.candidatos));
        setSelectedCandidate((prev) =>
          prev ? candRes.candidatos.find((c: Candidate) => c.id === prev.id) || prev : prev,
        );
      }
    } catch {
      // Si la resincronización falla, el usuario puede reintentar con
      // "Sincronizar"; no bloqueamos el flujo por esto.
    }
  };

  // Mueve la carpeta del postulante a Guardias (Sin Asignar) y sincroniza de
  // inmediato — al terminar, ya no aparece en esta lista.
  const handleContratar = () => {
    if (!selectedCandidate) return;
    if (loadingReviews) {
      setContratarError('Espera a que carguen las revisiones de los documentos.');
      return;
    }
    const motivos = documentosQueImpidenContratar(selectedCandidate, candidateReviews);
    if (motivos.length > 0) {
      setContratarError(
        `No se puede contratar mientras haya documentos obligatorios pendientes o rechazados: ${motivos.join('; ')}.`,
      );
      return;
    }
    setContratarError('');
    setConfirmandoContratar(true);
  };

  const confirmarContratar = async () => {
    if (!selectedCandidate) return;
    const contratadoId = selectedCandidate.id;
    setConfirmandoContratar(false);
    setContratando(true);
    setContratarError('');
    try {
      await contratarCandidato(contratadoId);
      closeCandidateModal();
      // Se saca de la lista al instante: Drive tiene consistencia eventual,
      // así que una resincronización pedida justo después de mover la
      // carpeta puede devolver todavía al candidato en su vacante de
      // origen. Se filtra localmente ya mismo y, cuando la resincronización
      // en segundo plano termine, se vuelve a filtrar por si esa respuesta
      // también llegó desactualizada.
      const quitarContratado = (lista: Candidate[]) => {
        const next = lista.filter((c) => c.id !== contratadoId);
        guardarCandidatos(next);
        return next;
      };
      setCandidatos(quitarContratado);
      refreshCandidatos()
        .then(() => setCandidatos(quitarContratado))
        .catch(() => {});
    } catch (err: any) {
      setContratarError(err.response?.data?.message || 'No se pudo contratar al candidato.');
    } finally {
      setContratando(false);
    }
  };

  // Valor a mostrar/precargar para un campoRequerido: primero lo ya guardado
  // en datosFormulario (candidato.json); si aún no existe, se apoya en los
  // datos ya inferidos del candidato (nombre/cédula/teléfono/email) para no
  // hacer retipear a RRHH lo que ya se conoce.
  const getCampoValor = (candidate: Candidate, campo: CampoRequerido): string => {
    const guardado = valorCampoPostulacion(candidate.datosFormulario, campo.nombre);
    if (guardado) return guardado;
    const key = campo.nombre.toLowerCase();
    if (key.includes('nombre')) return candidate.nombre || '';
    if (key.includes('cédula') || key.includes('cedula')) return candidate.cedula || '';
    if (key.includes('teléfono') || key.includes('telefono') || key.includes('celular')) return candidate.telefono || '';
    if (key.includes('correo') || key.includes('email')) return candidate.email || '';
    return '';
  };

  const openDatosEditor = () => {
    if (!selectedCandidate) return;
    const initial: Record<string, string> = {};
    (selectedCandidate.camposRequeridos || []).forEach((campo) => {
      initial[campo.nombre] = getCampoValor(selectedCandidate, campo);
    });
    setDatosForm(initial);
    setDatosError('');
    setEditingDatos(true);
  };

  const handleSaveDatos = async () => {
    if (!selectedCandidate) return;
    const errores = validarDatosPostulacion(datosForm, selectedCandidate.camposRequeridos || []);
    if (errores.length > 0) {
      setDatosError(errores.join(' '));
      return;
    }
    setSavingDatos(true);
    setDatosError('');
    try {
      await saveCandidatoDatos(selectedCandidate.id, datosForm);
      setEditingDatos(false);
      await refreshCandidatos();
    } catch (err: any) {
      setDatosError(err.response?.data?.message || 'No se pudo guardar los datos del postulante.');
    } finally {
      setSavingDatos(false);
    }
  };

  const filteredCandidates = candidatos.filter(
    (c) =>
      c.nombre.toLowerCase().includes(search.toLowerCase()) ||
      c.cedula.includes(search) ||
      c.puestoAplicado.toLowerCase().includes(search.toLowerCase())
  );

  const vacantesAbiertas = puestos.filter((p) => p.estado !== 'CERRADA');
  const vacantesCerradas = puestos.filter((p) => p.estado === 'CERRADA');
  const visiblePuestos = mostrarCerradas ? puestos : vacantesAbiertas;

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/rrhh')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>

        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">RECURSOS HUMANOS</p>
            <h1>Reclutamiento y Vacantes</h1>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <div className="header-actions">
              <button className="btn-secondary" onClick={handleSyncAll} disabled={syncing}>
                <RefreshCw size={16} className={syncing ? 'spin' : undefined} />
                {syncing ? 'Sincronizando...' : 'Sincronizar'}
              </button>
              {driveFolderUrl && (
                <a
                  className="btn-secondary"
                  href={driveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir la carpeta de postulantes en Google Drive"
                >
                  <FolderOpen size={16} /> Ver carpeta
                </a>
              )}
            </div>
            {/* La lista de candidatos se guarda localmente al sincronizar, así
                que recargar la página o volver a entrar no la borra ni obliga
                a sincronizar de nuevo — este texto es lo que le dice a RRHH
                qué tan vieja es la lista que está viendo. */}
            {ultimaSincronizacion && (
              <span style={{ fontSize: '0.75rem', color: '#718096' }}>
                Última sincronización: {formatFechaHoraSync(ultimaSincronizacion)}
              </span>
            )}
          </div>
        </div>
      </div>

      {syncError && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{syncError}</div>
      )}

      {estadoVacanteError && (
        <div ref={estadoVacanteErrorRef} style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{estadoVacanteError}</div>
      )}

      {/* SECTION 1: VACANTES / PUESTOS DE TRABAJO */}
      <div className="admin-section" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 700, color: 'var(--azul-oscuro)', margin: 0 }}>
            <Pin size={16} /> Vacantes Creadas ({visiblePuestos.length})
          </h2>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {vacantesCerradas.length > 0 && (
              <button
                onClick={() => setMostrarCerradas((v) => !v)}
                className="btn-secondary"
                style={{ padding: '6px 14px', fontSize: '0.78rem' }}
              >
                {mostrarCerradas ? 'Ocultar cerradas' : `Mostrar cerradas (${vacantesCerradas.length})`}
              </button>
            )}
            <button
              className="auth-btn"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '0.78rem' }}
              onClick={() => { resetForm(); setEditingPosition(null); setShowPuestoModal(true); }}
            >
              <Plus size={15} /> Nueva Vacante
            </button>
          </div>
        </div>

        <p style={{ fontSize: '0.78rem', color: '#a0aec0', margin: '0 0 14px', fontStyle: 'italic' }}>
          ¿Ya no necesitas una vacante? Márcala como "Cerrada".
        </p>

        {loadingPuestos ? (
          <div className="loading-state">Cargando puestos...</div>
        ) : visiblePuestos.length === 0 ? (
          <div className="empty-state">
            {puestos.length === 0 ? (
              <>No hay puestos creados. Haz clic en <strong>"+ Nueva Vacante"</strong> para publicar uno.</>
            ) : (
              'No hay vacantes abiertas. Activa "Mostrar cerradas" para ver las anteriores.'
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '16px' }}>
            {visiblePuestos.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: '16px',
                  background: '#f8fafc',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  opacity: p.estado === 'CERRADA' ? 0.7 : 1,
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--azul-oscuro)' }}>{p.puesto}</div>
                      <button
                        onClick={() => handleToggleEstado(p)}
                        title="Clic para cambiar el estado"
                        className="status-badge"
                        style={{
                          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          background: p.estado === 'CERRADA' ? '#fed7d7' : '#c6f6d5',
                          color: p.estado === 'CERRADA' ? '#c53030' : '#276749',
                        }}
                      >
                        ● {p.estado === 'CERRADA' ? 'Cerrada' : 'Abierta'}
                      </button>
                      {/* Destino al contratar. Se muestra solo en las vacantes
                          administrativas: Guardia es el default y marcarlo en
                          todas las demás sería ruido. */}
                      {p.tipoContratacion === 'ADMINISTRATIVO' && (
                        <span className="status-badge" style={{ background: '#e9d8fd', color: '#553c9a' }} title="Al contratar, el postulante entra a Personal Administrativo">
                          Administrativo
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => openEditModal(p)}
                        style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', padding: '4px' }}
                        title="Editar vacante"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => { setEstadoVacanteError(''); setConfirmandoEliminarVacante(p); }}
                        style={{ background: 'none', border: 'none', color: '#c53030', cursor: 'pointer', display: 'flex', padding: '4px' }}
                        title="Eliminar vacante"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {p.descripcion && <p style={{ fontSize: '0.82rem', color: '#4a5568', marginBottom: '10px' }}>{p.descripcion}</p>}

                  <div style={{ fontSize: '0.78rem', color: '#718096', marginBottom: '6px' }}>
                    <strong>Formulario ({p.camposRequeridos?.length || 0}):</strong>{' '}
                    {p.camposRequeridos?.length
                      ? p.camposRequeridos.map((c) => `${c.nombre} (${campoTipoLabel(c.tipo)})${c.obligatorio === false ? ' [opcional]' : ''}`).join(', ')
                      : 'Ninguno'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#718096' }}>
                    <strong>Archivos Requeridos ({p.archivosRequeridos?.length || 0}):</strong>{' '}
                    {p.archivosRequeridos?.length
                      ? p.archivosRequeridos
                          .map((a) => {
                            const base = a.extensiones?.length ? `${a.nombre} (${a.extensiones.map((e) => '.' + e).join(', ')})` : a.nombre;
                            return a.obligatorio === false ? `${base} [opcional]` : base;
                          })
                          .join(', ')
                      : 'Ninguno'}
                  </div>
                </div>

                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', fontSize: '0.7rem', display: 'flex', justifyContent: 'space-between' }}>
                  {p.driveFileId ? (
                    <span style={{ color: '#a0aec0' }}>Sincronizado con Drive JSON</span>
                  ) : (
                    <span style={{ color: '#c53030', fontWeight: 600 }}>⚠ No sincronizado con Drive</span>
                  )}
                  <span style={{ color: '#a0aec0' }}>{new Date(p.createdAt).toLocaleDateString('es-EC')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: CANDIDATOS POSTULADOS */}
      <div className="admin-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: 700, color: 'var(--azul-oscuro)', margin: 0 }}>
            <Users size={16} /> Candidatos Postulados ({search.trim() ? `${filteredCandidates.length} de ${candidatos.length}` : candidatos.length})
          </h2>
          <input
            type="text"
            placeholder="Buscar por nombre, cédula o puesto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '8px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.85rem', width: '280px' }}
          />
        </div>

        {syncing ? (
          <div className="loading-state">Sincronizando carpetas de candidatos desde Google Drive Reclutamiento...</div>
        ) : !hasSynced ? (
          <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <span>Pulsa "Sincronizar" para traer los candidatos postulados desde Google Drive.</span>
            <button className="btn-secondary" onClick={handleSyncAll} disabled={syncing}>
              <RefreshCw size={16} /> Sincronizar ahora
            </button>
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="empty-state">
            {search.trim()
              ? 'Ningún candidato coincide con la búsqueda.'
              : 'No hay candidatos postulados en la carpeta Reclutamiento de Google Drive.'}
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Candidato</th>
                  <th>Cédula</th>
                  <th>Puesto Aplicado</th>
                  <th style={{ minWidth: '150px' }}>Documentos</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map((c) => (
                  <tr key={c.id || c.cedula}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>{c.nombre}</div>
                      {c.alertaCedula && (
                        <div style={{ fontSize: '0.72rem', color: '#c53030', marginTop: '2px' }}>{c.alertaCedula}</div>
                      )}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{cedulaVisible(c.cedula)}</td>
                    <td>
                      <span style={{ padding: '3px 10px', borderRadius: '6px', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: '0.78rem', fontWeight: 700 }}>
                        {c.puestoAplicado}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, background: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden', minWidth: '50px' }}>
                          <div
                            style={{
                              width: `${c.completitudPercent}%`,
                              background: c.completitudPercent === 100 ? '#22c55e' : c.completitudPercent >= 50 ? '#3b82f6' : '#d97706',
                              height: '100%',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--azul-oscuro)', whiteSpace: 'nowrap' }}>
                          {c.archivosSubidosCount}/{c.archivosRequeridosCount || '—'}
                        </span>
                      </div>
                    </td>
                    <td>
                      {c.documentosRechazados > 0 ? (
                        <span className="status-badge" style={{ background: '#fed7d7', color: '#c53030', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <AlertTriangle size={12} /> {c.documentosRechazados} rechazado{c.documentosRechazados > 1 ? 's' : ''}
                        </span>
                      ) : c.documentosPendientesRevision > 0 ? (
                        <span className="status-badge" style={{ background: '#fefcbf', color: '#975a16' }}>
                          {c.documentosPendientesRevision} por revisar
                        </span>
                      ) : c.completitudPercent === 100 ? (
                        <span className="status-badge" style={{ background: '#c6f6d5', color: '#276749' }}>
                          Completo
                        </span>
                      ) : (
                        <span style={{ color: '#a0aec0', fontSize: '0.78rem' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => openCandidateModal(c)}
                        style={{
                          padding: '6px 14px',
                          background: 'var(--azul-oscuro)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                        }}
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DETALLE CANDIDATO */}
      {selectedCandidate && (
        <div className="modal-overlay" onClick={closeCandidateModal}>
          <div className="modal" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Expediente del Candidato</h3>
                <p style={{ margin: '2px 0 0', color: '#718096', fontSize: '0.85rem' }}>Puesto: <strong>{selectedCandidate.puestoAplicado}</strong></p>
              </div>
              <button className="modal-close" onClick={closeCandidateModal}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {contratarError && (
                <div className="auth-error-banner" ref={contratarErrorRef}>{contratarError}</div>
              )}

              {/* El postulante entregó TODO en un solo archivo (lo eligió él en
                  el portal de postulación). Se ofrece separarlo con ayuda de
                  IA; mientras no se separe, el checklist de abajo lo va a ver
                  casi todo como faltante, porque matchea por nombre de archivo. */}
              {selectedCandidate.modoSubida === 'archivo_unico' && (
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                    padding: '12px 14px', marginBottom: '12px', borderRadius: '8px',
                    background: '#faf5ff', border: '1px solid #d6bcfa',
                  }}
                >
                  <strong style={{ flex: '1 1 260px', fontSize: '0.85rem', color: '#553c9a' }}>
                    Entregó todo en un solo archivo
                  </strong>
                  {/* El "para qué sirve" va como tooltip del botón, no como
                      párrafo aparte: el botón ya es genérico (funciona sobre
                      cualquier PDF, también los de "Archivos Adicionales" más
                      abajo), así que un texto fijo aquí sonaría a que la
                      función es exclusiva de este aviso. */}
                  {canWrite('RRHH') && (
                    <button
                      type="button"
                      onClick={() => openAnalisisModal(undefined)}
                      title="La IA identifica qué documento está en cada página, para que las revises y confirmes su separación"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                        border: '1px solid #d6bcfa', background: '#fff', color: '#6b46c1', cursor: 'pointer',
                      }}
                    >
                      <Sparkles size={13} /> Analizar con IA
                    </button>
                  )}
                </div>
              )}

              <div className="candidate-modal-grid">
                {/* FICHA DE IDENTIDAD + COMPLETITUD */}
                <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px', height: 'fit-content' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700, textTransform: 'uppercase' }}>Datos del Postulante</div>
                    {canWrite('RRHH') && !editingDatos && selectedCandidate.camposRequeridos?.length > 0 && (
                      <button
                        type="button"
                        onClick={openDatosEditor}
                        style={{ display: 'flex', alignItems: 'center', gap: '3px', border: 'none', background: 'none', color: 'var(--azul-claro)', cursor: 'pointer', fontSize: '0.72rem', textDecoration: 'underline', padding: 0 }}
                      >
                        <Pencil size={11} /> Editar
                      </button>
                    )}
                  </div>

                  {datosError && <div style={{ fontSize: '0.75rem', color: '#c53030' }}>{datosError}</div>}

                  {editingDatos ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {selectedCandidate.camposRequeridos.map((campo) => (
                        <label key={campo.nombre} style={{ fontSize: '0.72rem', color: '#718096', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          {campo.nombre}{campo.obligatorio !== false && <span style={{ color: '#c53030' }}> *</span>}
                          <input
                            type={campo.tipo === 'TELEFONO' ? 'tel' : campo.tipo === 'FECHA' ? 'date' : 'text'}
                            inputMode={campo.tipo === 'CORREO' ? 'email' : undefined}
                            value={datosForm[campo.nombre] || ''}
                            onChange={(e) => setDatosForm((prev) => ({ ...prev, [campo.nombre]: e.target.value }))}
                            style={{ fontSize: '0.82rem', padding: '5px 7px', border: '1px solid #e2e8f0', borderRadius: '6px' }}
                          />
                        </label>
                      ))}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        <button
                          type="button"
                          disabled={savingDatos}
                          onClick={handleSaveDatos}
                          style={{ flex: 1, padding: '6px 10px', fontSize: '0.78rem', border: 'none', borderRadius: '6px', background: '#276749', color: 'white', cursor: savingDatos ? 'default' : 'pointer', opacity: savingDatos ? 0.6 : 1 }}
                        >
                          {savingDatos ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDatos(false)}
                          style={{ padding: '6px 10px', fontSize: '0.78rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', color: '#4a5568', cursor: 'pointer' }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : selectedCandidate.camposRequeridos?.length > 0 ? (
                    selectedCandidate.camposRequeridos.map((campo) => {
                      const valor = getCampoValor(selectedCandidate, campo);
                      const esObligatorio = campo.obligatorio !== false;
                      return (
                        <div key={campo.nombre}>
                          <div style={{ fontSize: '0.7rem', color: '#718096', fontWeight: 700 }}>
                            {campo.nombre.toUpperCase()}
                            {esObligatorio && <span style={{ color: '#c53030' }}> *</span>}
                          </div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: valor ? 'var(--azul-oscuro)' : esObligatorio ? '#e53e3e' : '#a0aec0' }}>
                            {valor || (esObligatorio ? 'Falta' : 'Sin dato')}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#718096', fontWeight: 700 }}>NOMBRE COMPLETO</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>{selectedCandidate.nombre}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#718096', fontWeight: 700 }}>CÉDULA</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'monospace' }}>{cedulaVisible(selectedCandidate.cedula)}</div>
                        {selectedCandidate.alertaCedula && (
                          <div style={{ fontSize: '0.78rem', color: '#c53030', marginTop: '4px' }}>{selectedCandidate.alertaCedula}</div>
                        )}
                      </div>
                    </>
                  )}

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ fontSize: '0.7rem', color: '#718096', fontWeight: 700 }}>COMPLETITUD</div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: selectedCandidate.completitudPercent === 100 ? '#22c55e' : '#3b82f6' }}>
                        {selectedCandidate.completitudPercent}%
                      </span>
                    </div>
                    <div style={{ width: '100%', background: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${selectedCandidate.completitudPercent}%`,
                          background: selectedCandidate.completitudPercent === 100 ? '#22c55e' : '#3b82f6',
                          height: '100%',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* LISTA DE ARCHIVOS SOLICITADOS: SUBIDO + VALIDADO POR RRHH */}
                <div>
                  <h4 style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)', flexWrap: 'wrap' }}>
                    <FolderOpen size={15} /> Archivos Requeridos para el Puesto ({selectedCandidate.archivosRequeridosCount})
                    {loadingReviews && <span style={{ fontWeight: 400, fontSize: '0.75rem', color: '#a0aec0' }}>cargando validaciones...</span>}
                    {canWrite('RRHH') && (
                      ((selectedCandidate.slots || []).some((s) => s.driveFileId) ||
                        selectedCandidate.archivosAdicionales.length > 0) && (
                        <button
                          type="button"
                          onClick={() => setShowRevisionModal(true)}
                          title="Revisa si cada archivo subido es el documento que se pidió, y dice qué es cada adicional"
                          style={{
                            marginLeft: 'auto',
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
                            border: '1px solid #d6bcfa', background: '#faf5ff', color: '#6b46c1', cursor: 'pointer',
                          }}
                        >
                          <Sparkles size={12} /> Revisar con IA
                        </button>
                      )
                    )}
                  </h4>

                  {reviewError && (
                    <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', fontSize: '0.8rem' }}>{reviewError}</div>
                  )}

                  {selectedCandidate.archivosRequeridos?.length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: '#718096', margin: 0 }}>No hay requerimientos específicos creados para este puesto.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 84px 120px', gap: '10px', padding: '0 12px', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#a0aec0' }}>
                        <span>Archivo</span>
                        <span>Subido</span>
                        <span>Revisión</span>
                      </div>
                      {selectedCandidate.archivosRequeridos.map((req) => {
                        const slot = selectedCandidate.slots?.find((s) => s.nombre === req.nombre);
                        const file = slot
                          ? selectedCandidate.archivosSubidosList.find((f) => f.id === slot.driveFileId)
                          : selectedCandidate.archivosSubidosList.find(
                              (f) => !f.name.toLowerCase().endsWith('.json') && f.name.toLowerCase().includes(req.nombre.toLowerCase()),
                            );
                        const review = file ? candidateReviews.find((r) => r.driveFileId === file.id) : null;
                        const revisionReq = file
                          ? revisionArchivos?.requeridos?.find((r) => r.driveFileId === file.id && r.requisito === req.nombre)
                          : undefined;
                        const reviewColor = REVIEW_COLORS[review?.status || 'PENDIENTE'];
                        const busy = !!file && pendingReviewKey === file.id;
                        const fileExt = file ? file.name.split('.').pop()?.toLowerCase() : undefined;
                        const extensionValida = !file || !req.extensiones?.length || (!!fileExt && req.extensiones.includes(fileExt));
                        const esObligatorio = req.obligatorio !== false;
                        return (
                          <div key={req.nombre} style={{ padding: '10px 12px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 84px 120px', gap: '10px', alignItems: 'center' }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                  {req.nombre}
                                  {esObligatorio && <span style={{ color: '#c53030', marginLeft: '3px' }}>*</span>}
                                  {!esObligatorio && <span style={{ color: '#a0aec0', fontWeight: 400, fontSize: '0.72rem', marginLeft: '4px' }}>(opcional)</span>}
                                </div>
                                {file ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#718096', marginTop: '2px', minWidth: 0 }} title={file.name}>
                                    <FileText size={11} style={{ flexShrink: 0 }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                  </div>
                                ) : slot?.nombreEnJson ? (
                                  <div style={{ fontSize: '0.72rem', color: '#975a16', marginTop: '2px' }} title={slot.nombreEnJson}>
                                    {slot.nombreEnJson}
                                  </div>
                                ) : req.extensiones?.length ? (
                                  <div style={{ fontSize: '0.72rem', color: '#a0aec0', marginTop: '2px' }}>
                                    Acepta: {req.extensiones.map((e) => '.' + e).join(', ')}
                                  </div>
                                ) : null}
                              </div>
                              <div>
                                {file ? (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#16a34a', fontWeight: 700, fontSize: '0.76rem' }}>
                                    <Check size={13} /> Subido
                                  </span>
                                ) : slot?.nombreEnJson ? (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#975a16', fontWeight: 700, fontSize: '0.76rem' }} title={slot.nombreEnJson}>
                                    En el JSON
                                  </span>
                                ) : esObligatorio ? (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#dc2626', fontWeight: 700, fontSize: '0.76rem' }}>
                                    <X size={13} /> Falta
                                  </span>
                                ) : (
                                  <span style={{ color: '#a0aec0', fontSize: '0.76rem' }}>Opcional</span>
                                )}
                              </div>
                              <div>
                                {file ? (
                                  <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: reviewColor.bg, color: reviewColor.fg, whiteSpace: 'nowrap' }}>
                                    {review?.status || 'PENDIENTE'}
                                  </span>
                                ) : (
                                  <span style={{ color: '#cbd5e0', fontSize: '0.76rem' }}>—</span>
                                )}
                              </div>
                            </div>
                            {file && !extensionValida && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#c05621', marginTop: '6px' }}>
                                <AlertTriangle size={12} /> Extensión no esperada — se pidió: {req.extensiones!.map((e) => '.' + e).join(', ')}
                              </div>
                            )}
                            {review?.status === 'RECHAZADO' && review.reason && (
                              <div style={{ fontSize: '0.78rem', color: '#c53030', marginTop: '6px' }}>Motivo: {review.reason}</div>
                            )}
                            {revisionReq?.confianza && (
                              <div style={{ fontSize: '0.75rem', marginTop: '6px', color: '#553c9a' }}>
                                IA: {revisionReq.confianza}{revisionReq.probabilidad != null ? ` ${revisionReq.probabilidad}%` : ''}
                                {revisionReq.notas ? ` — ${revisionReq.notas}` : ''}
                              </div>
                            )}
                            {file && canWrite('RRHH') && (
                              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                                <button
                                  disabled={busy}
                                  onClick={() => sendReview(file.id, file.name, 'APROBADO')}
                                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', border: 'none', background: '#276749', color: 'white', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
                                >
                                  <Check size={13} /> Validar
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() => setRejectTarget({ driveFileId: file.id, label: req.nombre, fileName: file.name })}
                                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '6px', fontSize: '0.75rem', border: 'none', background: '#c53030', color: 'white', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
                                >
                                  <X size={13} /> Rechazar
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedCandidate.archivosAdicionales?.length > 0 && (
                    <div style={{ marginTop: '20px' }}>
                      <h4 style={{ margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 700, color: '#b7791f' }}>
                        <AlertTriangle size={15} /> Archivos Adicionales ({selectedCandidate.archivosAdicionales.length})
                      </h4>
                      <p style={{ fontSize: '0.78rem', color: '#718096', margin: '0 0 10px' }}>
                        El postulante subió estos archivos pero no coinciden con ningún documento requerido. Si alguno es en realidad uno de los que falta (ej. la cédula subida por error como adicional), asígnalo abajo.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {selectedCandidate.archivosAdicionales.map((file) => {
                          const faltantes = selectedCandidate.archivosRequeridos.filter(
                            (req) =>
                              !selectedCandidate.archivosSubidosList.some((f) =>
                                f.name.toLowerCase().includes(req.nombre.toLowerCase()),
                              ),
                          );
                          const esPdf = file.name.toLowerCase().endsWith('.pdf');
                          const descripcionIa = revisionArchivos?.adicionales?.find((a) => a.driveFileId === file.id)?.descripcion;
                          return (
                            <div key={file.id} style={{ padding: '10px 12px', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fefcbf' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#975a16' }}>
                                  <FileText size={13} /> {file.name}
                                </div>
                                {/* No depende de modoSubida: cualquier PDF que
                                    haya quedado sin coincidir con un requisito
                                    puede en realidad contener varios documentos
                                    combinados (alguien marcó "individual" pero
                                    subió todo junto, o mezcló documentos aquí
                                    por error). RRHH puede pedir el mismo
                                    análisis sobre ESTE archivo puntual. */}
                                {esPdf && canWrite('RRHH') && (
                                  <button
                                    type="button"
                                    onClick={() => openAnalisisModal(file.id)}
                                    title="Revisar con IA si este archivo contiene más de un documento"
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                                      padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600,
                                      border: '1px solid #d6bcfa', background: '#faf5ff', color: '#6b46c1', cursor: 'pointer',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    <Sparkles size={11} /> Analizar con IA
                                  </button>
                                )}
                              </div>
                              {descripcionIa && (
                                <div style={{ fontSize: '0.78rem', color: '#553c9a', marginTop: '6px' }}>{descripcionIa}</div>
                              )}
                              {canWrite('RRHH') && (
                                <ReassignAdicionalControl file={file} faltantes={faltantes} onDone={refreshCandidatos} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-actions">
              {canWrite('RRHH') && (
                <button
                  onClick={handleContratar}
                  disabled={contratando}
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: 'auto' }}
                >
                  <UserCheck size={16} /> {contratando ? 'Contratando...' : 'Marcar como Contratado'}
                </button>
              )}
              <button onClick={closeCandidateModal} className="btn-secondary">
                Cerrar
              </button>
              <button
                onClick={() => window.open(selectedCandidate.folderUrl, '_blank')}
                className="auth-btn"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <FolderOpen size={16} /> Ver Carpeta en Drive
              </button>
              <CopyLinkButton url={selectedCandidate.folderUrl} title="Copiar enlace de la carpeta" />
            </div>
          </div>
        </div>
      )}

      {confirmandoContratar && selectedCandidate && (
        <ConfirmDialog
          title="Marcar como Contratado"
          message={
            selectedCandidate.tipoContratacion === 'ADMINISTRATIVO'
              ? `Se moverá la carpeta de Drive de "${selectedCandidate.nombre}" a Personal Administrativo, renombrándola a "${selectedCandidate.nombre}" (solo apellidos y nombres; el puesto queda guardado en su ficha), y dejará de aparecer en Candidatos Postulados. ¿Continuar?`
              : `Se moverá la carpeta de Drive de "${selectedCandidate.nombre}" a Guardias (carpeta "Sin Asignar", todavía sin entidad) y dejará de aparecer en Candidatos Postulados. ¿Continuar?`
          }
          confirmLabel="Sí, marcar como contratado"
          onConfirm={confirmarContratar}
          onCancel={() => setConfirmandoContratar(false)}
        />
      )}

      {confirmandoEliminarVacante && (
        <ConfirmDialog
          title="Eliminar vacante"
          message={(() => {
            const n = contarCandidatosDe(confirmandoEliminarVacante);
            const base = `Se eliminará la vacante "${confirmandoEliminarVacante.puesto}" y su carpeta de Drive se moverá a la papelera.`;
            const conCandidatos = n > 0
              ? ` Ojo: dentro hay ${n} postulante${n === 1 ? '' : 's'} sincronizado${n === 1 ? '' : 's'}, y su documentación se va a la papelera junto con la carpeta.`
              : '';
            return `${base}${conCandidatos} No es definitivo: puedes recuperarla desde la papelera de Google Drive. ¿Continuar?`;
          })()}
          confirmLabel={eliminandoVacante ? 'Eliminando...' : 'Sí, eliminar'}
          onConfirm={handleEliminarVacante}
          onCancel={() => setConfirmandoEliminarVacante(null)}
        />
      )}

      {showRevisionModal && selectedCandidate && (
        <Suspense fallback={null}>
          <RevisionArchivosModal
            folderId={selectedCandidate.id}
            nombreCandidato={selectedCandidate.nombre}
            requeridos={(selectedCandidate.slots || [])
              .filter((s) => s.driveFileId)
              .map((s) => ({
                requisito: s.nombre,
                driveFileId: s.driveFileId as string,
                fileName: selectedCandidate.archivosSubidosList.find((f) => f.id === s.driveFileId)?.name || '',
              }))}
            adicionales={selectedCandidate.archivosAdicionales.map((f) => ({ driveFileId: f.id, fileName: f.name }))}
            onClose={() => setShowRevisionModal(false)}
            onResult={setRevisionArchivos}
          />
        </Suspense>
      )}
      {showAnalisisModal && selectedCandidate && (
        <Suspense fallback={null}>
          <AnalisisArchivoUnicoModal
          folderId={selectedCandidate.id}
          driveFileId={analisisDriveFileId}
          nombreCandidato={selectedCandidate.nombre}
          onClose={() => { setShowAnalisisModal(false); setAnalisisDriveFileId(undefined); }}
          onApplied={() => {
            // Tras separar, la carpeta del postulante cambió en Drive: se
            // cierra todo y se vuelve a sincronizar para que el checklist
            // refleje los documentos ya reconocidos.
            setShowAnalisisModal(false);
            setAnalisisDriveFileId(undefined);
            closeCandidateModal();
            void refreshCandidatos();
          }}
          />
        </Suspense>
      )}

      <DocumentReviewModal
        open={!!rejectTarget}
        documentType={rejectTarget?.label || ''}
        fileName={rejectTarget?.fileName}
        saving={!!rejectTarget && pendingReviewKey === rejectTarget.driveFileId}
        onConfirm={(reason) => rejectTarget && sendReview(rejectTarget.driveFileId, rejectTarget.fileName, 'RECHAZADO', reason)}
        onClose={() => setRejectTarget(null)}
      />

      {/* MODAL CREAR / EDITAR PUESTO / VACANTE */}
      {showPuestoModal && (
        <div className="modal-overlay" onClick={() => { setShowPuestoModal(false); setEditingPosition(null); resetForm(); }}>
          <div className="modal modal-lg" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingPosition ? 'Editar Puesto / Vacante' : 'Crear Puesto / Vacante'}</h3>
              <button className="modal-close" onClick={() => { setShowPuestoModal(false); setEditingPosition(null); resetForm(); }}>
                <X size={16} />
              </button>
            </div>

            <form noValidate onSubmit={editingPosition ? handleEditPosition : handleCreatePosition} className="cacao-form">
              <div className="modal-body">
                {puestoError && <div className="form-error">{puestoError}</div>}

                <SectionLabel>Datos de la vacante</SectionLabel>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Nombre del puesto *</label>
                    <input type="text" value={nuevoPuesto} onChange={(e) => setNuevoPuesto(e.target.value)} placeholder="Ej: Guardia de Seguridad" aria-label="Nombre del puesto" />
                  </div>
                  <div className="form-group" style={{ width: '160px' }}>
                    <label>Estado</label>
                    <select value={nuevoEstado} onChange={(e) => setNuevoEstado(e.target.value)}>
                      <option value="ABIERTA">Abierta</option>
                      <option value="CERRADA">Cerrada</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Al contratar, esta persona entra como *</label>
                  <select value={nuevoTipoContratacion} onChange={(e) => setNuevoTipoContratacion(e.target.value)}>
                    <option value="GUARDIA">Guardia</option>
                    <option value="ADMINISTRATIVO">Personal administrativo</option>
                  </select>
                  <small style={{ color: '#718096', fontSize: '0.78rem', lineHeight: 1.5, display: 'block', marginTop: '4px' }}>
                    {nuevoTipoContratacion === 'ADMINISTRATIVO'
                      ? 'Su carpeta irá a Personal Administrativo, renombrada a "Apellidos Nombres". El puesto queda guardado en su ficha, no en el nombre de la carpeta.'
                      : 'Su carpeta irá a Guardias, en "Sin Asignar", hasta que le asignes una entidad.'}
                  </small>
                </div>

                <div className="form-group">
                  <label>Descripción</label>
                  <textarea value={nuevaDescripcion} onChange={(e) => setNuevaDescripcion(e.target.value)} rows={2} placeholder="Ej: Puesto para custodia en rutas de transporte..." />
                </div>

                <SectionLabel>Lo que debe entregar el candidato</SectionLabel>

                {/* CAMPOS REQUERIDOS DE FORMULARIO */}
                <div className="form-group">
                  <label>Datos que debe llenar</label>
                  <small style={{ display: 'block', color: 'var(--azul-claro)', opacity: 0.75, margin: '-2px 0 8px' }}>
Con "Apellidos" y "Nombres" se arma el nombre de la carpeta de la postulación en Drive, que siempre queda como "Apellidos Nombres" —sin guion, sin cédula y sin puesto—. Por eso esos dos campos no se pueden quitar ni volver opcionales. Todos los demás, incluida la Cédula, son campos normales que puedes agregar, quitar o dejar opcionales.
                  </small>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={nuevoCampoNombre}
                      onChange={(e) => setNuevoCampoNombre(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCampo(); } }}
                      placeholder="Ej: Sueldo esperado"
                      aria-label="Nombre del dato a solicitar"
                      style={{ flex: 2, minWidth: '180px' }}
                    />
                    <select
                      value={nuevoCampoTipo}
                      onChange={(e) => setNuevoCampoTipo(e.target.value)}
                      aria-label="Tipo de dato"
                      style={{ flex: 1, minWidth: '150px' }}
                    >
                      {CAMPO_TIPOS.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <Switch checked={nuevoCampoObligatorio} onChange={setNuevoCampoObligatorio} label="Obligatorio" />
                    <button type="button" className="btn-secondary" onClick={addCampo} style={{ padding: '11px 14px', display: 'flex' }} title="Agregar dato">
                      <Plus size={16} />
                    </button>
                  </div>
                  {campoAviso && <small style={{ color: '#c53030', display: 'block', marginTop: '6px' }}>{campoAviso}</small>}

                  {camposList.length > 0 ? (
                    <div style={{ marginTop: '10px', border: '1px solid var(--gris-claro)', borderRadius: '10px', overflow: 'hidden' }}>
                      {camposList.map((c, i) => {
                        const obligatorio = c.obligatorio !== false;
                        const locked = isLockedCampo(c.nombre);
                        return (
                          <div
                            key={i}
                            style={{
                              display: 'grid', gridTemplateColumns: '1fr 130px 96px 28px', alignItems: 'center', gap: '10px',
                              padding: '9px 12px', borderTop: i > 0 ? '1px solid var(--gris-claro)' : 'none', fontSize: '0.85rem',
                            }}
                          >
                            <span style={{ fontWeight: 600, color: 'var(--azul-oscuro)' }}>{c.nombre}</span>
                            <span style={{ color: 'var(--azul-claro)', fontSize: '0.78rem' }}>{campoTipoLabel(c.tipo)}</span>
                            <Switch
                              checked={obligatorio}
                              onChange={() => toggleCampoObligatorio(i)}
                              label={obligatorio ? 'Obligatorio' : 'Opcional'}
                              disabled={locked}
                              title={locked ? lockedCampoReason() : undefined}
                            />
                            {locked ? (
                              <span
                                title={lockedCampoReason()}
                                style={{ color: 'var(--azul-claro)', opacity: 0.55, display: 'flex', justifySelf: 'end' }}
                              >
                                <Lock size={14} />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setCamposList((prev) => prev.filter((_, idx) => idx !== i))}
                                title="Quitar"
                                style={{ border: 'none', background: 'none', color: 'var(--azul-claro)', opacity: 0.55, cursor: 'pointer', display: 'flex', justifySelf: 'end' }}
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.8rem', color: 'var(--azul-claro)', opacity: 0.65, margin: '8px 0 0' }}>Aún no agregaste ningún dato.</p>
                  )}
                </div>

                {/* ARCHIVOS REQUERIDOS */}
                <div className="form-group">
                  <label>Documentos que debe subir</label>
                  <small style={{ display: 'block', color: 'var(--azul-claro)', opacity: 0.75, margin: '-2px 0 8px' }}>
                    Si no marcas ninguno, el portal no acepta cualquier archivo: usa pdf, doc, docx, xls, xlsx, jpg, jpeg y png. Marca formatos solo cuando quieras una lista más corta.
                  </small>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={nuevoArchivoNombre}
                      onChange={(e) => setNuevoArchivoNombre(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addArchivo(); } }}
                      placeholder="Ej: Antecedentes penales"
                      aria-label="Nombre del documento a solicitar"
                      style={{ flex: 2, minWidth: '200px' }}
                    />
                    <Switch checked={nuevoArchivoObligatorio} onChange={setNuevoArchivoObligatorio} label="Obligatorio" />
                    <button type="button" className="btn-secondary" onClick={addArchivo} style={{ padding: '11px 14px', display: 'flex' }} title="Agregar documento">
                      <Plus size={16} />
                    </button>
                  </div>
                  {archivoAviso && <small style={{ color: '#c53030', display: 'block', marginTop: '6px' }}>{archivoAviso}</small>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', margin: '8px 0 0' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--azul-claro)', opacity: 0.7 }}>Formatos que acepta:</span>
                    {ARCHIVO_EXTENSIONES.map((ext) => {
                      const active = nuevoArchivoExts.includes(ext);
                      return (
                        <label
                          key={ext}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '3px 9px',
                            border: `1px solid ${active ? 'var(--azul-claro)' : 'var(--gris-claro)'}`, borderRadius: '999px', cursor: 'pointer',
                            background: active ? 'rgba(18, 55, 95, 0.08)' : '#fff',
                            color: active ? 'var(--azul-claro)' : '#6b7280',
                          }}
                        >
                          <input type="checkbox" checked={active} onChange={() => toggleNuevoArchivoExt(ext)} style={{ margin: 0 }} /> .{ext}
                        </label>
                      );
                    })}
                  </div>

                  {archivosList.length > 0 ? (
                    <div style={{ marginTop: '10px', border: '1px solid var(--gris-claro)', borderRadius: '10px', overflow: 'hidden' }}>
                      {archivosList.map((a, i) => {
                        const obligatorio = a.obligatorio !== false;
                        return (
                          <div
                            key={i}
                            style={{
                              display: 'grid', gridTemplateColumns: '1fr 150px 96px 28px', alignItems: 'center', gap: '10px',
                              padding: '9px 12px', borderTop: i > 0 ? '1px solid var(--gris-claro)' : 'none', fontSize: '0.85rem',
                            }}
                          >
                            <span style={{ fontWeight: 600, color: 'var(--azul-oscuro)' }}>{a.nombre}</span>
                            <span style={{ color: 'var(--azul-claro)', fontSize: '0.78rem' }}>
                              {a.extensiones?.length ? a.extensiones.map((e) => '.' + e).join(', ') : `Por defecto (${FORMATOS_POR_DEFECTO_PORTAL})`}
                            </span>
                            <Switch checked={obligatorio} onChange={() => toggleArchivoObligatorio(i)} label={obligatorio ? 'Obligatorio' : 'Opcional'} />
                            <button
                              type="button"
                              onClick={() => setArchivosList((prev) => prev.filter((_, idx) => idx !== i))}
                              title="Quitar"
                              style={{ border: 'none', background: 'none', color: 'var(--azul-claro)', opacity: 0.55, cursor: 'pointer', display: 'flex', justifySelf: 'end' }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.8rem', color: 'var(--azul-claro)', opacity: 0.65, margin: '8px 0 0' }}>Aún no agregaste ningún documento.</p>
                  )}
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => { setShowPuestoModal(false); setEditingPosition(null); resetForm(); }}>
                  Cancelar
                </button>
                <button type="submit" className="auth-btn" disabled={savingPuesto}>
                  {savingPuesto ? 'Guardando...' : editingPosition ? 'Guardar cambios' : 'Crear puesto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
