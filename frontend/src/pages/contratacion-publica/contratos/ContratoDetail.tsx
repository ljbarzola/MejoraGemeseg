import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Trash2, Upload, Download, RefreshCw, FileSignature } from 'lucide-react';
import {
  getContrato,
  getPuestosByContrato,
  deletePuesto,
  addAdendaContrato,
  removeAdendaContrato,
  addAdjuntoContrato,
  removeAdjuntoContrato,
  resolveContratoFileUrl,
  renovarContrato,
  getHorariosByContrato,
  getInformesByContrato,
} from '../../../services/contratacion-publica.service';
import type {
  CPContrato,
  CPPuestoServicio,
  CPHorarioMensual,
  CPInformeMensual,
} from '../../../types/contratacion-publica';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import DateInput from '../../../components/common/DateInput';
import PuestoFormModal from '../puestos/PuestoFormModal';

const TABS = ['PUESTOS', 'ADENDAS', 'ADJUNTOS', 'HORARIOS', 'INFORMES'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  PUESTOS: 'Puestos',
  ADENDAS: 'Adendas',
  ADJUNTOS: 'Adjuntos',
  HORARIOS: 'Horarios',
  INFORMES: 'Informes',
};

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const ESTADO_HORARIO_COLOR: Record<string, { bg: string; fg: string }> = {
  BORRADOR: { bg: '#fefcbf', fg: '#975a16' },
  ENVIADO: { bg: '#bee3f8', fg: '#2b6cb0' },
  APROBADO: { bg: '#c6f6d5', fg: '#276749' },
  RECHAZADO: { bg: '#fed7d7', fg: '#c53030' },
};

