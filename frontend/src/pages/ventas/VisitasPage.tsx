import { useState, useEffect, useMemo, useRef } from 'react';
import ResultadosVisitas from './VentasReportes';
import { useNavigate } from 'react-router-dom';
import { Briefcase, FileText, MapPin, Pencil, Phone, Plus, Trash2, XCircle } from 'lucide-react';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import PageTabs from '../../components/common/PageTabs';
import VentasPageHeader from '../../components/ventas/VentasPageHeader';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import DateInput from '../../components/common/DateInput';
import FilterField from '../../components/common/FilterField';
import RowActionsMenu, { type RowAction } from '../../components/common/RowActionsMenu';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import { getVisits, checkInVisit, completeVisit, cancelVisit, deleteVisit, ClientVisit, type CheckInPorConfirmar } from '../../services/ventas.service';
import VisitaModal from '../../components/ventas/VisitaModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PromptDialog from '../../components/common/PromptDialog';
import { useToast } from '../../contexts/ToastContext';

const OUTCOME_LABELS: Record<string, string> = {
  INTERESTED: 'Interesado',
  QUOTED: 'Cotizado',
  CLOSED_SALE: 'Venta Cerrada',
  NOT_INTERESTED: 'No Interesado',
  FOLLOW_UP: 'Requiere Seguimiento',
};

const ESTADO_VISITA: Record<string, { label: string; fondo: string; texto: string }> = {
  PLANNED: { label: 'Agendada', fondo: '#e2e8f0', texto: '#4a5568' },
  IN_PROGRESS: { label: 'En proceso', fondo: '#fefcbf', texto: '#744210' },
  COMPLETED: { label: 'Completada', fondo: '#c6f6d5', texto: '#22543d' },
  CANCELLED: { label: 'Cancelada', fondo: '#fed7d7', texto: '#742a2a' },
};

// Columnas elegibles con «Columnas»: «Cliente» va siempre primero y fija.
const COLUMNAS_VISITA = [
  { key: 'vendedor', label: 'Vendedor' },
  { key: 'fecha', label: 'Fecha agendada' },
  { key: 'checkin', label: 'Check-in GPS' },
  { key: 'estado', label: 'Estado' },
  { key: 'oferta', label: 'Oferta comercial' },
  { key: 'resultado', label: 'Resultado' },
];
// «Oferta comercial» solo tiene datos al cerrar la visita (y ya está en la pestaña Resultados): se
// elige con «Columnas» para que Acciones quepa a la vista sin desplazarse.
const COLUMNAS_POR_DEFECTO = COLUMNAS_VISITA.map((c) => c.key).filter((k) => k !== 'oferta');
const ANCHO_COLUMNA_VISITA: Record<string, number> = {
  vendedor: 125, fecha: 105, checkin: 165, estado: 112, oferta: 190, resultado: 125,
};

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// El lugar al que va la visita, en una línea: el del mapa (con ciudad y provincia) o la dirección escrita.
function lugarDeVisita(v: ClientVisit): string {
  if (v.ubicacion) {
    const zona = [v.ubicacion.city, v.ubicacion.province].filter(Boolean).join(', ');
    return [v.ubicacion.name || v.ubicacion.address, zona].filter(Boolean).join(' · ');
  }
  return v.clientAddress ?? '';
}

// «850 m» o «2,3 km».
const distanciaLegible = (m: number) =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;

