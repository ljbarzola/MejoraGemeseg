import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Settings, Settings2, X, Users, Building2, Landmark, UserX, LogOut, IdCard, ArrowRightLeft } from 'lucide-react';
import { getAvailableCustodios } from '../../services/custodia.service';
import {
  getAsignaciones,
  getEntidades,
  syncEntidadesFolder,
  moverGuardiaAEntidad,
  type AsignacionGuardia,
  type Entidad,
  type EntidadTipo,
  type SyncEntidadesResult,
} from '../../services/entidades.service';
import { getDriveConfig, saveDriveConfig, testDriveConnection } from '../../services/personal.service';
import { registrarSalida, getCedulasFuera } from '../../services/movimiento-personal.service';
import GuardiaFichaModal from '../../components/personal/GuardiaFichaModal';
import MovimientoDetalleModal from '../../components/personal/MovimientoDetalleModal';
import PersonalFieldsConfigModal from '../../components/personal/PersonalFieldsConfigModal';
import { usePerm } from '../../contexts/PermissionsContext';

interface GuardiaRow {
  name: string;
  cedula: string;
  status: string;
  asignacion: AsignacionGuardia | null;
  entidad: Entidad | null;
  fuera: boolean;
}

const TIPO_LABEL: Record<EntidadTipo, string> = { PUBLICA: 'Pública', PRIVADA: 'Privada' };
const TIPO_COLOR: Record<EntidadTipo, { bg: string; fg: string }> = {
  PUBLICA: { bg: '#bfdbfe', fg: '#1d4ed8' },
  PRIVADA: { bg: '#e9d8fd', fg: '#6b46c1' },
};