function formatFecha(date: string) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ContratoDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const contratoId = Number(id);

  const [contrato, setContrato] = useState<CPContrato | null>(null);
  const [puestos, setPuestos] = useState<CPPuestoServicio[]>([]);
  const [horarios, setHorarios] = useState<CPHorarioMensual[]>([]);
  const [informes, setInformes] = useState<CPInformeMensual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>('PUESTOS');

  const [showPuestoModal, setShowPuestoModal] = useState(false);
  const [editingPuesto, setEditingPuesto] = useState<CPPuestoServicio | null>(null);
  const [confirmandoEliminarPuesto, setConfirmandoEliminarPuesto] = useState<CPPuestoServicio | null>(null);

  const [showAdendaForm, setShowAdendaForm] = useState(false);
  const [adendaNumero, setAdendaNumero] = useState('');
  const [adendaDescripcion, setAdendaDescripcion] = useState('');
  const [adendaFechaInicio, setAdendaFechaInicio] = useState('');
  const [adendaFechaFin, setAdendaFechaFin] = useState('');
  const [savingAdenda, setSavingAdenda] = useState(false);
  const [confirmandoEliminarAdenda, setConfirmandoEliminarAdenda] = useState<number | null>(null);

  const [adjuntoTipo, setAdjuntoTipo] = useState('CONTRATO');
  const [uploadingAdjunto, setUploadingAdjunto] = useState(false);
  const [confirmandoEliminarAdjunto, setConfirmandoEliminarAdjunto] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showRenovarForm, setShowRenovarForm] = useState(false);
  const [renovarNumero, setRenovarNumero] = useState('');
  const [renovarFechaInicio, setRenovarFechaInicio] = useState('');
  const [renovarFechaFin, setRenovarFechaFin] = useState('');
  const [savingRenovar, setSavingRenovar] = useState(false);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const load = () => {
    setLoading(true);
    setError('');
    Promise.all([
      getContrato(contratoId),
      getPuestosByContrato(contratoId),
      getHorariosByContrato(contratoId),
      getInformesByContrato(contratoId),
    ])
      .then(([c, p, h, inf]) => { setContrato(c); setPuestos(p); setHorarios(h); setInformes(inf); })
      .catch((err) => setError(err.response?.data?.message || 'No se pudo cargar el contrato.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [contratoId]);

  const handleSubmitAdenda = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!adendaNumero.trim()) {
      setError('El número de la adenda es obligatorio.');
      return;
    }
    setSavingAdenda(true);
    try {
      await addAdendaContrato(contratoId, {
        numero: adendaNumero.trim(),
        descripcion: adendaDescripcion.trim() || undefined,
        fechaInicio: adendaFechaInicio || undefined,
        fechaFin: adendaFechaFin || undefined,
      });
      setShowAdendaForm(false);
      setAdendaNumero(''); setAdendaDescripcion(''); setAdendaFechaInicio(''); setAdendaFechaFin('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar la adenda.');
    } finally {
      setSavingAdenda(false);
    }
  };

  const confirmarEliminarAdenda = async () => {
    const adendaId = confirmandoEliminarAdenda;
    setConfirmandoEliminarAdenda(null);
    if (adendaId == null) return;
    try {
      await removeAdendaContrato(contratoId, adendaId);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo eliminar la adenda.');
    }
  };

  const handleUploadAdjunto = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    setUploadingAdjunto(true);
    setError('');
    try {
      await addAdjuntoContrato(contratoId, file, adjuntoTipo);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo subir el adjunto.');
    } finally {
      setUploadingAdjunto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmarEliminarAdjunto = async () => {
    const adjuntoId = confirmandoEliminarAdjunto;
    setConfirmandoEliminarAdjunto(null);
    if (adjuntoId == null) return;
    try {
      await removeAdjuntoContrato(contratoId, adjuntoId);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo eliminar el adjunto.');
    }
  };

  const confirmarEliminarPuesto = async () => {
    const p = confirmandoEliminarPuesto;
    setConfirmandoEliminarPuesto(null);
    if (!p) return;
    try {
      await deletePuesto(p.id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo eliminar el puesto.');
    }
  };

  const handleSubmitRenovar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!renovarNumero.trim() || !renovarFechaInicio || !renovarFechaFin) {
      setError('Completa número y fechas de la renovación.');
      return;
    }
    setSavingRenovar(true);
    try {
      const nuevo = await renovarContrato(contratoId, {
        numero: renovarNumero.trim(),
        fechaInicio: renovarFechaInicio,
        fechaFin: renovarFechaFin,
      });
      navigate(`/contratacion-publica/contratos/${nuevo.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo renovar el contrato.');
    } finally {
      setSavingRenovar(false);
    }
  };

  if (loading) {
    return <div className="page-container"><div className="loading-state">Cargando contrato...</div></div>;
  }
  if (!contrato) {
    return <div className="page-container"><div className="empty-state">Contrato no encontrado.</div></div>;
  }

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate('/contratacion-publica/contratos')} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">CONTRATACIÓN PÚBLICA · {contrato.entidad?.nombre}</p>
            <h1>Contrato {contrato.numero}</h1>
          </div>
          <div className="header-actions">
            <button className="btn-secondary" onClick={() => navigate(`/contratacion-publica/contratos/${contratoId}/editar`)}>
              <Pencil size={16} /> Editar
            </button>
            <button className="btn-secondary" onClick={() => setShowRenovarForm(true)}>
              <RefreshCw size={16} /> Renovar
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div ref={errorRef} style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
      )}

      <div className="admin-section" style={{ marginBottom: '18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>OBJETO</div>
            <div style={{ fontSize: '0.9rem' }}>{contrato.objeto}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>REFERENCIA DEL PROCESO</div>
            <div style={{ fontSize: '0.9rem' }}>{contrato.referenciaProceso || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>VIGENCIA</div>
            <div style={{ fontSize: '0.9rem' }}>{formatFecha(contrato.fechaInicio)} — {formatFecha(contrato.fechaFin)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>VALOR TOTAL</div>
            <div style={{ fontSize: '0.9rem' }}>{contrato.valorTotal != null ? `$${contrato.valorTotal.toFixed(2)}` : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>ESTADO</div>
            <div><span className="status-badge">{contrato.estado === 'ACTIVO' ? 'Activo' : 'Finalizado'}</span></div>
          </div>
        </div>
      </div>

      <div className="admin-section">
        <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid #e2e8f0', marginBottom: '18px', flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '10px 16px',
                border: 'none',
                background: 'none',
                borderBottom: tab === t ? '2px solid var(--azul-oscuro)' : '2px solid transparent',
                color: tab === t ? 'var(--azul-oscuro)' : '#718096',
                fontWeight: tab === t ? 700 : 500,
                cursor: 'pointer',
                fontSize: '0.88rem',
              }}
            >
              {TAB_LABEL[t]}
              {t === 'PUESTOS' && ` (${puestos.length})`}
              {t === 'ADENDAS' && ` (${contrato.adendas?.length || 0})`}
              {t === 'ADJUNTOS' && ` (${contrato.adjuntos?.length || 0})`}
              {t === 'HORARIOS' && ` (${horarios.length})`}
              {t === 'INFORMES' && ` (${informes.length})`}
            </button>
          ))}
        </div>

        {tab === 'PUESTOS' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
              <button className="auth-btn" onClick={() => { setEditingPuesto(null); setShowPuestoModal(true); }}>
                <Plus size={16} /> Nuevo Puesto
              </button>
            </div>
            {puestos.length === 0 ? (
              <div className="empty-state">No hay puestos de servicio creados para este contrato.</div>
            ) : (
              <div className="tasks-table-wrapper">
                <table className="tasks-table">
                  <thead>
                    <tr>
                      <th>Puesto</th>
                      <th>Tipo de turno</th>
                      <th>Cant. guardias</th>
                      <th>Guardias asignados</th>
                      <th style={{ textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {puestos.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                        <td>{p.tipoTurno}</td>
                        <td>{p.cantidadGuardias}</td>
                        <td>{p.guardias?.length || 0}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="acciones-iconos">
                            <button type="button" className="btn-secondary icon-btn" title="Editar / asignar guardias" aria-label="Editar / asignar guardias" onClick={() => { setEditingPuesto(p); setShowPuestoModal(true); }}>
                              <Pencil size={16} />
                            </button>
                            <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Eliminar puesto" aria-label="Eliminar puesto" onClick={() => setConfirmandoEliminarPuesto(p)}>
                              <Trash2 size={16} />
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
        )}

        {tab === 'ADENDAS' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
              <button className="auth-btn" onClick={() => setShowAdendaForm((v) => !v)}>
                <Plus size={16} /> Nueva Adenda
              </button>
            </div>

            {showAdendaForm && (
              <form onSubmit={handleSubmitAdenda} style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Número *</label>
                  <input type="text" value={adendaNumero} onChange={(e) => setAdendaNumero(e.target.value)} required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Descripción</label>
                  <textarea value={adendaDescripcion} onChange={(e) => setAdendaDescripcion(e.target.value)} rows={2} />
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: '1 1 180px', margin: 0 }}>
                    <label>Fecha inicio</label>
                    <DateInput value={adendaFechaInicio} onChange={setAdendaFechaInicio} />
                  </div>
                  <div className="form-group" style={{ flex: '1 1 180px', margin: 0 }}>
                    <label>Fecha fin</label>
                    <DateInput value={adendaFechaFin} onChange={setAdendaFechaFin} min={adendaFechaInicio || undefined} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowAdendaForm(false)}>Cancelar</button>
                  <button type="submit" className="auth-btn" disabled={savingAdenda}>{savingAdenda ? 'Guardando...' : 'Guardar Adenda'}</button>
                </div>
              </form>
            )}

            {(contrato.adendas?.length || 0) === 0 ? (
              <div className="empty-state">No hay adendas registradas.</div>
            ) : (
              <div className="tasks-table-wrapper">
                <table className="tasks-table">
                  <thead>
                    <tr><th>Número</th><th>Descripción</th><th>Vigencia</th><th style={{ textAlign: 'right' }}>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {contrato.adendas!.map((a) => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>{a.numero}</td>
                        <td><span className="truncate">{a.descripcion || '—'}</span></td>
                        <td style={{ fontSize: '0.82rem' }}>{a.fechaInicio ? `${formatFecha(a.fechaInicio)} — ${formatFecha(a.fechaFin || '')}` : '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="acciones-iconos">
                            <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Eliminar adenda" aria-label="Eliminar adenda" onClick={() => setConfirmandoEliminarAdenda(a.id)}>
                              <Trash2 size={16} />
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
        )}

        {tab === 'ADJUNTOS' && (
          <div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
              <select className="filter-select" value={adjuntoTipo} onChange={(e) => setAdjuntoTipo(e.target.value)}>
                <option value="CONTRATO">Contrato</option>
                <option value="POLIZA">Póliza</option>
                <option value="OTRO">Otro</option>
              </select>
              <input ref={fileInputRef} type="file" onChange={handleUploadAdjunto} style={{ display: 'none' }} id="cp-adjunto-input" />
              <button className="auth-btn" onClick={() => fileInputRef.current?.click()} disabled={uploadingAdjunto} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Upload size={16} /> {uploadingAdjunto ? 'Subiendo...' : 'Subir Adjunto'}
              </button>
            </div>

            {(contrato.adjuntos?.length || 0) === 0 ? (
              <div className="empty-state">No hay adjuntos cargados.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {contrato.adjuntos!.map((a) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{a.nombre}</div>
                      <div style={{ fontSize: '0.72rem', color: '#718096' }}>{a.tipo || 'Sin tipo'} · {formatFecha(a.createdAt)}</div>
                    </div>
                    <div className="acciones-iconos">
                      <a className="btn-secondary icon-btn" href={resolveContratoFileUrl(a.filePath)} target="_blank" rel="noopener noreferrer" title="Descargar" aria-label="Descargar">
                        <Download size={16} />
                      </a>
                      <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Eliminar" aria-label="Eliminar" onClick={() => setConfirmandoEliminarAdjunto(a.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'HORARIOS' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
              <button className="auth-btn" onClick={() => navigate(`/contratacion-publica/horarios?contratoId=${contratoId}`)}>
                <Plus size={16} /> Gestionar Horarios
              </button>
            </div>
            {horarios.length === 0 ? (
              <div className="empty-state">No hay horarios mensuales creados para este contrato.</div>
            ) : (
              <div className="tasks-table-wrapper">
                <table className="tasks-table">
                  <thead>
                    <tr><th>Periodo</th><th>Estado</th><th style={{ textAlign: 'right' }}>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {horarios.map((h) => (
                      <tr key={h.id}>
                        <td style={{ fontWeight: 600 }}>{MESES[h.mes - 1]} {h.anio}</td>
                        <td>
                          <span className="status-badge" style={{ background: ESTADO_HORARIO_COLOR[h.estado]?.bg, color: ESTADO_HORARIO_COLOR[h.estado]?.fg }}>
                            {h.estado}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn-secondary" onClick={() => navigate(`/contratacion-publica/horarios/${h.id}`)}>Abrir</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'INFORMES' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
              <button className="auth-btn" onClick={() => navigate(`/contratacion-publica/informes/nuevo?contratoId=${contratoId}`)}>
                <FileSignature size={16} /> Nuevo Informe
              </button>
            </div>
            {informes.length === 0 ? (
              <div className="empty-state">No hay informes mensuales creados para este contrato.</div>
            ) : (
              <div className="tasks-table-wrapper">
                <table className="tasks-table">
                  <thead>
                    <tr><th>Periodo</th><th>Estado</th><th style={{ textAlign: 'right' }}>Acciones</th></tr>
                  </thead>
                  <tbody>
                    {informes.map((inf) => (
                      <tr key={inf.id}>
                        <td style={{ fontWeight: 600 }}>{MESES[inf.mes - 1]} {inf.anio}</td>
                        <td><span className="status-badge">{inf.estado === 'GENERADO' ? 'Generado' : 'Borrador'}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn-secondary" onClick={() => navigate(`/contratacion-publica/informes/${inf.id}`)}>Abrir</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {showPuestoModal && (
        <PuestoFormModal
          contratoId={contratoId}
          puesto={editingPuesto}
          onClose={() => setShowPuestoModal(false)}
          onSaved={load}
        />
      )}

      {showRenovarForm && (
        <div className="modal-overlay" onClick={() => setShowRenovarForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>Renovar Contrato</h3></div>
            <form onSubmit={handleSubmitRenovar}>
              <div className="modal-body">
                <p style={{ fontSize: '0.82rem', color: '#718096', marginTop: 0 }}>
                  Se crea un contrato nuevo (hereda entidad, objeto y referencia salvo que los cambies). Este contrato original queda intacto — si en cambio necesitas extender el mismo contrato, usa "Nueva Adenda".
                </p>
                <div className="form-group">
                  <label>Número del nuevo contrato *</label>
                  <input type="text" value={renovarNumero} onChange={(e) => setRenovarNumero(e.target.value)} required />
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: '1 1 180px' }}>
                    <label>Fecha inicio *</label>
                    <DateInput value={renovarFechaInicio} onChange={setRenovarFechaInicio} required />
                  </div>
                  <div className="form-group" style={{ flex: '1 1 180px' }}>
                    <label>Fecha fin *</label>
                    <DateInput value={renovarFechaFin} onChange={setRenovarFechaFin} min={renovarFechaInicio || undefined} required />
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowRenovarForm(false)}>Cancelar</button>
                <button type="submit" className="auth-btn" disabled={savingRenovar}>{savingRenovar ? 'Renovando...' : 'Renovar Contrato'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmandoEliminarPuesto && (
        <ConfirmDialog
          title="Eliminar puesto"
          message={`¿Eliminar el puesto "${confirmandoEliminarPuesto.nombre}"?`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminarPuesto}
          onCancel={() => setConfirmandoEliminarPuesto(null)}
        />
      )}

      {confirmandoEliminarAdenda != null && (
        <ConfirmDialog
          title="Eliminar adenda"
          message="¿Eliminar esta adenda?"
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminarAdenda}
          onCancel={() => setConfirmandoEliminarAdenda(null)}
        />
      )}

      {confirmandoEliminarAdjunto != null && (
        <ConfirmDialog
          title="Eliminar adjunto"
          message="¿Eliminar este adjunto?"
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminarAdjunto}
          onCancel={() => setConfirmandoEliminarAdjunto(null)}
        />
      )}
    </div>
  );
}
