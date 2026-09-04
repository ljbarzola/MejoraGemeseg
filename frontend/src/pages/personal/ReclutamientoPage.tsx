import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  getJobPositions,
  createJobPosition,
  updateJobPosition,
  deleteJobPosition,
  syncReclutamientoCandidates,
} from '../../services/personal.service';

interface JobPosition {
  id: number;
  puesto: string;
  descripcion?: string;
  camposRequeridos: string[];
  archivosRequeridos: string[];
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
  archivosRequeridos: string[];
  archivosSubidosList: { id: string; name: string }[];
  folderUrl: string;
  datosFormulario: Record<string, any>;
  telefono?: string;
  email?: string;
}

export default function ReclutamientoPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [puestos, setPuestos] = useState<JobPosition[]>([]);
  const [candidatos, setCandidatos] = useState<Candidate[]>([]);
  const [loadingPuestos, setLoadingPuestos] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');

  const [showPuestoModal, setShowPuestoModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState<JobPosition | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  // New Position Form
  const [nuevoPuesto, setNuevoPuesto] = useState('');
  const [nuevaDescripcion, setNuevaDescripcion] = useState('');
  const [camposList, setCamposList] = useState<string[]>([
    'Nombre completo',
    'Cédula',
    'Teléfono',
    'Email',
  ]);
  const [archivosList, setArchivosList] = useState<string[]>([
    'Hoja de Vida',
    'Cédula',
    'Antecedentes Penales',
    'Título de Bachiller',
  ]);

  const [nuevoCampoInput, setNuevoCampoInput] = useState('');
  const [nuevoArchivoInput, setNuevoArchivoInput] = useState('');
  const [savingPuesto, setSavingPuesto] = useState(false);
  const [puestoError, setPuestoError] = useState('');
  const [syncError, setSyncError] = useState('');

  const loadPositions = () => {
    setLoadingPuestos(true);
    getJobPositions()
      .then(setPuestos)
      .catch(() => setPuestos([]))
      .finally(() => setLoadingPuestos(false));
  };

  const handleSync = () => {
    setSyncing(true);
    setSyncError('');
    syncReclutamientoCandidates()
      .then((res) => {
        if (res?.candidatos) setCandidatos(res.candidatos);
        if (res?.warning) setSyncError(res.warning);
      })
      .catch((err: any) => {
        setCandidatos([]);
        setSyncError(err.response?.data?.message || 'No se pudo sincronizar con Google Drive. Verifica la configuraci�n de Drive.');
      })
      .finally(() => setSyncing(false));
  };

  useEffect(() => {
    loadPositions();
    handleSync();
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
      await updateJobPosition(editingPosition.id, {
        puesto: nuevoPuesto.trim(),
        descripcion: nuevaDescripcion.trim() || undefined,
        camposRequeridos: camposList,
        archivosRequeridos: archivosList,
      });
      setShowPuestoModal(false);
      setEditingPosition(null);
      resetForm();
      loadPositions();
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
    setShowPuestoModal(true);
  };

  const resetForm = () => {
    setNuevoPuesto('');
    setNuevaDescripcion('');
    setCamposList(['Nombre completo', 'Cédula', 'Teléfono', 'Email']);
    setArchivosList(['Hoja de Vida', 'Cédula', 'Antecedentes Penales', 'Título de Bachiller']);
    setNuevoCampoInput('');
    setNuevoArchivoInput('');
    setPuestoError('');
  };

  const handleDeletePosition = async (id: number) => {
    if (!confirm('¿Eliminar esta vacante/puesto de trabajo?')) return;
    try {
      await deleteJobPosition(id);
      loadPositions();
    } catch {
      alert('Error al eliminar puesto.');
    }
  };

  const filteredCandidates = candidatos.filter(
    (c) =>
      c.nombre.toLowerCase().includes(search.toLowerCase()) ||
      c.cedula.includes(search) ||
      c.puestoAplicado.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate(location.state?.from || '/personal')}>
            ← Volver
          </button>
          <div>
            <p className="page-eyebrow">PERSONAL Y RECURSOS HUMANOS</p>
            <h1>Reclutamiento y Vacantes</h1>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Sincronizando...' : '🔄 Sincronizar'}
          </button>
          <button className="auth-btn" onClick={() => { resetForm(); setEditingPosition(null); setShowPuestoModal(true); }}>
            + Crear Puesto / Vacante
          </button>
        </div>
      </div>

      {syncError && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{syncError}</div>
      )}

      {/* SECTION 1: VACANTES / PUESTOS DE TRABAJO */}
      <div className="admin-section" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#100F31', marginBottom: '14px' }}>
          📌 Vacantes Creadas ({puestos.length})
        </h2>

        {loadingPuestos ? (
          <div className="loading-state">Cargando puestos...</div>
        ) : puestos.length === 0 ? (
          <div className="empty-state">
            No hay puestos creados. Haz clic en <strong>"+ Crear Puesto / Vacante"</strong> para publicar uno.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {puestos.map((p) => (
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
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#100F31' }}>{p.puesto}</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => openEditModal(p)}
                        style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.8rem' }}
                        title="Editar vacante"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeletePosition(p.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}
                        title="Eliminar vacante"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  {p.descripcion && <p style={{ fontSize: '0.82rem', color: '#4a5568', marginBottom: '10px' }}>{p.descripcion}</p>}

                  <div style={{ fontSize: '0.78rem', color: '#718096', marginBottom: '6px' }}>
                    <strong>Formulario ({p.camposRequeridos?.length || 0}):</strong> {p.camposRequeridos?.join(', ') || 'Ninguno'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#718096' }}>
                    <strong>Archivos Requeridos ({p.archivosRequeridos?.length || 0}):</strong> {p.archivosRequeridos?.join(', ') || 'Ninguno'}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#100F31', margin: 0 }}>
            👥 Candidatos Postulados ({candidatos.length})
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
                  <th style={{ minWidth: '160px' }}>% Completitud</th>
                  <th>Documentos Subidos</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map((c) => (
                  <tr key={c.id || c.cedula}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#100F31' }}>{c.nombre}</div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.cedula}</td>
                    <td>
                      <span style={{ padding: '4px 10px', borderRadius: '12px', background: '#eff6ff', color: '#1d4ed8', fontSize: '0.78rem', fontWeight: 700 }}>
                        {c.puestoAplicado}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, background: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${c.completitudPercent}%`,
                              background: c.completitudPercent === 100 ? '#22c55e' : c.completitudPercent >= 50 ? '#3b82f6' : '#d97706',
                              height: '100%',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#100F31' }}>{c.completitudPercent}%</span>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: '#4a5568' }}>
                      {c.archivosSubidosCount} de {c.archivosRequeridosCount || '—'} archivos
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedCandidate(c)}
                        style={{
                          padding: '6px 14px',
                          background: '#100F31',
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
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={() => setSelectedCandidate(null)}>
          <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '650px', width: '95%', maxHeight: '85vh', overflow: 'auto', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#100F31', fontSize: '1.2rem', fontWeight: 800 }}>Expediente del Candidato</h2>
                <p style={{ margin: '2px 0 0', color: '#718096', fontSize: '0.85rem' }}>Puesto: <strong>{selectedCandidate.puestoAplicado}</strong></p>
              </div>
              <button onClick={() => setSelectedCandidate(null)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#718096' }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* DATOS GENERALES */}
              <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#718096', fontWeight: 700 }}>NOMBRE COMPLETO</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#100F31' }}>{selectedCandidate.nombre}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#718096', fontWeight: 700 }}>CÉDULA</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'monospace' }}>{selectedCandidate.cedula}</div>
                </div>
                {selectedCandidate.telefono && (
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#718096', fontWeight: 700 }}>TELÉFONO</div>
                    <div style={{ fontSize: '0.85rem' }}>{selectedCandidate.telefono}</div>
                  </div>
                )}
                {selectedCandidate.email && (
                  <div>
                    <div style={{ fontSize: '0.7rem', color: '#718096', fontWeight: 700 }}>EMAIL</div>
                    <div style={{ fontSize: '0.85rem' }}>{selectedCandidate.email}</div>
                  </div>
                )}
              </div>

              {/* BARRA DE COMPLETITUD */}
              <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#100F31' }}>Porcentaje de Completitud</span>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: selectedCandidate.completitudPercent === 100 ? '#22c55e' : '#3b82f6' }}>
                    {selectedCandidate.completitudPercent}%
                  </span>
                </div>
                <div style={{ width: '100%', background: '#e2e8f0', height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${selectedCandidate.completitudPercent}%`,
                      background: selectedCandidate.completitudPercent === 100 ? '#22c55e' : '#3b82f6',
                      height: '100%',
                    }}
                  />
                </div>
              </div>

              {/* LISTA DE ARCHIVOS SOLICITADOS VS SUBIDOS */}
              <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 10px', fontSize: '0.85rem', fontWeight: 700, color: '#100F31' }}>
                  📂 Archivos Requeridos para el Puesto ({selectedCandidate.archivosRequeridosCount})
                </h3>

                {selectedCandidate.archivosRequeridos?.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: '#718096', margin: 0 }}>No hay requerimientos específicos creados para este puesto.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {selectedCandidate.archivosRequeridos.map((req) => {
                      const found = selectedCandidate.archivosSubidosList.some((f) => f.name.toLowerCase().includes(req.toLowerCase()));
                      return (
                        <div key={req} style={{ padding: '6px 10px', background: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                          <span>{req}</span>
                          {found ? (
                            <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ Subido</span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 700 }}>✕ Pendiente</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* BOTÓN VER CARPETA EN DRIVE */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
                <button onClick={() => setSelectedCandidate(null)} className="btn-secondary">
                  Cerrar
                </button>
                <button
                  onClick={() => window.open(selectedCandidate.folderUrl, '_blank')}
                  className="auth-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  📁 Ver Carpeta en Drive ↗
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR PUESTO / VACANTE */}
      {showPuestoModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={() => { setShowPuestoModal(false); setEditingPosition(null); resetForm(); }}>
          <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '550px', width: '95%', maxHeight: '85vh', overflow: 'auto', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <h2 style={{ margin: 0, color: '#100F31', fontSize: '1.1rem', fontWeight: 800 }}>{editingPosition ? 'Editar Puesto / Vacante' : 'Crear Puesto / Vacante'}</h2>
              <button onClick={() => { setShowPuestoModal(false); setEditingPosition(null); resetForm(); }} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={editingPosition ? handleEditPosition : handleCreatePosition} className="cacao-form">
              {puestoError && <div className="form-error">{puestoError}</div>}

              <div className="form-group">
                <label>Nombre del Puesto *</label>
                <input type="text" value={nuevoPuesto} onChange={(e) => setNuevoPuesto(e.target.value)} placeholder="Ej: Guardia de Seguridad" required />
              </div>

              <div className="form-group">
                <label>Descripción / Requisitos Básicos</label>
                <textarea value={nuevaDescripcion} onChange={(e) => setNuevaDescripcion(e.target.value)} rows={2} placeholder="Ej: Puesto para custodia en rutas de transporte..." />
              </div>

              {/* CAMPOS REQUERIDOS DE FORMULARIO */}
              <div className="form-group">
                <label>Campos de Formulario Solicitados</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input type="text" value={nuevoCampoInput} onChange={(e) => setNuevoCampoInput(e.target.value)} placeholder="Ej: Sueldo Esperado" />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      if (nuevoCampoInput.trim()) {
                        setCamposList((prev) => [...prev, nuevoCampoInput.trim()]);
                        setNuevoCampoInput('');
                      }
                    }}
                  >
                    +
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {camposList.map((c, i) => (
                    <span key={i} style={{ padding: '4px 8px', background: '#e2e8f0', borderRadius: '6px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {c}
                      <button type="button" onClick={() => setCamposList((prev) => prev.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}>✕</button>
                    </span>
                  ))}
                </div>
              </div>

              {/* ARCHIVOS REQUERIDOS */}
              <div className="form-group">
                <label>Archivos PDF / Documentos Solicitados</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input type="text" value={nuevoArchivoInput} onChange={(e) => setNuevoArchivoInput(e.target.value)} placeholder="Ej: Antecedentes Penales" />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      if (nuevoArchivoInput.trim()) {
                        setArchivosList((prev) => [...prev, nuevoArchivoInput.trim()]);
                        setNuevoArchivoInput('');
                      }
                    }}
                  >
                    +
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {archivosList.map((a, i) => (
                    <span key={i} style={{ padding: '4px 8px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '6px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {a}
                      <button type="button" onClick={() => setArchivosList((prev) => prev.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer' }}>✕</button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: '20px' }}>
                <button type="button" className="btn-secondary" onClick={() => { setShowPuestoModal(false); setEditingPosition(null); resetForm(); }}>
                  Cancelar
                </button>
                <button type="submit" className="auth-btn" disabled={savingPuesto}>
                  {savingPuesto ? 'Guardando...' : editingPosition ? 'Guardar Cambios' : 'Crear Puesto en Drive'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
