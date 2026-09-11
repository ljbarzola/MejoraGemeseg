import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  Settings,
  Pin,
  Users,
  Pencil,
  Check,
  X,
  FolderOpen,
  FileText,
  AlertTriangle,
  Plug,
  Save,
  UserCheck,
} from 'lucide-react';
import {
  getJobPositions,
  createJobPosition,
  updateJobPosition,
  syncReclutamientoCandidates,
  syncJobPositionsFromDrive,
  getDriveConfig,
  saveDriveConfig,
  testDriveConnection,
  getDocumentReviews,
  reviewDocument,
  reassignReclutamientoFile,
  saveCandidatoDatos,
  contratarCandidato,
} from '../../services/personal.service';
import { usePerm } from '../../contexts/PermissionsContext';
import DocumentReviewModal from '../../components/personal/DocumentReviewModal';
import { REVIEW_COLORS } from '../../components/personal/reviewStatus';

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
  { value: 'ALFANUMERICO', label: 'Alfanumérico' },
  { value: 'NUMERICO', label: 'Numérico' },
  { value: 'CORREO', label: 'Correo electrónico' },
  { value: 'TELEFONO', label: 'Teléfono' },
  { value: 'FECHA', label: 'Fecha' },
];
const campoTipoLabel = (tipo?: string) => CAMPO_TIPOS.find((t) => t.value === tipo)?.label || 'Texto';

const ARCHIVO_EXTENSIONES = ['pdf', 'jpg', 'png', 'doc', 'docx'];

const DEFAULT_CAMPOS: CampoRequerido[] = [
  { nombre: 'Nombre completo', tipo: 'TEXTO', obligatorio: true },
  { nombre: 'Cédula', tipo: 'NUMERICO', obligatorio: true },
  { nombre: 'Teléfono', tipo: 'TELEFONO', obligatorio: true },
  { nombre: 'Email', tipo: 'CORREO', obligatorio: true },
];
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
  createdAt: string;
}

interface Candidate {
  id: string;
  nombre: string;
  cedula: string;
  puestoAplicado: string;
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
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || 'Obligatorio'}
      onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px', border: 'none', background: 'none',
        cursor: 'pointer', padding: '2px', font: 'inherit', color: checked ? 'var(--naranja)' : '#8b93a1',
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