// Qué pasó con el check-in de una visita. Solo «En el sitio» cuenta como verificado.
function EstadoCheckIn({ v }: { v: ClientVisit }) {
  if (!v.checkInTime) return <span style={{ color: '#a0aec0', fontSize: '0.82rem' }}>Pendiente</span>;
  const hora = new Date(v.checkInTime).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  const nota = (texto: string) => <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 400 }}>{texto}</div>;
  const metros = typeof v.checkInDistanceM === 'number' ? distanciaLegible(v.checkInDistanceM) : null;

  switch (v.checkInResult) {
    case 'EN_SITIO':
      return (
        <div style={{ color: '#276749', fontSize: '0.82rem', fontWeight: 600 }}>
          ✅ En el sitio
          {nota(`${hora}${metros ? ` · a ${metros} del lugar` : ''}`)}
        </div>
      );
    case 'FUERA_DEL_SITIO':
      return (
        <div style={{ color: '#b7791f', fontSize: '0.82rem', fontWeight: 600 }}>
          ⚠ Fuera del sitio
          {nota(`${hora}${metros ? ` · a ${metros} del lugar` : ''}`)}
        </div>
      );
    case 'SIN_GPS':
      return (
        <div style={{ color: '#4a5568', fontSize: '0.82rem', fontWeight: 600 }}>
          Sin verificar
          {nota(`${hora} · sin ubicación del navegador`)}
        </div>
      );
    case 'SIN_UBICACION':
      return (
        <div style={{ color: '#4a5568', fontSize: '0.82rem', fontWeight: 600 }}>
          Sin verificar
          {nota(`${hora} · la visita no tiene lugar definido`)}
        </div>
      );
    default:
      // Check-in de antes del 2026-10-20: entonces no se comparaba con el lugar de la visita.
      return (
        <div style={{ color: '#4a5568', fontSize: '0.82rem', fontWeight: 600 }}>
          Check-in anterior
          {nota(`${hora} · no se comprobó el lugar`)}
        </div>
      );
  }
}

