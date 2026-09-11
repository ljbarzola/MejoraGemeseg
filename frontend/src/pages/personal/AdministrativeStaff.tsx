import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Settings, FileCog, X, IdCard } from 'lucide-react';
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
import DocumentosRequeridosModal from '../../components/personal/DocumentosRequeridosModal';

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
    try {
      await syncPersonalAdminFolder();
      loadStaff();
    } catch {
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
      const result = await testDriveConnection({ driveFolderId: cleanId, type: 'PERSONAL_ADMIN' });
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

  const handleDeleteEmployee = async (emp: StaffRow) => {
    if (!window.confirm(`¿Estás seguro de eliminar a ${emp.employeeName}? Se borrará su registro de Drive y candidato.`)) return;
    try {
      await deleteDriveEmployee(emp.cedula);
      if (selectedEmployee?.cedula === emp.cedula) setSelectedEmployee(null);
      loadStaff();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al eliminar');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate('/rrhh')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <p className="page-eyebrow">RECURSOS HUMANOS</p>
            <h1>Personal Administrativo</h1>
            <p style={{ color: '#718096', fontSize: '0.85rem', marginTop: '4px' }}>
              Personal de oficina y administrativo sincronizado desde Google Drive
            </p>
          </div>

          <div className="header-actions">
            <button className="btn-secondary" onClick={handleSync} disabled={syncing}>
              <RefreshCw size={16} className={syncing ? 'spin' : undefined} />
              {syncing ? 'Sincronizando...' : 'Sincronizar Drive'}
            </button>
            <button className="btn-secondary" onClick={openConfigModal} title="Configurar carpeta de Drive de Personal Administrativo">
              <Settings size={16} /> Configurar Drive
            </button>
            <button className="btn-secondary" onClick={() => setShowDocTypesModal(true)} title="Configurar qué documentos son obligatorios para este grupo">
              <FileCog size={16} /> Documentos Requeridos
            </button>
          </div>
        </div>
      </div>

      <div className="admin-section" style={{ marginTop: '20px' }}>
        {loading ? (
          <div className="loading-state">Cargando...</div>
        ) : staff.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 32px', color: '#a0aec0' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📂</div>
            <p>No hay personal administrativo en Drive</p>
            <p style={{ fontSize: '0.8rem', marginTop: '8px' }}>
              Configura la carpeta y sincroniza para importar
            </p>
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Puesto</th>
                  <th>Departamento</th>
                  <th>Fecha de ingreso</th>
                  <th>Estado</th>
                  <th>Cumplimiento</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((emp) => (
                  <tr key={emp.cedula}>
                    <td style={{ fontWeight: 700, color: 'var(--azul-oscuro)' }}>{emp.employeeName}</td>
                    <td>{emp.puesto || '—'}</td>
                    <td>{emp.ficha?.departamento || '—'}</td>
                    <td>{emp.ficha?.fechaIngreso ? new Date(emp.ficha.fechaIngreso).toLocaleDateString('es-EC') : '—'}</td>
                    <td>
                      <span className="status-badge" style={{
                        background: (emp.ficha?.activo ?? true) ? '#c6f6d5' : '#fed7d7',
                        color: (emp.ficha?.activo ?? true) ? '#276749' : '#c53030',
                      }}>
                        {(emp.ficha?.activo ?? true) ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>{emp.documentCount} archivos</td>
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
        <DocumentosRequeridosModal onClose={() => setShowDocTypesModal(false)} />
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
 └── 📁 <Nombre Apellido - Puesto>   ← 1 carpeta por empleado, con ese formato exacto
        └── (sus documentos: cédula, contrato, etc.)`}
                </pre>
                <p style={{ margin: '10px 0 0', fontSize: '0.8rem', color: '#718096' }}>
                  A diferencia de Custodios, aquí el nombre de carpeta NO lleva cédula — va el <strong>puesto</strong> (ej. "María Torres - Contadora").
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
                    <label>ID de la carpeta raíz de Personal Administrativo en Drive *</label>
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
    </div>
  );
}