export default function ReclutamientoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { canWrite } = usePerm();

  const [puestos, setPuestos] = useState<JobPosition[]>([]);
  const [candidatos, setCandidatos] = useState<Candidate[]>([]);
  const [loadingPuestos, setLoadingPuestos] = useState(true);
  const [syncing, setSyncing] = useState(false);
  // La sincronización con Drive lista carpetas y lee archivos de cada
  // candidato: es costosa, así que ya no se dispara sola al entrar a la
  // página — solo al pulsar "Sincronizar" (o tras guardar la config de Drive).
  const [hasSynced, setHasSynced] = useState(false);
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
  const [savingPuesto, setSavingPuesto] = useState(false);
  const [puestoError, setPuestoError] = useState('');
  const [syncError, setSyncError] = useState('');

  // Configuración de la carpeta de Drive propia de Reclutamiento
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [driveConfig, setDriveConfig] = useState<any>(null);
  const [configFolderId, setConfigFolderId] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConfig, setTestingConfig] = useState(false);
  const [configTestResult, setConfigTestResult] = useState<any>(null);
  const [configError, setConfigError] = useState('');

  const openConfigModal = () => {
    setShowConfigModal(true);
    setConfigError('');
    setConfigTestResult(null);
    setLoadingConfig(true);
    getDriveConfig('RECLUTAMIENTO')
      .then((data) => {
        if (data) {
          setDriveConfig(data);
          setConfigFolderId(data.driveFolderId || '');
        }
      })
      .catch((err: any) => {
        setConfigError(err.response?.data?.message || 'No se pudo cargar la configuración de Drive.');
      })
      .finally(() => setLoadingConfig(false));
  };

  const handleTestConfig = async () => {
    const cleanId = configFolderId.trim().replace(/\.+$/, '');
    if (!cleanId) { setConfigError('Escribe el ID de la carpeta raíz para probar la conexión.'); return; }
    setTestingConfig(true);
    setConfigTestResult(null);
    setConfigError('');
    try {
      const result = await testDriveConnection({ driveFolderId: cleanId, type: 'RECLUTAMIENTO' });
      setConfigTestResult(result);
    } catch (err: any) {
      setConfigTestResult({ success: false, message: err.response?.data?.message || 'Error al probar conexión.' });
    } finally {
      setTestingConfig(false);
    }
  };

  const handleSaveConfig = async () => {
    const cleanId = configFolderId.trim().replace(/\.+$/, '');
    if (!cleanId) { setConfigError('Ingresa el ID de la carpeta.'); return; }
    setSavingConfig(true);
    setConfigError('');
    try {
      const saved = await saveDriveConfig({ driveFolderId: cleanId, type: 'RECLUTAMIENTO' });
      setDriveConfig(saved);
      setShowConfigModal(false);
      handleSyncAll();
    } catch (err: any) {
      setConfigError(err.response?.data?.message || 'Error al guardar.');
    } finally {
      setSavingConfig(false);
    }
  };

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
      if (candRes?.candidatos) setCandidatos(candRes.candidatos);
      const warning = candRes?.warning || puestosRes?.warning;
      if (warning) setSyncError(warning);
    } catch (err: any) {
      setCandidatos([]);
      setSyncError(err.response?.data?.message || 'No se pudo sincronizar con Google Drive. Verifica la configuración de Drive.');
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
    setShowPuestoModal(true);
  };

  const resetForm = () => {
    setNuevoPuesto('');
    setNuevaDescripcion('');
    setCamposList(DEFAULT_CAMPOS);
    setArchivosList(DEFAULT_ARCHIVOS);
    setNuevoEstado('ABIERTA');
    setNuevoCampoNombre('');
    setNuevoCampoTipo('TEXTO');
    setNuevoCampoObligatorio(true);
    setNuevoArchivoNombre('');
    setNuevoArchivoExts([]);
    setNuevoArchivoObligatorio(true);
    setPuestoError('');
  };

  const addCampo = () => {
    if (!nuevoCampoNombre.trim()) return;
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
    if (!nuevoArchivoNombre.trim()) return;
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
    try {
      await updateJobPosition(p.id, { estado: nuevo });
      loadPositions();
    } catch {
      alert('Error al cambiar el estado de la vacante.');
    }
  };

  const openCandidateModal = (c: Candidate) => {
    setSelectedCandidate(c);
    setReviewError('');
    setLoadingReviews(true);
    getDocumentReviews(c.cedula)
      .then((reviews: any[]) => setCandidateReviews(reviews || []))
      .catch(() => setCandidateReviews([]))
      .finally(() => setLoadingReviews(false));
  };

  const closeCandidateModal = () => {
    setSelectedCandidate(null);
    setCandidateReviews([]);
    setReviewError('');
    setEditingDatos(false);
    setDatosError('');
    setContratarError('');
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
  const handleContratar = async () => {
    if (!selectedCandidate) return;
    const confirmado = window.confirm(
      `Se moverá la carpeta de Drive de "${selectedCandidate.nombre}" a Guardias (carpeta "Sin Asignar", todavía sin entidad) y dejará de aparecer en Candidatos Postulados. ¿Continuar?`,
    );
    if (!confirmado) return;

    setContratando(true);
    setContratarError('');
    try {
      await contratarCandidato(selectedCandidate.id);
      closeCandidateModal();
      await refreshCandidatos();
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
    const guardado = candidate.datosFormulario?.[campo.nombre];
    if (guardado) return String(guardado);
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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <p className="page-eyebrow">RECURSOS HUMANOS</p>
            <h1>Reclutamiento y Vacantes</h1>
          </div>

          <div className="header-actions">
            <button className="btn-secondary" onClick={handleSyncAll} disabled={syncing}>
              <RefreshCw size={16} className={syncing ? 'spin' : undefined} />
              {syncing ? 'Sincronizando...' : 'Sincronizar Carpeta'}
            </button>
            <button className="btn-secondary" onClick={openConfigModal} title="Configurar carpeta de Drive de Reclutamiento">
              <Settings size={16} /> Configurar Drive
            </button>
          </div>
        </div>
      </div>

      {syncError && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{syncError}</div>
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
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => openEditModal(p)}
                        style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', display: 'flex', padding: '4px' }}
                        title="Editar vacante"
                      >
                        <Pencil size={15} />
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

                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0', fontSize: '0.7rem', color: '#a0aec0', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Sincronizado con Drive JSON</span>
                  <span>{new Date(p.createdAt).toLocaleDateString('es-EC')}</span>
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
            <Users size={16} /> Candidatos Postulados ({candidatos.length})
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
            No hay candidatos postulados en la carpeta Reclutamiento de Google Drive.
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
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.cedula}</td>
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
                <div className="auth-error-banner">{contratarError}</div>
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
                            type={campo.tipo === 'CORREO' ? 'email' : campo.tipo === 'TELEFONO' ? 'tel' : campo.tipo === 'FECHA' ? 'date' : 'text'}
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
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'monospace' }}>{selectedCandidate.cedula}</div>
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
                  <h4 style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>
                    <FolderOpen size={15} /> Archivos Requeridos para el Puesto ({selectedCandidate.archivosRequeridosCount})
                    {loadingReviews && <span style={{ fontWeight: 400, fontSize: '0.75rem', color: '#a0aec0' }}>cargando validaciones...</span>}
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
                        const file = selectedCandidate.archivosSubidosList.find((f) => f.name.toLowerCase().includes(req.nombre.toLowerCase()));
                        const review = file ? candidateReviews.find((r) => r.driveFileId === file.id) : null;
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
                          return (
                            <div key={file.id} style={{ padding: '10px 12px', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fefcbf' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#975a16' }}>
                                <FileText size={13} /> {file.name}
                              </div>
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
            </div>
          </div>
        </div>
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

            <form onSubmit={editingPosition ? handleEditPosition : handleCreatePosition} className="cacao-form">
              <div className="modal-body">
                {puestoError && <div className="form-error">{puestoError}</div>}

                <SectionLabel>Datos de la vacante</SectionLabel>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Nombre del puesto *</label>
                    <input type="text" value={nuevoPuesto} onChange={(e) => setNuevoPuesto(e.target.value)} placeholder="Ej: Guardia de Seguridad" required />
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
                  <label>Descripción</label>
                  <textarea value={nuevaDescripcion} onChange={(e) => setNuevaDescripcion(e.target.value)} rows={2} placeholder="Ej: Puesto para custodia en rutas de transporte..." />
                </div>

                <SectionLabel>Lo que debe entregar el candidato</SectionLabel>

                {/* CAMPOS REQUERIDOS DE FORMULARIO */}
                <div className="form-group">
                  <label>Datos que debe llenar</label>
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

                  {camposList.length > 0 ? (
                    <div style={{ marginTop: '10px', border: '1px solid var(--gris-claro)', borderRadius: '10px', overflow: 'hidden' }}>
                      {camposList.map((c, i) => {
                        const obligatorio = c.obligatorio !== false;
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
                            <Switch checked={obligatorio} onChange={() => toggleCampoObligatorio(i)} label={obligatorio ? 'Obligatorio' : 'Opcional'} />
                            <button
                              type="button"
                              onClick={() => setCamposList((prev) => prev.filter((_, idx) => idx !== i))}
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
                    <p style={{ fontSize: '0.8rem', color: 'var(--azul-claro)', opacity: 0.65, margin: '8px 0 0' }}>Aún no agregaste ningún dato.</p>
                  )}
                </div>

                {/* ARCHIVOS REQUERIDOS */}
                <div className="form-group">
                  <label>Documentos que debe subir</label>
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
                              {a.extensiones?.length ? a.extensiones.map((e) => '.' + e).join(', ') : 'Cualquier formato'}
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

      {/* MODAL CONFIGURACIÓN DE DRIVE - RECLUTAMIENTO */}
      {showConfigModal && (
        <div className="modal-overlay" onClick={() => setShowConfigModal(false)}>
          <div className="modal modal-lg" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={17} /> Configurar Carpeta de Drive — Reclutamiento
              </h3>
              <button className="modal-close" onClick={() => setShowConfigModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px', padding: '16px' }}>
                <p style={{ margin: '0 0 10px', fontSize: '0.85rem', color: '#2b6cb0' }}>
                  Esta carpeta es <strong>independiente</strong> de la de Cumplimiento/Custodios — solo se usa para Reclutamiento.
                  Debe tener esta estructura exacta para que la sincronización funcione:
                </p>
                <pre style={{
                  margin: 0, padding: '12px', background: '#fff', border: '1px solid #bee3f8', borderRadius: '8px',
                  fontSize: '0.78rem', lineHeight: 1.6, color: '#1a202c', overflowX: 'auto',
                }}>
{`📁 (la carpeta raíz que configures abajo)
 └── 📁 Guardia                    ← 1 carpeta por cada Puesto/Vacante (se crea sola)
       ├── 📄 Puesto_Guardia.json  ← se crea junto con la carpeta, no la edites a mano
       └── 📁 <Nombre Apellido - Cédula>   ← 1 carpeta por candidato, con ese formato exacto
              └── (sus documentos: CV, cédula, etc.)`}
                </pre>
                <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: '#718096' }}>
                  La carpeta del puesto (ej. <code>Guardia</code>) y su <code>Puesto_*.json</code> se crean automáticamente al usar <strong>"+ Nueva Vacante"</strong> en esta página — no hace falta crearlos a mano en Drive.
                </p>
                <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#718096' }}>
                  Para obtener el ID de la carpeta raíz: ábrela en Drive y copia el ID de la URL —
                  <br />
                  <code>https://drive.google.com/drive/folders/1ABC123...</code> → el ID es <code>1ABC123...</code>
                </p>
                <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#c53030', fontWeight: 600 }}>
                  IMPORTANTE: comparte esa carpeta (Lector) con <code>drive-sync@agentes-504115.iam.gserviceaccount.com</code>.
                </p>
              </div>

              {loadingConfig ? (
                <div className="loading-state">Cargando configuración...</div>
              ) : (
                <>
                  {configError && <div className="form-error">{configError}</div>}

                  <div className="form-group">
                    <label>ID de la carpeta raíz de Reclutamiento en Drive *</label>
                    <input
                      type="text"
                      value={configFolderId}
                      onChange={(e) => { setConfigFolderId(e.target.value); setConfigTestResult(null); }}
                      placeholder="Ej: 1ABC123def456GHI..."
                      style={{ width: '100%' }}
                    />
                  </div>

                  {configTestResult && (
                    <div style={{
                      padding: '12px', borderRadius: '8px',
                      background: configTestResult.success ? '#f0fff4' : '#fff5f5',
                      border: `1px solid ${configTestResult.success ? '#c6f6d5' : '#fed7d7'}`,
                    }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: configTestResult.success ? '#276749' : '#c53030' }}>
                        {configTestResult.success
                          ? `✅ Conexión exitosa: ${configTestResult.folderName} (${configTestResult.folderId})`
                          : `❌ ${configTestResult.message}`}
                      </p>
                    </div>
                  )}

                  {driveConfig?.driveFolderId && (
                    <div style={{ padding: '12px', background: '#f7fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#718096' }}>
                        <strong>Configuración actual:</strong> {driveConfig.driveFolderName} ({driveConfig.driveFolderId})
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {!loadingConfig && (
              <div className="modal-actions">
                <button className="btn-secondary" onClick={handleTestConfig} disabled={testingConfig} style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: testingConfig ? 0.6 : 1 }}>
                  <Plug size={16} /> {testingConfig ? 'Probando...' : 'Probar Conexión'}
                </button>
                <button className="auth-btn" onClick={handleSaveConfig} disabled={savingConfig} style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: savingConfig ? 0.6 : 1 }}>
                  <Save size={16} /> {savingConfig ? 'Guardando...' : 'Guardar Configuración'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