export default function VisitasPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [visits, setVisits] = useState<ClientVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [pestana, setPestana] = useState<'visitas' | 'resultados'>('visitas');
  // Cuadro de «Nueva visita» / «Editar visita» (VisitaModal): null = cerrado.
  const [visitaModal, setVisitaModal] = useState<{ visita: ClientVisit | null } | null>(null);
  const [showOfferModal, setShowOfferModal] = useState<ClientVisit | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkingInId, setCheckingInId] = useState<number | null>(null);
  // Aviso previo al check-in cuando estás lejos del lugar o sin ubicación: null = no hay aviso.
  const [checkInConfirmar, setCheckInConfirmar] = useState<{
    visit: ClientVisit; pos: { lat: number; lng: number } | null; aviso: CheckInPorConfirmar;
  } | null>(null);

  const [checkInInfo, setCheckInInfo] = useState('');
  const checkInInfoRef = useRef<HTMLDivElement>(null);
  const [checkInError, setCheckInError] = useState('');
  const checkInErrorRef = useRef<HTMLDivElement>(null);
  const [offerError, setOfferError] = useState('');
  const offerErrorRef = useRef<HTMLDivElement>(null);
  const [cancelError, setCancelError] = useState('');
  const cancelErrorRef = useRef<HTMLDivElement>(null);
  const [deleteError, setDeleteError] = useState('');
  const deleteErrorRef = useRef<HTMLDivElement>(null);
  const [confirmDeleteVisit, setConfirmDeleteVisit] = useState<ClientVisit | null>(null);
  const [promptCancelVisit, setPromptCancelVisit] = useState<ClientVisit | null>(null);

  useEffect(() => {
    if (checkInInfo) checkInInfoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [checkInInfo]);

  useEffect(() => {
    if (checkInError) checkInErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [checkInError]);

  useEffect(() => {
    if (offerError) offerErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [offerError]);

  useEffect(() => {
    if (cancelError) cancelErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [cancelError]);

  useEffect(() => {
    if (deleteError) deleteErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [deleteError]);

  // Post-Visit Offer Form
  const [offerForm, setOfferForm] = useState({
    commercialOffer: '',
    quotedAmount: 0,
    outcome: 'QUOTED',
    notes: '',
  });

  const loadVisits = () => {
    setLoading(true);
    getVisits()
      .then(setVisits)
      .catch((err: any) => {
        showToast(err?.response?.data?.message || 'No se pudieron cargar las visitas', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadVisits(); }, []);

  // Check-in: el SERVIDOR compara tu ubicación con el lugar de la visita. Si estás a más de 500 m, o el
  // navegador no dio tu ubicación, no registra nada y devuelve el aviso (`requiereConfirmacion`): aquí se
  // muestra con «Cancelar» y «Registrar de todos modos»; si confirmas, queda como no verificado.
  const registrarCheckIn = async (visit: ClientVisit, pos: { lat: number; lng: number } | null, confirmado = false) => {
    setCheckingInId(visit.id);
    setCheckInInfo('');
    setCheckInError('');
    try {
      const r = await checkInVisit(visit.id, { ...(pos ?? {}), confirmado });
      if ('requiereConfirmacion' in r) {
        setCheckInConfirmar({ visit, pos, aviso: r });
        return;
      }
      loadVisits();
    } catch (err: any) {
      setCheckInError(err.response?.data?.message || 'No se pudo registrar el check-in. Intenta de nuevo.');
    } finally {
      setCheckingInId(null);
    }
  };

  const handleCheckIn = (visit: ClientVisit) => {
    setCheckInInfo('');
    setCheckInError('');
    if (!navigator.geolocation) {
      void registrarCheckIn(visit, null);
      return;
    }
    setCheckingInId(visit.id);
    navigator.geolocation.getCurrentPosition(
      (pos) => void registrarCheckIn(visit, { lat: pos.coords.latitude, lng: pos.coords.longitude }),
      // Permiso negado, sin señal o tiempo agotado: el servidor lo trata como «sin ubicación» y pregunta.
      () => void registrarCheckIn(visit, null),
      { timeout: 10000, enableHighAccuracy: true },
    );
  };

  const handleCompleteVisitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showOfferModal) return;
    setSaving(true);
    setOfferError('');
    try {
      await completeVisit(showOfferModal.id, offerForm);
      setShowOfferModal(null);
      loadVisits();
    } catch (err: any) {
      setOfferError(err.response?.data?.message || 'Error al registrar oferta comercial');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelVisit = (visit: ClientVisit) => {
    setCancelError('');
    setPromptCancelVisit(visit);
  };

  const confirmarCancelarVisita = async (reason: string) => {
    const visit = promptCancelVisit;
    if (!visit) return;
    setPromptCancelVisit(null);
    try {
      await cancelVisit(visit.id, reason);
      loadVisits();
    } catch {
      setCancelError('Error al cancelar visita');
    }
  };

  const handleDeleteVisit = (visit: ClientVisit) => {
    setDeleteError('');
    setConfirmDeleteVisit(visit);
  };

  const confirmarEliminarVisita = async () => {
    if (!confirmDeleteVisit) return;
    const visit = confirmDeleteVisit;
    setConfirmDeleteVisit(null);
    try {
      await deleteVisit(visit.id);
      loadVisits();
    } catch {
      setDeleteError('Error al eliminar visita');
    }
  };

  // ---- Lista: filtros, orden, columnas y acciones de cada visita ----
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  // Fecha o rango de fechas de la visita (AAAA-MM-DD). Con solo «Desde» se filtra ese día en adelante; con solo «Hasta», hasta ese día.
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const columnPrefs = useColumnPreferences('ventas-visitas', COLUMNAS_POR_DEFECTO);
  const columnasVisibles = columnPrefs.visible.filter((k) => COLUMNAS_VISITA.some((c) => c.key === k));
  const tablaRef = useResizableColumns('ventas-visitas', ['cliente', ...columnasVisibles, 'acciones']);
  const hayFiltros = !!busqueda || !!estadoFiltro || !!desde || !!hasta;

  const filtradas = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    return visits.filter((v) => {
      if (estadoFiltro && v.status !== estadoFiltro) return false;
      const dia = (v.visitDate ?? '').slice(0, 10);
      if (desde && dia < desde) return false;
      if (hasta && dia > hasta) return false;
      if (!q) return true;
      const texto = [v.cliente?.name ?? v.clientName, lugarDeVisita(v), v.user?.fullName, v.oportunidad?.title].filter(Boolean).join(' ');
      return sinTildes(texto).includes(q);
    });
  }, [visits, busqueda, estadoFiltro, desde, hasta]);

  const { filas, thProps, SortIcon } = useSortableTable(filtradas, {
    cliente: (v) => v.cliente?.name ?? v.clientName,
    vendedor: (v) => v.user?.fullName,
    fecha: (v) => v.visitDate,
    checkin: (v) => v.checkInTime,
    estado: (v) => ESTADO_VISITA[v.status]?.label,
    oferta: (v) => v.quotedAmount,
    resultado: (v) => (v.outcome ? OUTCOME_LABELS[v.outcome] ?? v.outcome : ''),
  });

  const abrirOferta = (v: ClientVisit) => {
    setShowOfferModal(v);
    setOfferForm({
      commercialOffer: v.commercialOffer || '',
      quotedAmount: v.quotedAmount || 0,
      outcome: v.outcome || 'QUOTED',
      notes: v.notes || '',
    });
  };

  // La acción visible de cada fila es el SIGUIENTE PASO de la visita; el resto va en el menú «⋯».
  const accionPrincipal = (v: ClientVisit) => {
    if (v.status === 'PLANNED') {
      const ocupado = checkingInId === v.id;
      return { texto: ocupado ? 'Verificando...' : 'Check-in', icono: <MapPin size={14} />, ocupado, onClick: () => handleCheckIn(v) };
    }
    if (v.status === 'IN_PROGRESS') {
      return { texto: 'Oferta y cierre', icono: <FileText size={14} />, ocupado: false, onClick: () => abrirOferta(v) };
    }
    return null;
  };

  const accionesDeVisita = (v: ClientVisit): RowAction[] => {
    const lista: RowAction[] = [];
    const abierta = v.status === 'PLANNED' || v.status === 'IN_PROGRESS';
    if (v.status === 'PLANNED') {
      lista.push({ label: 'Registrar oferta y cierre', icon: <FileText size={14} />, onClick: () => abrirOferta(v) });
    }
    if (abierta) {
      lista.push({ label: 'Editar la visita', icon: <Pencil size={14} />, onClick: () => setVisitaModal({ visita: v }) });
      lista.push({ label: 'Cancelar la visita', icon: <XCircle size={14} />, danger: true, onClick: () => handleCancelVisit(v) });
    }
    lista.push({ label: 'Eliminar el registro', icon: <Trash2 size={14} />, danger: true, onClick: () => handleDeleteVisit(v) });
    return lista;
  };

  const celdaVisita = (k: string, v: ClientVisit) => {
    switch (k) {
      case 'vendedor':
        return v.user?.fullName || '—';
      case 'fecha':
        return v.visitDate ? new Date(v.visitDate).toLocaleDateString('es-EC', { timeZone: 'UTC' }) : '—';
      case 'checkin':
        return <EstadoCheckIn v={v} />;
      case 'estado': {
        const e = ESTADO_VISITA[v.status] ?? ESTADO_VISITA.PLANNED;
        return <span className="status-badge" style={{ background: e.fondo, color: e.texto }}>{e.label}</span>;
      }
      case 'oferta':
        return v.commercialOffer ? (
          <div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{v.commercialOffer}</div>
            {v.quotedAmount ? <div style={{ fontSize: 12, color: '#2b6cb0', fontWeight: 700 }}>${v.quotedAmount.toFixed(2)}</div> : null}
          </div>
        ) : <span style={{ color: '#a0aec0' }}>—</span>;
      case 'resultado':
        return v.outcome
          ? <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--azul-oscuro)' }}>{OUTCOME_LABELS[v.outcome] || v.outcome}</span>
          : <span style={{ color: '#a0aec0' }}>—</span>;
      default:
        return null;
    }
  };

  return (
    <div className="page-container">
      <VentasPageHeader
        title="Visitas"
        description="Planifica las visitas de campo, registra tu llegada con el check-in y cierra cada una con su oferta y resultado."
        actions={
          <button className="auth-btn" onClick={() => setVisitaModal({ visita: null })}>
            <Plus size={16} /> Nueva visita
          </button>
        }
      />

      <PageTabs
        label="Vista de visitas" value={pestana} onChange={setPestana}
        tabs={[{ key: 'visitas', label: 'Visitas' }, { key: 'resultados', label: 'Resultados' }]}
      />

      {pestana === 'resultados' ? (
        <ResultadosVisitas />
      ) : (
        <>
      {checkInInfo && (
        <div ref={checkInInfoRef} style={{ background: '#ebf8ff', border: '1px solid #90cdf4', color: '#2b6cb0', borderRadius: '10px', padding: '10px 14px', marginTop: '16px', fontSize: '0.85rem' }}>{checkInInfo}</div>
      )}
      {checkInError && <div ref={checkInErrorRef} className="form-error" style={{ marginTop: '16px' }}>{checkInError}</div>}
      {cancelError && <div ref={cancelErrorRef} className="form-error" style={{ marginTop: '16px' }}>{cancelError}</div>}
      {deleteError && <div ref={deleteErrorRef} className="form-error" style={{ marginTop: '16px' }}>{deleteError}</div>}

      <div className="filter-bar" style={{ marginTop: 16 }}>
        <div className="filter-bar-fields filter-bar-fields--etiquetas">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, lugar, vendedor u oportunidad..."
            style={{ flex: '1 1 200px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
          <FilterField label="Estado">
            <select className="filter-select" value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(ESTADO_VISITA).map(([k, e]) => <option key={k} value={k}>{e.label}</option>)}
            </select>
          </FilterField>
          <FilterField label="Desde">
            <DateInput value={desde} onChange={(v) => { setDesde(v); if (hasta && v && v > hasta) setHasta(v); }} max={hasta || undefined} />
          </FilterField>
          <FilterField label="Hasta">
            <DateInput value={hasta} onChange={(v) => { setHasta(v); if (desde && v && v < desde) setDesde(v); }} min={desde || undefined} />
          </FilterField>
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={COLUMNAS_VISITA}
            visible={columnPrefs.visible}
            pinned={columnPrefs.pinned}
            maxPinned={columnPrefs.maxPinned}
            fixedLabel="Cliente"
            onApply={async (keys, fijas) => {
              const guardado = await columnPrefs.set(keys, fijas);
              if (!guardado) showToast('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.', 'error');
            }}
          />
          <ClearFiltersButton
            onClear={() => { setBusqueda(''); setEstadoFiltro(''); setDesde(''); setHasta(''); }}
            disabled={!hayFiltros}
          />
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <p style={{ color: '#888', fontSize: 13 }}>Cargando visitas...</p>
        ) : visits.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 36, marginBottom: 8 }}>📍</div>
            <div>No hay visitas agendadas. Planifica las visitas de tu semana desde «Nueva visita».</div>
          </div>
        ) : filas.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>No hay visitas que coincidan con los filtros.</p>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
              <thead>
                <tr>
                  <th {...thProps('cliente')} style={{ width: 220 }}>Cliente <SortIcon campo="cliente" /></th>
                  {columnasVisibles.map((k) => {
                    const col = COLUMNAS_VISITA.find((c) => c.key === k)!;
                    return (
                      <th key={k} {...thProps(k)} style={{ width: ANCHO_COLUMNA_VISITA[k] }}>
                        {col.label} <SortIcon campo={k} />
                      </th>
                    );
                  })}
                  <th className="col-acciones col-acciones--ancha" style={{ width: 190 }}><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((v) => {
                  const principal = accionPrincipal(v);
                  return (
                    <tr key={v.id}>
                      <td>
                        {v.cliente ? (
                          <a href={`/ventas/clientes?ficha=${v.cliente.id}`} className="enlace-tabla"
                            onClick={(e) => { e.preventDefault(); navigate(`/ventas/clientes?ficha=${v.cliente!.id}`); }}>
                            {v.cliente.name}
                          </a>
                        ) : (
                          <div style={{ fontWeight: 600 }}>{v.clientName}</div>
                        )}
                        {lugarDeVisita(v) && (
                          <div className="visita-sub"><MapPin size={12} aria-hidden /> {lugarDeVisita(v)}</div>
                        )}
                        {v.clientPhone && <div className="visita-sub"><Phone size={12} aria-hidden /> {v.clientPhone}</div>}
                        {v.oportunidad && (
                          <div className="visita-sub visita-sub--opp"><Briefcase size={12} aria-hidden /> {v.oportunidad.title || `Oportunidad ${v.oportunidad.id}`}</div>
                        )}
                      </td>
                      {columnasVisibles.map((k) => <td key={k}>{celdaVisita(k, v)}</td>)}
                      <td className="col-acciones col-acciones--ancha">
                        <div className="acciones-iconos" style={{ justifyContent: 'flex-end' }}>
                          {principal && (
                            <button
                              type="button" className="btn-secondary" disabled={principal.ocupado}
                              onClick={principal.onClick}
                              style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              {principal.icono} {principal.texto}
                            </button>
                          )}
                          <RowActionsMenu actions={accionesDeVisita(v)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}

      {/* NUEVA / EDITAR VISITA: cliente del Directorio, oportunidad y ubicación en el mapa */}
      {visitaModal && (
        <VisitaModal
          visita={visitaModal.visita}
          onClose={() => setVisitaModal(null)}
          onSaved={() => { setVisitaModal(null); loadVisits(); }}
        />
      )}

      {/* POST-VISIT OFFER MODAL */}
      {showOfferModal && (
        <div className="modal-overlay" onClick={() => setShowOfferModal(null)}>
          <div className="modal" style={{ maxWidth: 550 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Registro de oferta comercial y cierre</h3>
              <button className="modal-close" onClick={() => setShowOfferModal(null)} aria-label="Cerrar">✕</button>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#718096', margin: '0 0 0', padding: '0 20px' }}>
              Cliente: <strong>{showOfferModal.cliente?.name ?? showOfferModal.clientName}</strong>
            </p>

            {offerError && <div ref={offerErrorRef} className="form-error">{offerError}</div>}

            <form onSubmit={handleCompleteVisitSubmit} className="modal-body">
              <div className="form-group">
                <label>Productos / Servicios Ofrecidos (Detalle de Oferta) *</label>
                <textarea
                  value={offerForm.commercialOffer}
                  onChange={(e) => setOfferForm({ ...offerForm, commercialOffer: e.target.value })}
                  rows={3}
                  placeholder="Ej: Ofrecido lote de 50 sacos de cacao fino de aroma, servicio de custodia y transporte hasta puerto..."
                  required
                />
              </div>

              <div className="form-row" style={{ marginTop: '8px' }}>
                <div className="form-group">
                  <label>Monto Cotizado ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={offerForm.quotedAmount}
                    onChange={(e) => setOfferForm({ ...offerForm, quotedAmount: Number(e.target.value) })}
                  />
                </div>
                <div className="form-group">
                  <label>Resultado de la Visita *</label>
                  <select
                    value={offerForm.outcome}
                    onChange={(e) => setOfferForm({ ...offerForm, outcome: e.target.value })}
                  >
                    <option value="INTERESTED">Interesado</option>
                    <option value="QUOTED">Cotizado</option>
                    <option value="CLOSED_SALE">Venta Cerrada (Ganado)</option>
                    <option value="FOLLOW_UP">Requiere Seguimiento</option>
                    <option value="NOT_INTERESTED">No Interesado</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '8px' }}>
                <label>Notas de Conclusión de Visita</label>
                <textarea
                  value={offerForm.notes}
                  onChange={(e) => setOfferForm({ ...offerForm, notes: e.target.value })}
                  rows={2}
                  placeholder="Observaciones finales..."
                />
              </div>

              <div className="modal-actions" style={{ marginTop: '16px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowOfferModal(null)}>Cancelar</button>
                <button type="submit" className="auth-btn" disabled={saving}>
                  {saving ? 'Guardando...' : 'Completar Visita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {checkInConfirmar && (
        <ConfirmDialog
          title={checkInConfirmar.aviso.resultado === 'SIN_GPS' ? 'No pudimos leer tu ubicación' : 'Estás lejos del lugar de la visita'}
          message={
            checkInConfirmar.aviso.resultado === 'SIN_GPS' ? (
              <>
                <p style={{ margin: '0 0 8px' }}>
                  El navegador no nos dio tu ubicación. Revisa que hayas permitido la ubicación para esta página.
                </p>
                <p style={{ margin: 0 }}>
                  Si registras el check-in ahora, quedará como <strong>Sin verificar</strong>.
                </p>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 8px' }}>
                  Estás a <strong>{distanciaLegible(checkInConfirmar.aviso.distanciaM ?? 0)}</strong> del lugar de la visita
                  {checkInConfirmar.aviso.lugar ? <> ({checkInConfirmar.aviso.lugar})</> : null}. Para quedar «En el sitio» hay que estar
                  a menos de {checkInConfirmar.aviso.maximoM} m.
                </p>
                <p style={{ margin: 0 }}>
                  Si registras el check-in ahora, quedará como <strong>Fuera del sitio</strong> y no contará como verificado.
                </p>
              </>
            )
          }
          confirmLabel="Registrar de todos modos"
          cancelLabel="Cancelar"
          danger
          onConfirm={() => {
            const c = checkInConfirmar;
            setCheckInConfirmar(null);
            void registrarCheckIn(c.visit, c.pos, true);
          }}
          onCancel={() => setCheckInConfirmar(null)}
        />
      )}

      {confirmDeleteVisit && (
        <ConfirmDialog
          title="Eliminar visita"
          message={`¿Eliminar la visita a ${confirmDeleteVisit.clientName}?`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminarVisita}
          onCancel={() => setConfirmDeleteVisit(null)}
        />
      )}

      {promptCancelVisit && (
        <PromptDialog
          title="Cancelar visita"
          message={`Motivo de cancelación de la visita a ${promptCancelVisit.clientName}:`}
          confirmLabel="Cancelar visita"
          onConfirm={confirmarCancelarVisita}
          onCancel={() => setPromptCancelVisit(null)}
        />
      )}
    </div>
  );
}
