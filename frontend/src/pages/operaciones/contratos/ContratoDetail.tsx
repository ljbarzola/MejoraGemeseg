import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ContratoFormModal from './ContratoFormModal';
import { fechaCorta } from '../../../utils/bitacoras';
import { ArrowLeft, CalendarPlus, Package, Pencil, Plus, Trash2, Upload, Download, RefreshCw, FileSignature } from 'lucide-react';
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
import { ESTADO_HORARIO_LABEL } from '../../../types/contratacion-publica';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import OperacionesPageHeader from '../../../components/operaciones/OperacionesPageHeader';
import DateInput from '../../../components/common/DateInput';
import PuestoFormModal from '../puestos/PuestoFormModal';
import { useModuloContratos } from '../../../hooks/useModuloContratos';
import { textoTurnos } from '../puestos/turnosPuesto';
import { getInventarioPorContrato } from '../../../services/inventario.service';
import type { InventarioDePuesto } from '../../../types/inventario';
import ArmasYEquipoContrato from '../inventario/ArmasYEquipoContrato';

const TABS = ['PUESTOS', 'INVENTARIO', 'ADENDAS', 'ADJUNTOS', 'HORARIOS', 'INFORMES'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  PUESTOS: 'Puestos',
  INVENTARIO: 'Armas y equipo',
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

const formatFecha = (date: string) => fechaCorta(date);

/**
 * Qué decirle a la persona cuando el contrato no abre. Antes cualquier fallo (permiso, red, un id raro) se veía como
 * «Contrato no encontrado», aunque el contrato existiera: se confundía un permiso que falta con un contrato que no está.
 */
function mensajeDeCarga(err: any): string {
  const estado = err?.response?.status;
  if (estado === 403) return 'No tienes permiso para ver este contrato. Pídele acceso a Operaciones a un administrador de tu empresa.';
  if (estado === 404) return 'Este contrato no existe o ya no está disponible. Vuelve a la lista de contratos.';
  if (estado === 400) return 'La dirección de este contrato no es válida. Vuelve a la lista de contratos y ábrelo desde ahí.';
  if (!err?.response) return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  return 'No se pudo cargar el contrato. Inténtalo de nuevo en un momento.';
}

/** Reintentar solo ayuda cuando fue la red o el servidor; con un permiso que falta o un contrato que no existe, no. */
const sePuedeReintentar = (err: any) => {
  const estado = err?.response?.status;
  return !estado || estado >= 500;
};

export default function ContratoDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const contratoId = Number(id);
  // En Contratación Pública no se ven los horarios (son de Operaciones): ni la pestaña ni su consulta.
  const { enCP, base, modulo, puedeEditar } = useModuloContratos();
  const tabs = TABS.filter((t) => !(enCP && (t === 'HORARIOS' || t === 'INVENTARIO')));

  const [contrato, setContrato] = useState<CPContrato | null>(null);
  const [puestos, setPuestos] = useState<CPPuestoServicio[]>([]);
  // Armas y equipo de cada puesto (solo en Operaciones; si no se puede leer, se avisa en su pestaña).
  const [inventarioPuestos, setInventarioPuestos] = useState<InventarioDePuesto[]>([]);
  const [cargandoInventario, setCargandoInventario] = useState(false);
  const [sinInventario, setSinInventario] = useState(false);
  const [enfocarPuesto, setEnfocarPuesto] = useState<number | null>(null);
  const [horarios, setHorarios] = useState<CPHorarioMensual[]>([]);
  const [informes, setInformes] = useState<CPInformeMensual[]>([]);
  // Lo accesorio se carga aparte: si falla no debe esconder el contrato, solo avisar en su pestaña.
  const [sinAccesoInformes, setSinAccesoInformes] = useState(false);
  const [fallaHorarios, setFallaHorarios] = useState(false);
  const [loading, setLoading] = useState(true);
  /** Por qué no abrió el contrato (si no abrió). `error` es para los fallos de lo que se hace dentro de la pantalla. */
  const [errorCarga, setErrorCarga] = useState('');
  const [reintentable, setReintentable] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  // Editar abre una ventana; `?editar=1` la abre sola (es lo que hace la dirección vieja `/:id/editar`).
  const [searchParams, setSearchParams] = useSearchParams();
  // «?tab=HORARIOS» abre esa pestaña: así volver desde un horario o un informe cae donde estaba la persona.
  const [tab, setTab] = useState<Tab>(() => {
    const pedida = searchParams.get('tab');
    return (TABS as readonly string[]).includes(pedida ?? '') && !(enCP && (pedida === 'HORARIOS' || pedida === 'INVENTARIO')) ? (pedida as Tab) : 'PUESTOS';
  });
  const [editandoContrato, setEditandoContrato] = useState(searchParams.get('editar') === '1');
  const cerrarEdicion = () => {
    setEditandoContrato(false);
    if (searchParams.has('editar')) {
      const resto = new URLSearchParams(searchParams);
      resto.delete('editar');
      setSearchParams(resto, { replace: true });
    }
  };

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
    setError('');
    if (!Number.isInteger(contratoId) || contratoId <= 0) {
      setContrato(null);
      setErrorCarga(mensajeDeCarga({ response: { status: 400 } }));
      setReintentable(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Lo esencial: sin el contrato y sus puestos no hay pantalla.
    Promise.all([getContrato(contratoId), getPuestosByContrato(contratoId)])
      .then(([c, p]) => { setContrato(c); setPuestos(p); setErrorCarga(''); })
      .catch((err) => { setContrato(null); setErrorCarga(mensajeDeCarga(err)); setReintentable(sePuedeReintentar(err)); })
      .finally(() => setLoading(false));
    // Lo demás va aparte y sin bloquear: un fallo aquí no debe impedir ver el contrato (antes, el permiso de
    // Contratación Pública que pedían los informes hacía que todo el contrato dijera «no encontrado»).
    if (!enCP) {
      setFallaHorarios(false);
      getHorariosByContrato(contratoId).then(setHorarios).catch(() => { setHorarios([]); setFallaHorarios(true); });
      setCargandoInventario(true);
      setSinInventario(false);
      getInventarioPorContrato(contratoId)
        .then(setInventarioPuestos)
        .catch(() => { setInventarioPuestos([]); setSinInventario(true); })
        .finally(() => setCargandoInventario(false));
    }
    setSinAccesoInformes(false);
    getInformesByContrato(contratoId)
      .then(setInformes)
      .catch((err) => { setInformes([]); if (err?.response?.status === 403) setSinAccesoInformes(true); });
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
      navigate(`${base}/${nuevo.id}`);
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
    return (
      <div className="page-container">
        <button className="cacao-back-btn" onClick={() => navigate(base)} style={{ marginBottom: 12 }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <div className="empty-state">
          <div>{errorCarga || 'No se pudo cargar el contrato.'}</div>
          {reintentable && <button className="btn-secondary" style={{ marginTop: 12 }} onClick={load}>Reintentar</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <button className="cacao-back-btn" onClick={() => navigate(base)} style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <OperacionesPageHeader
          eyebrow={modulo}
          title={`Contrato ${contrato.numero}`}
          description={`Contrato con ${contrato.entidad?.nombre ?? 'la entidad'}: sus puestos con sus turnos y guardias${enCP ? '' : ', las armas y el equipo que tiene'}, adendas, adjuntos${enCP ? '' : ', horarios'} e informes.`}
          actions={
            <>
              {!enCP && (
                <button className="btn-secondary" onClick={() => navigate(`/operaciones/inventario?pestana=contratos&buscar=${encodeURIComponent(contrato.numero)}`)} title="Ver este contrato en la lista de Inventario por contrato">
                  <Package size={16} /> Ver en Inventario
                </button>
              )}
              {puedeEditar && (
                <>
                  <button className="btn-secondary" onClick={() => setEditandoContrato(true)}>
                    <Pencil size={16} /> Editar
                  </button>
                  <button className="btn-secondary" onClick={() => setShowRenovarForm(true)}>
                    <RefreshCw size={16} /> Renovar
                  </button>
                </>
              )}
            </>
          }
        />
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
            <div style={{ fontSize: '0.9rem' }}>{contrato.valorTotal != null ? `$${Number(contrato.valorTotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>ESTADO</div>
            <div><span className="status-badge">{contrato.estado === 'ACTIVO' ? 'Activo' : 'Finalizado'}</span></div>
          </div>
        </div>
      </div>

      <div className="admin-section">
        <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid #e2e8f0', marginBottom: '18px', flexWrap: 'wrap' }}>
          {tabs.map((t) => (
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
              {t === 'INVENTARIO' && !cargandoInventario && !sinInventario && ` (${inventarioPuestos.reduce((s, p) => s + p.totalArmas, 0)} ${inventarioPuestos.reduce((s, p) => s + p.totalArmas, 0) === 1 ? 'arma' : 'armas'})`}
              {t === 'ADENDAS' && ` (${contrato.adendas?.length || 0})`}
              {t === 'ADJUNTOS' && ` (${contrato.adjuntos?.length || 0})`}
              {t === 'HORARIOS' && !fallaHorarios && ` (${horarios.length})`}
              {t === 'INFORMES' && !sinAccesoInformes && ` (${informes.length})`}
            </button>
          ))}
        </div>

        {tab === 'PUESTOS' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
              {puestos.length > 0 && !enCP && (
                <button className="btn-secondary" style={{ marginRight: 10 }} onClick={() => navigate(`/operaciones/horarios?contratoId=${contratoId}&nuevo=1`)}>
                  <CalendarPlus size={16} /> Crear horario
                </button>
              )}
              {puedeEditar && (
                <button className="auth-btn" onClick={() => { setEditingPuesto(null); setShowPuestoModal(true); }}>
                  <Plus size={16} /> Nuevo Puesto
                </button>
              )}
            </div>
            {puestos.length === 0 ? (
              <div className="empty-state">No hay puestos de servicio creados para este contrato.</div>
            ) : (
              <div className="tasks-table-wrapper">
                <table className="tasks-table">
                  <thead>
                    <tr>
                      <th>Puesto</th>
                      <th>Jornada</th>
                      <th>Turnos</th>
                      <th>Mínimo por día</th>
                      <th>Cant. guardias</th>
                      <th>Guardias asignados</th>
                      {!enCP && <th>Armas y equipo</th>}
                      <th style={{ textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {puestos.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                        <td>{p.tipoTurno}</td>
                        <td style={{ fontSize: '0.82rem' }}>{textoTurnos(p.turnos) || <span style={{ color: '#a0aec0' }}>Sin definir</span>}</td>
                        <td>{p.guardiasSimultaneosRequeridos}</td>
                        <td>{p.cantidadGuardias}</td>
                        <td>{p.guardias?.length || 0}</td>
                        {!enCP && (
                          <td>
                            {(() => {
                              const inv = inventarioPuestos.find((x) => x.puestoId === p.id);
                              if (!inv || (inv.totalArmas === 0 && inv.totalEquipo === 0)) return <span style={{ color: '#a0aec0' }}>—</span>;
                              return (
                                <button type="button" className="enlace-tabla" style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit' }} onClick={() => { setEnfocarPuesto(p.id); setTab('INVENTARIO'); }}>
                                  {[
                                    inv.totalArmas > 0 ? `${inv.totalArmas} ${inv.totalArmas === 1 ? 'arma' : 'armas'}` : null,
                                    inv.chalecos > 0 ? `${inv.chalecos} ${inv.chalecos === 1 ? 'chaleco' : 'chalecos'}` : null,
                                    inv.municion + inv.otroEquipo > 0 ? `${inv.municion + inv.otroEquipo} de otro equipo y munición` : null,
                                  ].filter(Boolean).join(' · ')}
                                </button>
                              );
                            })()}
                          </td>
                        )}
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

        {tab === 'INVENTARIO' && (
          sinInventario ? (
            <div className="empty-state">No se pudieron cargar las armas y el equipo de este contrato. Inténtalo de nuevo en un momento.</div>
          ) : (
            <ArmasYEquipoContrato puestos={inventarioPuestos} cargando={cargandoInventario} enfocar={enfocarPuesto} />
          )
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
              <button className="auth-btn" onClick={() => navigate(`/operaciones/horarios?contratoId=${contratoId}`)}>
                <Plus size={16} /> Gestionar Horarios
              </button>
            </div>
            {fallaHorarios ? (
              <div className="empty-state">No se pudieron cargar los horarios de este contrato. Inténtalo de nuevo en un momento.</div>
            ) : horarios.length === 0 ? (
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
                            {ESTADO_HORARIO_LABEL[h.estado] ?? h.estado}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn-secondary" onClick={() => navigate(`/operaciones/horarios/${h.id}`, { state: { volverA: `${base}/${contratoId}?tab=HORARIOS` } })}>Abrir</button>
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
            {!sinAccesoInformes && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
                <button className="auth-btn" onClick={() => navigate(`/contratacion-publica/informes/nuevo?contratoId=${contratoId}`)}>
                  <FileSignature size={16} /> Nuevo Informe
                </button>
              </div>
            )}
            {sinAccesoInformes ? (
              <div className="empty-state">
                Los informes mensuales de este contrato son de Contratación Pública y tu usuario no tiene acceso a esa sección. Si los necesitas,
                pídele acceso a un administrador de tu empresa.
              </div>
            ) : informes.length === 0 ? (
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

      {editandoContrato && (
        <ContratoFormModal
          contrato={contrato}
          onClose={cerrarEdicion}
          onSaved={() => { cerrarEdicion(); load(); }}
        />
      )}

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
