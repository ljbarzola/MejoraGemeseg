import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import { ArrowLeft, RefreshCw, Settings, FileCog, X, IdCard } from 'lucide-react';
import { extractDriveFolderId, buildDriveFolderLink } from '../../utils/driveLink';
import { formatFechaHoraSync } from '../../utils/formatFechaHora';
import {
  getDriveTree,
  syncPersonalAdminFolder,
  deleteDriveEmployee,
  getDriveConfig,
  saveDriveConfig,
  testDriveConnection,
  getAdministrativoFicha,
  type AdministrativeStaffFicha,
} from '../../services/personal.service';
import AdministrativoDetalleModal from '../../components/personal/AdministrativoDetalleModal';
import AdministrativeStaffConfigModal from '../../components/personal/AdministrativeStaffConfigModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import OpenFolderButton from '../../components/common/OpenFolderButton';

interface StaffRow {
  employeeName: string;
  cedula: string;
  puesto?: string | null;
  documentCount: number;
  folderUrl?: string;
  lastSyncAt?: string;
  ficha?: AdministrativeStaffFicha;
}

export default function AdministrativeStaff() {
  const navigate = useNavigate();
  const tablaRef = useResizableColumns('personal-administrativo');
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<StaffRow | null>(null);
  const [showDocTypesModal, setShowDocTypesModal] = useState(false);

  // Configuración de la carpeta de Drive propia de Personal Administrativo
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [driveConfig, setDriveConfig] = useState<any>(null);
  const [configFolderId, setConfigFolderId] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConfig, setTestingConfig] = useState(false);
  const [configTestResult, setConfigTestResult] = useState<any>(null);
  const [configError, setConfigError] = useState('');

  const [confirmandoEliminar, setConfirmandoEliminar] = useState<StaffRow | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const deleteErrorRef = useRef<HTMLDivElement>(null);
  const [syncError, setSyncError] = useState('');

  // El botón "Eliminar" puede estar en una fila lejos del inicio de una tabla
  // larga; el banner de error se pinta arriba de la página, así que se hace
  // scrollIntoView para que RRHH no se lo pierda.
  useEffect(() => {
    if (deleteError) {
      deleteErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [deleteError]);

  // La más reciente entre todas las filas — cada una trae su propio
  // lastSyncAt (EmployeeDriveFolder), no hace falta guardar nada aparte.
  const ultimaSincronizacion = staff.reduce<string | undefined>((max, r) => {
    if (!r.lastSyncAt) return max;
    if (!max || new Date(r.lastSyncAt) > new Date(max)) return r.lastSyncAt;
    return max;
  }, undefined);

  const loadStaff = () => {
    setLoading(true);
    getDriveTree()
      .then(async (tree) => {
        const rows: StaffRow[] = tree.PERSONAL_ADMIN || [];
        const fichas = await Promise.all(
          rows.map((r) => getAdministrativoFicha(r.cedula).catch(() => undefined)),
        );
        setStaff(rows.map((r, i) => ({ ...r, ficha: fichas[i] })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadStaff(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError('');
    try {
      await syncPersonalAdminFolder();
      loadStaff();
    } catch (err: any) {
      setSyncError(err.response?.data?.message || 'No se pudo sincronizar con Drive.');
    } finally {
      setSyncing(false);
    }
  };

  const openConfigModal = () => {
    setShowConfigModal(true);
    setConfigError('');
    setConfigTestResult(null);
    setLoadingConfig(true);
    getDriveConfig('PERSONAL_ADMIN')
      .then((data) => {
        if (data) {
          setDriveConfig(data);
          setConfigFolderId(data.driveFolderId ? (data.driveFolderLink || buildDriveFolderLink(data.driveFolderId)) : '');
        }
      })
      .catch((err: any) => {
        setConfigError(err.response?.data?.message || 'No se pudo cargar la configuración de Drive.');
      })
      .finally(() => setLoadingConfig(false));
  };

  const handleTestConfig = async () => {
    const cleanId = extractDriveFolderId(configFolderId);
    if (!cleanId) { setConfigError('Pega el enlace completo de la carpeta raíz para probar la conexión.'); return; }
    setTestingConfig(true);
    setConfigTestResult(null);
    setConfigError('');
    try {
      const result = await testDriveConnection({ driveFolderId: cleanId, type: 'PERSONAL_ADMIN' });
      setConfigTestResult(result);
    } catch (err: any) {
      setConfigTestResult({ success: false, message: err.response?.data?.message || 'Error al probar conexión.' });
    } finally {
      setTestingConfig(false);
    }
  };

  const handleSaveConfig = async () => {
    const cleanId = extractDriveFolderId(configFolderId);
    if (!cleanId) { setConfigError('Pega el enlace completo de la carpeta.'); return; }
    setSavingConfig(true);
    setConfigError('');
    try {
      const saved = await saveDriveConfig({ driveFolderId: cleanId, type: 'PERSONAL_ADMIN' });
      setDriveConfig(saved);
      setShowConfigModal(false);
      handleSync();
    } catch (err: any) {
      setConfigError(err.response?.data?.message || 'Error al guardar.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDeleteEmployee = (emp: StaffRow) => {
    setDeleteError('');
    setConfirmandoEliminar(emp);
  };

  const confirmarEliminarEmployee = async () => {
    const emp = confirmandoEliminar;
    if (!emp) return;
    setConfirmandoEliminar(null);
    try {
      await deleteDriveEmployee(emp.cedula);
      if (selectedEmployee?.cedula === emp.cedula) setSelectedEmployee(null);
      loadStaff();
    } catch (err: any) {
      setDeleteError(err.response?.data?.message || 'Error al eliminar');
    }
  };

  // Ordenar por cualquier columna, igual que el listado de tareas del Inicio.
  const { filas: filasOrdenadas, thProps, SortIcon } = useSortableTable(
    staff,
    {
      nombre: (e) => e.employeeName,
      puesto: (e) => e.puesto,
      departamento: (e) => e.ficha?.departamento,
      ingreso: (e) => e.ficha?.fechaIngreso,
    },
    'nombre',
  );

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate('/rrhh')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>

        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">RECURSOS HUMANOS</p>
            <h1>Personal Administrativo</h1>
            <p style={{ color: '#718096', fontSize: '0.85rem', marginTop: '4px' }}>
              Personal de oficina y administrativo sincronizado desde Google Drive
            </p>
            <p style={{ color: '#a0aec0', fontSize: '0.78rem', marginTop: '2px' }}>
              La carpeta se nombra igual que en Guardias: "Apellidos Nombres". El puesto y la cédula se guardan dentro de datos.json, no en el nombre.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <div className="header-actions">
              <button className="btn-secondary" onClick={handleSync} disabled={syncing}>
                <RefreshCw size={16} className={syncing ? 'spin' : undefined} />
                {syncing ? 'Sincronizando...' : 'Sincronizar'}
              </button>
              <button
                type="button"
                className="btn-icon-toolbar"
                onClick={() => setShowDocTypesModal(true)}
                title="Datos, campos y documentos requeridos"
                aria-label="Datos, campos y documentos requeridos"
              >
                <FileCog size={18} />
              </button>
              <button
                type="button"
                className="btn-icon-toolbar"
                onClick={openConfigModal}
                title="Carpeta de Drive"
                aria-label="Carpeta de Drive"
              >
                <Settings size={18} />
              </button>
            </div>
            {ultimaSincronizacion && (
              <span style={{ fontSize: '0.75rem', color: '#718096' }}>
                Última sincronización: {formatFechaHoraSync(ultimaSincronizacion)}
              </span>
            )}
          </div>
        </div>
      </div>

      {deleteError && (
        <div ref={deleteErrorRef} style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginTop: '16px', fontSize: '0.85rem' }}>{deleteError}</div>
      )}

      {syncError && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginTop: '16px', fontSize: '0.85rem' }}>{syncError}</div>
      )}

      <div className="admin-section" style={{ marginTop: '20px' }}>
        {loading ? (
          <div className="loading-state">Cargando...</div>
        ) : staff.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 32px', color: '#a0aec0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📂</div>
            <p>No hay personal administrativo en Drive</p>
            <p style={{ fontSize: '0.8rem', marginTop: '8px' }}>
              Configura la carpeta (tuerca) y sincroniza para importar
            </p>
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th {...thProps('nombre')}>Nombre <SortIcon campo="nombre" /></th>
                  <th {...thProps('puesto')}>Puesto <SortIcon campo="puesto" /></th>
                  <th {...thProps('departamento')}>Departamento <SortIcon campo="departamento" /></th>
                  <th {...thProps('ingreso')}>Fecha de ingreso <SortIcon campo="ingreso" /></th>
                  <th>Estado</th>
                  <th>Cumplimiento</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((emp) => (
                  <tr key={emp.cedula}>
                    <td style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>
                      <span className="truncate" title={emp.employeeName}>{emp.employeeName}</span>
                    </td>
                    <td><span className="truncate" title={emp.puesto || undefined}>{emp.puesto || '—'}</span></td>
                    <td><span className="truncate" title={emp.ficha?.departamento || undefined}>{emp.ficha?.departamento || '—'}</span></td>
                    <td>{emp.ficha?.fechaIngreso ? new Date(emp.ficha.fechaIngreso).toLocaleDateString('es-EC') : '—'}</td>
                    <td>
                      <span className="status-badge" style={{
                        background: (emp.ficha?.activo ?? true) ? '#c6f6d5' : '#fed7d7',
                        color: (emp.ficha?.activo ?? true) ? '#276749' : '#c53030',
                      }}>
                        {(emp.ficha?.activo ?? true) ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>{emp.documentCount === 1 ? '1 archivo' : `${emp.documentCount} archivos`}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setSelectedEmployee(emp)}
                          title="Ver detalle"
                          className="btn-secondary"
                          style={{ padding: '6px 8px', display: 'flex', alignItems: 'center' }}
                        >
                          <IdCard size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteEmployee(emp)}
                          title="Eliminar de la lista"
                          className="btn-secondary"
                          style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', color: '#c53030' }}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AdministrativoDetalleModal
        employee={selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        onFichaSaved={loadStaff}
      />

      {showDocTypesModal && (
        <AdministrativeStaffConfigModal
          initialTab="DOCUMENTOS"
          onClose={() => setShowDocTypesModal(false)}
          onFieldsChanged={() => {}}
        />
      )}

      {/* MODAL CONFIGURACIÓN DE DRIVE - PERSONAL ADMINISTRATIVO */}
      {showConfigModal && (
        <div className="modal-overlay" onClick={() => setShowConfigModal(false)}>
          <div className="modal modal-lg" style={{ maxWidth: '620px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={17} /> Configurar Carpeta de Drive — Personal Administrativo
              </h3>
              <button className="modal-close" onClick={() => setShowConfigModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px', padding: '16px' }}>
                <p style={{ margin: '0 0 10px', fontSize: '0.85rem', color: '#2b6cb0' }}>
                  Esta carpeta es <strong>independiente</strong> de la de Cumplimiento/Custodios — solo se usa para Personal Administrativo.
                  Debe tener esta estructura exacta para que la sincronización funcione:
                </p>
                <pre style={{
                  margin: 0, padding: '12px', background: '#fff', border: '1px solid #bee3f8', borderRadius: '8px',
                  fontSize: '0.78rem', lineHeight: 1.6, color: '#1a202c', overflowX: 'auto',
                }}>
{`📁 (la carpeta raíz que configures abajo)
 └── 📁 <Apellidos Nombres>   ← 1 carpeta por empleado, con ese formato exacto
        └── (sus documentos: cédula, contrato, etc.)`}
                </pre>
                <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: '#718096' }}>
                  El nombre de la carpeta es solo <strong>apellidos y nombres</strong>, sin guion, sin cédula y sin puesto (ej. "Torres Vega María José"). La cédula y el puesto se guardan dentro de <code>datos.json</code>, en la misma carpeta. Las carpetas con el formato viejo se siguen leyendo: la sincronización solo te avisa cuáles conviene renombrar.
                </p>
                <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#718096' }}>
                  Abre la carpeta raíz en Drive y copia el enlace completo desde la barra de direcciones o con "Compartir → Copiar enlace".
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
                    <label>Enlace de la carpeta raíz de Personal Administrativo en Drive *</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={configFolderId}
                        onChange={(e) => { setConfigFolderId(e.target.value); setConfigTestResult(null); }}
                        placeholder="https://drive.google.com/drive/folders/1ABC123..."
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <OpenFolderButton value={configFolderId} />
                    </div>
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
                  {testingConfig ? 'Probando...' : 'Probar Conexión'}
                </button>
                <button className="auth-btn" onClick={handleSaveConfig} disabled={savingConfig} style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: savingConfig ? 0.6 : 1 }}>
                  {savingConfig ? 'Guardando...' : 'Guardar Configuración'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmandoEliminar && (
        <ConfirmDialog
          title="Eliminar empleado"
          message={`¿Estás seguro de eliminar a ${confirmandoEliminar.employeeName}? Se borrará su registro de Drive y candidato.`}
          confirmLabel="Sí, eliminar"
          danger
          onConfirm={confirmarEliminarEmployee}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}