function KpiCard({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
  return (
    <div style={{
      background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      borderLeft: `4px solid ${color}`, display: 'flex', alignItems: 'center', gap: '14px',
    }}>
      <div style={{ color, display: 'flex' }}>{icon}</div>
      <div>
        <div style={{ fontSize: '1.8rem', fontWeight: 700, color }}>{value}</div>
        <div style={{ fontSize: '0.85rem', color: '#718096' }}>{label}</div>
      </div>
    </div>
  );
}

export default function GuardiasList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { canWrite } = usePerm();
  const canEdit = canWrite('RRHH');

  const [guardias, setGuardias] = useState<{ name: string; cedula: string; status: string }[]>([]);
  const [asignaciones, setAsignaciones] = useState<AsignacionGuardia[]>([]);
  const [entidades, setEntidades] = useState<Entidad[]>([]);
  const [cedulasFuera, setCedulasFuera] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  // Permite llegar aquí con un filtro ya aplicado (ej. desde el KPI "Guardias
  // sin asignación" del Dashboard de Personal), en vez de solo mostrar el
  // número — ver PersonalDashboard.tsx.
  const [filtroEntidad, setFiltroEntidad] = useState<number | 'TODAS' | 'SIN_ASIGNAR'>(
    (location.state as any)?.filtroEntidad || 'TODAS',
  );
  const [filtroTipo, setFiltroTipo] = useState<EntidadTipo | 'TODOS'>('TODOS');
  const [mostrarFuera, setMostrarFuera] = useState(false);

  const [fichaGuardia, setFichaGuardia] = useState<{ name: string; cedula: string } | null>(null);
  const [salidaEnCurso, setSalidaEnCurso] = useState<string | null>(null);
  const [movimientoDetalleId, setMovimientoDetalleId] = useState<number | null>(null);
  const [showFieldsConfig, setShowFieldsConfig] = useState(false);

  // Asignar/mover guardia a entidad (mueve la carpeta en Drive, ver
  // handleConfirmMover más abajo).
  const [moverGuardia, setMoverGuardia] = useState<GuardiaRow | null>(null);
  const [moverEntidadId, setMoverEntidadId] = useState<number | ''>('');
  const [moviendo, setMoviendo] = useState(false);
  const [moverError, setMoverError] = useState('');

  // Sincronizar Drive
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncEntidadesResult | null>(null);
  const [syncError, setSyncError] = useState('');

  // Configuración de la carpeta raíz (Público/Privado/Entidad/Guardia)
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [driveConfig, setDriveConfig] = useState<any>(null);
  const [configFolderId, setConfigFolderId] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConfig, setTestingConfig] = useState(false);
  const [configTestResult, setConfigTestResult] = useState<any>(null);
  const [configError, setConfigError] = useState('');

  // Carpeta destino donde se archivan las carpetas de guardias tras una
  // salida completada (ver "Archivar carpeta" en el detalle del movimiento).
  const [archiveConfig, setArchiveConfig] = useState<any>(null);
  const [archiveFolderId, setArchiveFolderId] = useState('');
  const [savingArchiveConfig, setSavingArchiveConfig] = useState(false);
  const [archiveConfigError, setArchiveConfigError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([
      getAvailableCustodios().then((data) => (Array.isArray(data) ? data : Array.isArray(data?.value) ? data.value : [])),
      getAsignaciones({ activasOnly: true }),
      getEntidades(),
      getCedulasFuera(),
    ])
      .then(([g, a, e, fuera]) => {
        setGuardias(g);
        setAsignaciones(a || []);
        setEntidades(e || []);
        setCedulasFuera(fuera || []);
      })
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar el listado de guardias.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Doble validación antes de dar de baja: confirm nativo (mismo patrón que
  // el resto del módulo, ver handleDeleteColumn en RecruitmentKanban.tsx) en
  // vez de un formulario — cédula/nombre ya se conocen por la fila.
  const handleRegistrarSalida = async (r: GuardiaRow) => {
    if (!window.confirm(`¿Seguro que deseas registrar la salida de ${r.name}?`)) return;
    setSalidaEnCurso(r.cedula);
    try {
      const movimiento = await registrarSalida({ cedula: r.cedula, nombreGuardia: r.name });
      setMovimientoDetalleId(movimiento.id);
    } catch (err: any) {
      alert(err.response?.data?.message || 'No se pudo registrar la salida.');
    } finally {
      setSalidaEnCurso(null);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncError('');
    setSyncResult(null);
    try {
      const result = await syncEntidadesFolder();
      setSyncResult(result);
      load();
    } catch (err: any) {
      setSyncError(err.response?.data?.message || 'No se pudo sincronizar con Drive.');
    } finally {
      setSyncing(false);
    }
  };

  const openMoverModal = (r: GuardiaRow) => {
    setMoverGuardia(r);
    setMoverEntidadId(r.entidad?.id || '');
    setMoverError('');
  };

  const handleConfirmMover = async () => {
    if (!moverGuardia || !moverEntidadId) return;
    setMoviendo(true);
    setMoverError('');
    try {
      await moverGuardiaAEntidad(moverGuardia.cedula, moverEntidadId);
      setMoverGuardia(null);
      load();
    } catch (err: any) {
      setMoverError(err.response?.data?.message || 'No se pudo mover al guardia de entidad.');
    } finally {
      setMoviendo(false);
    }
  };

  const openConfigModal = () => {
    setShowConfigModal(true);
    setConfigError('');
    setConfigTestResult(null);
    setLoadingConfig(true);
    getDriveConfig()
      .then((data) => {
        if (data) {
          setDriveConfig(data);
          setConfigFolderId(data.driveFolderId || '');
        }
      })
      .catch((err: any) => setConfigError(err.response?.data?.message || 'No se pudo cargar la configuración de Drive.'))
      .finally(() => setLoadingConfig(false));
    setArchiveConfigError('');
    getDriveConfig('GUARDIAS_ARCHIVO')
      .then((data) => {
        if (data) {
          setArchiveConfig(data);
          setArchiveFolderId(data.driveFolderId || '');
        }
      })
      .catch(() => {});
  };

  const handleSaveArchiveConfig = async () => {
    const cleanId = archiveFolderId.trim().replace(/\.+$/, '');
    if (!cleanId) { setArchiveConfigError('Ingresa el ID de la carpeta.'); return; }
    setSavingArchiveConfig(true);
    setArchiveConfigError('');
    try {
      const saved = await saveDriveConfig({ driveFolderId: cleanId, type: 'GUARDIAS_ARCHIVO' });
      setArchiveConfig(saved);
    } catch (err: any) {
      setArchiveConfigError(err.response?.data?.message || 'Error al guardar.');
    } finally {
      setSavingArchiveConfig(false);
    }
  };

  const handleTestConfig = async () => {
    const cleanId = configFolderId.trim().replace(/\.+$/, '');
    if (!cleanId) { setConfigError('Escribe el ID de la carpeta raíz para probar la conexión.'); return; }
    setTestingConfig(true);
    setConfigTestResult(null);
    setConfigError('');
    try {
      const result = await testDriveConnection({ driveFolderId: cleanId });
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
      const saved = await saveDriveConfig({ driveFolderId: cleanId });
      setDriveConfig(saved);
      setShowConfigModal(false);
      await handleSync();
    } catch (err: any) {
      setConfigError(err.response?.data?.message || 'Error al guardar.');
    } finally {
      setSavingConfig(false);
    }
  };

  const entidadPorId = useMemo(() => new Map(entidades.map((e) => [e.id, e])), [entidades]);
  const asignacionPorCedula = useMemo(() => new Map(asignaciones.map((a) => [a.cedula, a])), [asignaciones]);
  const fueraSet = useMemo(() => new Set(cedulasFuera), [cedulasFuera]);

  const rows: GuardiaRow[] = useMemo(
    () =>
      guardias.map((g) => {
        const asignacion = asignacionPorCedula.get(g.cedula) || null;
        const entidad = asignacion ? entidadPorId.get(asignacion.entidadId) || asignacion.entidad || null : null;
        return { ...g, asignacion, entidad, fuera: fueraSet.has(g.cedula) };
      }),
    [guardias, asignacionPorCedula, entidadPorId, fueraSet],
  );

  const rowsEnServicio = useMemo(() => rows.filter((r) => !r.fuera), [rows]);
  const cantidadFuera = rows.length - rowsEnServicio.length;

  const kpis = useMemo(() => {
    const activos = rowsEnServicio.filter((r) => r.asignacion).length;
    const publicas = rowsEnServicio.filter((r) => r.entidad?.tipo === 'PUBLICA').length;
    const privadas = rowsEnServicio.filter((r) => r.entidad?.tipo === 'PRIVADA').length;
    const sinAsignar = rowsEnServicio.length - activos;
    return { activos, publicas, privadas, sinAsignar };
  }, [rowsEnServicio]);

  const filtered = (mostrarFuera ? rows : rowsEnServicio).filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(search.toLowerCase()) || (r.cedula && r.cedula.includes(search));
    if (!matchesSearch) return false;
    if (filtroEntidad === 'SIN_ASIGNAR') return !r.asignacion;
    if (filtroEntidad !== 'TODAS' && r.asignacion?.entidadId !== filtroEntidad) return false;
    if (filtroTipo !== 'TODOS' && r.entidad?.tipo !== filtroTipo) return false;
    return true;
  });

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/rrhh')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <p className="page-eyebrow">RECURSOS HUMANOS</p>
            <h1>Guardias</h1>
          </div>

          {canEdit && (
            <div className="header-actions">
              <button className="btn-secondary" onClick={handleSync} disabled={syncing}>
                <RefreshCw size={16} className={syncing ? 'spin' : undefined} /> {syncing ? 'Sincronizando...' : 'Sincronizar Drive'}
              </button>
              <button className="btn-secondary" onClick={openConfigModal} title="Ver estructura de carpetas y configurar Drive">
                <Settings size={16} /> Configurar Drive
              </button>
              <button className="btn-secondary" onClick={() => setShowFieldsConfig(true)} title="Agregar o quitar campos de la Ficha Personal">
                <Settings2 size={16} /> Configurar campos
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
      )}

      {syncError && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{syncError}</div>
      )}

      {syncResult && (
        <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', color: '#276749', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>
          <strong>Sincronización completada.</strong> {syncResult.guardiasActualizados} guardia(s) · {syncResult.documentos} documento(s) · {syncResult.fichasPersonales} ficha(s) personal(es)
          {syncResult.entidadesCreadas.length > 0 && <> · {syncResult.entidadesCreadas.length} entidad(es) nueva(s): {syncResult.entidadesCreadas.join(', ')}</>}
          {syncResult.entidadesRenombradas.length > 0 && <> · {syncResult.entidadesRenombradas.length} entidad(es) renombrada(s): {syncResult.entidadesRenombradas.join(', ')}</>}
          {syncResult.asignacionesAbiertas > 0 && <> · {syncResult.asignacionesAbiertas} asignación(es) nueva(s)</>}
          {syncResult.asignacionesCerradas > 0 && <> · {syncResult.asignacionesCerradas} cerrada(s) (guardia rotó o ya no aparece)</>}
          {syncResult.entidadesTipoDistinto.length > 0 && (
            <p style={{ margin: '8px 0 0', color: '#975a16' }}>
              ⚠ Tipo distinto al de la carpeta: {syncResult.entidadesTipoDistinto.join(' · ')}
            </p>
          )}
          {syncResult.entidadesColisionNombre.length > 0 && (
            <p style={{ margin: '8px 0 0', color: '#975a16' }}>
              ⚠ Nombres de entidad duplicados entre carpetas: {syncResult.entidadesColisionNombre.join(' · ')}
            </p>
          )}
          {syncResult.carpetasNoReconocidas.length > 0 && (
            <p style={{ margin: '8px 0 0', color: '#975a16' }}>
              ⚠ Carpetas de primer nivel no reconocidas (deben llamarse "Público" o "Privado"): {syncResult.carpetasNoReconocidas.join(', ')}
            </p>
          )}
          {syncResult.guardiasNoReconocidos.length > 0 && (
            <p style={{ margin: '8px 0 0', color: '#975a16' }}>
              ⚠ Carpetas de guardia no reconocidas (deben llamarse "Nombre Apellido - Cédula"), no se creó nada para ellas: {syncResult.guardiasNoReconocidos.join(', ')}
            </p>
          )}
          {syncResult.renombresIgnorados.length > 0 && (
            <p style={{ margin: '8px 0 0', color: '#975a16' }}>
              ⚠ Renombres de guardia no aplicados por seguridad (revisa si fueron intencionales): {syncResult.renombresIgnorados.join(' · ')}
            </p>
          )}
          {syncResult.guardiasFueraConCarpetaActiva.length > 0 && (
            <p style={{ margin: '8px 0 0', color: '#975a16' }}>
              ⚠ Ya registrados como salida en Historial, pero su carpeta sigue activa en Drive (no se les reabrió asignación): {syncResult.guardiasFueraConCarpetaActiva.join(', ')} — borra o mueve su carpeta, o si volvieron a trabajar registra su reingreso primero.
            </p>
          )}
          {syncResult.errors.length > 0 && (
            <p style={{ margin: '8px 0 0', color: '#c53030' }}>{syncResult.errors.join(' · ')}</p>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <KpiCard icon={<Users size={26} />} value={kpis.activos} label="Guardias activos (con asignación)" color="#276749" />
        <KpiCard icon={<Landmark size={26} />} value={kpis.publicas} label="En entidad pública" color="#1d4ed8" />
        <KpiCard icon={<Building2 size={26} />} value={kpis.privadas} label="En entidad privada" color="#6b46c1" />
        <KpiCard icon={<UserX size={26} />} value={kpis.sinAsignar} label="Sin asignación activa" color="#c53030" />
      </div>

      <div className="admin-section">
        <div className="filter-bar" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Buscar por nombre o cédula..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '1 1 220px', minWidth: '200px', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem' }}
          />
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as EntidadTipo | 'TODOS')} style={{ padding: '10px 12px', borderRadius: '10px', border: '2px solid #e2e8f0' }}>
            <option value="TODOS">Todos los tipos</option>
            <option value="PUBLICA">Pública</option>
            <option value="PRIVADA">Privada</option>
          </select>
          <select
            value={String(filtroEntidad)}
            onChange={(e) => setFiltroEntidad(e.target.value === 'TODAS' || e.target.value === 'SIN_ASIGNAR' ? e.target.value : Number(e.target.value))}
            style={{ padding: '10px 12px', borderRadius: '10px', border: '2px solid #e2e8f0' }}
          >
            <option value="TODAS">Todas las entidades</option>
            <option value="SIN_ASIGNAR">Sin asignación</option>
            {entidades.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre}</option>
            ))}
          </select>
          {(search || filtroTipo !== 'TODOS' || filtroEntidad !== 'TODAS') && (
            <button className="btn-secondary" onClick={() => { setSearch(''); setFiltroTipo('TODOS'); setFiltroEntidad('TODAS'); }}>
              Limpiar filtros
            </button>
          )}
          {cantidadFuera > 0 && (
            <button className="btn-secondary" onClick={() => setMostrarFuera((v) => !v)} style={{ padding: '6px 14px', fontSize: '0.78rem' }}>
              {mostrarFuera ? 'Ocultar guardias fuera' : `Mostrar guardias fuera (${cantidadFuera})`}
            </button>
          )}
        </div>

        {loading ? (
          <div className="loading-state">Cargando guardias...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No se encontraron guardias con estos filtros.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Guardia</th>
                  <th>Cédula</th>
                  <th>Entidad actual</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.cedula || r.name} style={{ opacity: r.fuera ? 0.6 : 1 }}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--azul-oscuro)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {r.name}
                        {r.fuera && (
                          <span className="status-badge" style={{ background: '#edf2f7', color: '#718096', fontSize: '0.68rem' }}>Fuera</span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.cedula || '—'}</td>
                    <td>{r.entidad ? r.entidad.nombre : <span style={{ color: '#a0aec0' }}>Sin asignación</span>}</td>
                    <td>
                      {r.entidad ? (
                        <span className="status-badge" style={{ background: TIPO_COLOR[r.entidad.tipo].bg, color: TIPO_COLOR[r.entidad.tipo].fg }}>
                          {TIPO_LABEL[r.entidad.tipo]}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {canEdit && (
                          <button
                            onClick={() => setFichaGuardia({ name: r.name, cedula: r.cedula })}
                            disabled={!r.cedula}
                            title="Ficha personal"
                            className="btn-secondary"
                            style={{ padding: '6px 8px', display: 'flex', alignItems: 'center' }}
                          >
                            <IdCard size={15} />
                          </button>
                        )}
                        {canEdit && !r.fuera && (
                          <button
                            onClick={() => openMoverModal(r)}
                            disabled={!r.cedula}
                            title={r.entidad ? 'Mover a otra entidad' : 'Asignar a una entidad'}
                            className="btn-secondary"
                            style={{ padding: '6px 8px', display: 'flex', alignItems: 'center' }}
                          >
                            <ArrowRightLeft size={15} />
                          </button>
                        )}
                        {!r.fuera && (
                          <button
                            onClick={() => handleRegistrarSalida(r)}
                            disabled={!r.cedula || salidaEnCurso === r.cedula}
                            title="Registrar salida"
                            className="btn-secondary"
                            style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', color: '#c53030' }}
                          >
                            <LogOut size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <GuardiaFichaModal guardia={fichaGuardia} onClose={() => setFichaGuardia(null)} />
      <MovimientoDetalleModal movimientoId={movimientoDetalleId} onClose={() => setMovimientoDetalleId(null)} />
      {showFieldsConfig && (
        <PersonalFieldsConfigModal scope="GUARDIA" onClose={() => setShowFieldsConfig(false)} onChanged={() => {}} />
      )}

      {/* MODAL: CONFIGURAR CARPETA DE DRIVE (Público/Privado/Entidad/Guardia) */}
      {showConfigModal && (
        <div className="modal-overlay" onClick={() => setShowConfigModal(false)}>
          <div className="modal modal-lg" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={17} /> Configurar Carpeta de Drive — Guardias
              </h3>
              <button className="modal-close" onClick={() => setShowConfigModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px', padding: '16px' }}>
                <p style={{ margin: '0 0 10px', fontSize: '0.85rem', color: '#2b6cb0' }}>
                  Esta carpeta alimenta el Listado de Guardias, Entidades y Requisitos, Asignaciones y Cumplimiento. Debe tener esta estructura exacta:
                </p>
                <pre style={{
                  margin: 0, padding: '12px', background: '#fff', border: '1px solid #bee3f8', borderRadius: '8px',
                  fontSize: '0.78rem', lineHeight: 1.6, color: '#1a202c', overflowX: 'auto',
                }}>
{`📁 (la carpeta raíz que configures abajo)
 ├── 📁 Público                          ← exactamente ese nombre
 │     └── 📁 <Nombre de la Entidad>        ← 1 carpeta por entidad pública
 │            └── 📁 <Nombre Apellido - Cédula>  ← 1 carpeta por guardia
 │                   └── (sus documentos)
 └── 📁 Privado                          ← exactamente ese nombre
       └── 📁 <Nombre de la Entidad>        ← 1 carpeta por entidad privada
              └── 📁 <Nombre Apellido - Cédula>
                     └── (sus documentos)`}
                </pre>
                <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: '#718096' }}>
                  Si el nombre de una carpeta de entidad no existe todavía en "Entidades y Requisitos", se crea automáticamente al sincronizar. Nunca se borra una entidad ni sus requisitos por borrar o mover una carpeta — el guardia solo queda "sin asignación" hasta que la carpeta reaparezca con el mismo nombre.
                </p>
                <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#718096' }}>
                  Cada sincronización también crea o actualiza, dentro de la carpeta de cada guardia, un archivo <code>Datos_Personales.json</code> con su ficha (editable con el ícono <IdCard size={12} style={{ verticalAlign: 'middle' }} /> "Ficha personal" de cada fila).
                </p>
                <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#718096' }}>
                  Para obtener el ID de la carpeta raíz: ábrela en Drive y copia el ID de la URL —
                  <br />
                  <code>https://drive.google.com/drive/folders/1ABC123...</code> → el ID es <code>1ABC123...</code>
                </p>
                <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#c53030', fontWeight: 600 }}>
                  IMPORTANTE: comparte esa carpeta como Editor (no solo Lector) con <code>drive-sync@agentes-504115.iam.gserviceaccount.com</code> — la sincronización necesita poder crear el archivo Datos_Personales.json en cada carpeta de guardia.
                </p>
              </div>

              {loadingConfig ? (
                <div className="loading-state">Cargando configuración...</div>
              ) : (
                <>
                  {configError && <div className="form-error" style={{ marginTop: '14px' }}>{configError}</div>}

                  <div className="form-group" style={{ marginTop: '14px' }}>
                    <label>ID de la carpeta raíz en Drive *</label>
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
                      padding: '12px', borderRadius: '8px', marginTop: '10px',
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
                    <div style={{ padding: '12px', background: '#f7fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '10px' }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#718096' }}>
                        <strong>Configuración actual:</strong> {driveConfig.driveFolderName} ({driveConfig.driveFolderId})
                      </p>
                    </div>
                  )}

                  <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>
                      Carpeta de archivo (guardias fuera)
                    </p>
                    <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: '#718096' }}>
                      Destino del botón "Archivar carpeta" (detalle de una salida completada, en Historial). Independiente de la carpeta raíz de arriba.
                    </p>
                    {archiveConfigError && <div className="form-error" style={{ marginBottom: '10px' }}>{archiveConfigError}</div>}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={archiveFolderId}
                        onChange={(e) => setArchiveFolderId(e.target.value)}
                        placeholder="Ej: 1XYZ789..."
                        style={{ flex: 1 }}
                      />
                      <button className="btn-secondary" onClick={handleSaveArchiveConfig} disabled={savingArchiveConfig}>
                        {savingArchiveConfig ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                    {archiveConfig?.driveFolderId && (
                      <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#718096' }}>
                        Actual: {archiveConfig.driveFolderName} ({archiveConfig.driveFolderId})
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {!loadingConfig && (
              <div className="modal-actions">
                <button className="btn-secondary" onClick={handleTestConfig} disabled={testingConfig} style={{ opacity: testingConfig ? 0.6 : 1 }}>
                  {testingConfig ? 'Probando...' : 'Probar Conexión'}
                </button>
                <button className="auth-btn" onClick={handleSaveConfig} disabled={savingConfig} style={{ opacity: savingConfig ? 0.6 : 1 }}>
                  {savingConfig ? 'Guardando...' : 'Guardar y Sincronizar'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: ASIGNAR/MOVER GUARDIA A ENTIDAD */}
      {moverGuardia && (
        <div className="modal-overlay" onClick={() => !moviendo && setMoverGuardia(null)}>
          <div className="modal" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowRightLeft size={17} /> {moverGuardia.entidad ? 'Mover de entidad' : 'Asignar a entidad'}
              </h3>
              <button className="modal-close" onClick={() => setMoverGuardia(null)} disabled={moviendo}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ margin: '0 0 14px', fontSize: '0.88rem', color: '#4a5568' }}>
                Esto mueve la carpeta de Drive de <strong>{moverGuardia.name}</strong>
                {moverGuardia.entidad ? <> de <strong>{moverGuardia.entidad.nombre}</strong> a</> : ' a'} la entidad que elijas — no se borra ningún documento, y la asignación queda actualizada de inmediato.
              </p>

              {moverError && <div className="form-error" style={{ marginBottom: '12px' }}>{moverError}</div>}

              <div className="form-group">
                <label>Entidad destino *</label>
                <select
                  value={moverEntidadId}
                  onChange={(e) => setMoverEntidadId(e.target.value ? Number(e.target.value) : '')}
                  style={{ width: '100%' }}
                >
                  <option value="">Selecciona una entidad...</option>
                  {entidades.filter((e) => e.activo).map((e) => (
                    <option key={e.id} value={e.id} disabled={e.id === moverGuardia.entidad?.id}>
                      {e.nombre} ({TIPO_LABEL[e.tipo]})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setMoverGuardia(null)} disabled={moviendo}>
                Cancelar
              </button>
              <button className="auth-btn" onClick={handleConfirmMover} disabled={moviendo || !moverEntidadId}>
                {moviendo ? 'Moviendo...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
