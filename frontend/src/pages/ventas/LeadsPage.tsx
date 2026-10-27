import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, UserPlus, UserMinus, XCircle, ClipboardList, ArrowRightCircle } from 'lucide-react';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import FilterField from '../../components/common/FilterField';
import FiltroFecha from '../../components/common/FiltroFecha';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import ExportTableButton from '../../components/common/ExportTableButton';
import ErrorBanner from '../../components/common/ErrorBanner';
import RowActionsMenu, { type RowAction } from '../../components/common/RowActionsMenu';
import MotivoCierreModal from '../../components/ventas/MotivoCierreModal';
import ConvertirLeadModal from '../../components/ventas/ConvertirLeadModal';
import VentasPageHeader from '../../components/ventas/VentasPageHeader';
import ChipAlcance from '../../components/ventas/ChipAlcance';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useToast } from '../../contexts/ToastContext';
import { getUser } from '../../services/auth.service';
import {
  getLeadsEntrantes,
  createLeadEntrante,
  getReferidoresLead,
  updateLeadEntrante,
  tomarLeadEntrante,
  soltarLeadEntrante,
  descartarLeadEntrante,
  getServicios,
  MOTIVO_CONTACTO_LABEL,
  type CanalLeadDef,
  type LeadEntrante,
  type MotivoContacto,
  type SalesServicio,
} from '../../services/ventas.service';
import { useCanalesLead } from '../../hooks/useCanalesLead';
import FlujoComercialPasos from '../../components/ventas/FlujoComercialPasos';
import { FILTRO_FECHA_VACIO, diaCortoEcuador, fechaEnRango, filtroFechaDeUrl, hayFiltroFecha, type FiltroFechaValor } from '../../utils/rangoFechas';

// Columnas elegibles (además de Contacto y Acciones, que son fijas). Las
// últimas son datos propios de cada fuente (campaña, gclid, landing, quién
// refirió): al filtrar por una fuente se muestran solas las que ella usa.
const COLUMNAS_LEAD = [
  { key: 'mensaje', label: 'Mensaje' },
  { key: 'canal', label: 'Fuente' },
  { key: 'motivo', label: 'Tipo de contacto' },
  { key: 'estado', label: 'Estado' },
  { key: 'responsable', label: 'Responsable' },
  { key: 'llego', label: 'Llegó' },
  { key: 'campana', label: 'Campaña' },
  { key: 'servicio', label: 'Servicio pedido' },
  { key: 'landing', label: 'Landing' },
  { key: 'gclid', label: 'gclid (Google)' },
  { key: 'referidoPor', label: 'Referido por' },
  { key: 'consentimiento', label: 'Consentimiento de datos' },
];
const COLUMNAS_LEAD_POR_DEFECTO = ['mensaje', 'canal', 'motivo', 'estado', 'responsable', 'llego'];
// Lo que se puede exportar: las columnas de la tabla, el contacto desglosado y la fecha completa.
const COLUMNAS_EXPORTAR_LEAD = [
  { key: 'contacto', label: 'Nombre' },
  { key: 'empresa', label: 'Empresa' },
  { key: 'correo', label: 'Correo' },
  { key: 'telefono', label: 'Teléfono' },
  ...COLUMNAS_LEAD,
];
const ANCHO_COLUMNA_LEAD: Record<string, number> = {
  mensaje: 220, canal: 130, motivo: 170, estado: 150, responsable: 140, llego: 110, campana: 150, servicio: 150,
  landing: 150, gclid: 170, referidoPor: 150, consentimiento: 150,
};
// Qué columna corresponde a cada dato propio de una fuente.
const COLUMNA_DE_CAMPO: Record<string, string> = {
  campaign: 'campana', gclid: 'gclid', landing: 'landing', referidoPor: 'referidoPor',
};

const extraTexto = (l: LeadEntrante, clave: string): string => {
  const v = (l.extra as Record<string, unknown> | null | undefined)?.[clave];
  return typeof v === 'string' ? v : '';
};

const ESTADO_LABEL: Record<LeadEntrante['status'], string> = {
  NUEVO: 'Sin procesar',
  EN_SEGUIMIENTO: 'Contactado',
  // «Convertido» queda para Google Ads (cuando la oportunidad se acepta); aquí
  // solo significa que el lead ya pasó a una oportunidad.
  CONVERTIDO: 'Pasó a oportunidad',
  DESCARTADO: 'Descartado',
};
// Días desde que llegó sin que nadie lo atienda (solo marca, no descarta nada).
const DIAS_SIN_ATENDER = 2;
const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

const ESTADO_COLOR: Record<LeadEntrante['status'], string> = {
  NUEVO: '#2b6cb0',
  EN_SEGUIMIENTO: '#d97706',
  CONVERTIDO: '#2f855a',
  DESCARTADO: '#a0aec0',
};

// Bandeja de Leads: contactos entrantes sin calificar (formulario web, Google
// Ads, correo, ingreso manual). A la web también escriben postulantes,
// proveedores y spam: cada contacto se clasifica, y solo uno de servicio se
// pasa a oportunidad (la persona queda como prospecto hasta que acepte). Un
// cliente nunca vuelve a ser lead.
export default function LeadsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const usuario = getUser();
  const { canales, etiquetaCanal } = useCanalesLead();
  const [leads, setLeads] = useState<LeadEntrante[]>([]);
  const [servicios, setServicios] = useState<SalesServicio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('pendientes');
  const [motivo, setMotivo] = useState('');
  const [canal, setCanal] = useState('');
  // Llegan del Dashboard («Motivos de pérdida»): ?estado=DESCARTADO&motivoDescarte=…&responsable=mine|<id>.
  const [motivoDescarte, setMotivoDescarte] = useState('');
  const [soloResp, setSoloResp] = useState('');
  const [filtroFecha, setFiltroFecha] = useState<FiltroFechaValor>(FILTRO_FECHA_VACIO);
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const e = searchParams.get('estado');
    const m = searchParams.get('motivoDescarte');
    const r = searchParams.get('responsable');
    if (e) setEstado(e);
    if (m) setMotivoDescarte(m);
    if (r && r !== 'all') setSoloResp(r);
    // ?desde=&hasta=: el periodo que se miraba en el Dashboard; queda a la vista en el filtro «Llegó».
    const fecha = filtroFechaDeUrl(searchParams.get('desde'), searchParams.get('hasta'));
    if (fecha) setFiltroFecha(fecha);
    // ?nuevo=1: «Nueva oportunidad» manda aquí a quien apenas escribió y todavía no es oportunidad.
    if (searchParams.get('nuevo') === '1') setNuevo(true);
    if (e || m || r || fecha || searchParams.get('nuevo')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  const [nuevo, setNuevo] = useState(false);
  const [convirtiendo, setConvirtiendo] = useState<LeadEntrante | null>(null);
  const [descartando, setDescartando] = useState<LeadEntrante | null>(null);
  // Columnas que cada persona elige ver (preferencia en su cuenta).
  const columnPrefs = useColumnPreferences('ventas-leads', COLUMNAS_LEAD_POR_DEFECTO);
  // Al filtrar por una fuente se suman las columnas con los datos propios de
  // esa fuente (p. ej. gclid en Google Ads), aunque no las haya elegido.
  const columnasVisiblesLead = useMemo(() => {
    const elegidas = columnPrefs.visible.filter((k) => COLUMNAS_LEAD.some((c) => c.key === k));
    const propias = (canales.find((c) => c.key === canal)?.campos ?? [])
      .map((c) => COLUMNA_DE_CAMPO[c.key])
      .filter((k): k is string => !!k && !elegidas.includes(k));
    return [...elegidas, ...propias];
  }, [columnPrefs.visible, canales, canal]);
  const tablaRef = useResizableColumns('ventas-leads', ['contacto', ...columnasVisiblesLead, 'acciones']);

  const cargar = async () => {
    try {
      const [ls, ss] = await Promise.all([getLeadsEntrantes(), getServicios()]);
      setLeads(ls);
      setServicios(ss);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudieron cargar los posibles clientes', 'error');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  // Todo menos la fuente: de aquí salen los totales por fuente del resumen.
  const sinFiltroDeFuente = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return leads.filter((l) => {
      if (estado === 'pendientes' && (l.status === 'CONVERTIDO' || l.status === 'DESCARTADO')) return false;
      if (estado && estado !== 'pendientes' && l.status !== estado) return false;
      if (motivo === 'SIN_CLASIFICAR' ? !!l.contactReason : motivo && l.contactReason !== motivo) return false;
      if (motivoDescarte && l.motivoDescarte !== motivoDescarte) return false;
      if (soloResp && String(l.assignedUserId ?? '') !== (soloResp === 'mine' ? String(usuario?.id ?? '') : soloResp)) return false;
      if (!fechaEnRango(l.createdAt, filtroFecha)) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.phone || '').includes(q) ||
        (l.companyName || '').toLowerCase().includes(q) ||
        (l.message || '').toLowerCase().includes(q)
      );
    });
  }, [leads, busqueda, estado, motivo, motivoDescarte, soloResp, filtroFecha, usuario?.id]);
  const filtrados = useMemo(
    () => (canal ? sinFiltroDeFuente.filter((l) => l.channel === canal) : sinFiltroDeFuente),
    [sinFiltroDeFuente, canal],
  );
  const totalesPorFuente = useMemo(() => {
    const t = new Map<string, number>();
    for (const l of sinFiltroDeFuente) t.set(l.channel, (t.get(l.channel) ?? 0) + 1);
    return t;
  }, [sinFiltroDeFuente]);

  const { filas, thProps, SortIcon } = useSortableTable(
    filtrados,
    {
      contacto: (l) => l.name,
      canal: (l) => etiquetaCanal(l.channel),
      motivo: (l) => (l.contactReason ? MOTIVO_CONTACTO_LABEL[l.contactReason] : ''),
      estado: (l) => ESTADO_LABEL[l.status],
      responsable: (l) => l.assignedUserName,
      llego: (l) => l.createdAt,
      mensaje: (l) => l.message,
      campana: (l) => l.campaign,
      servicio: (l) => extraTexto(l, 'servicio'),
      landing: (l) => extraTexto(l, 'landing'),
      gclid: (l) => extraTexto(l, 'gclid'),
      referidoPor: (l) => extraTexto(l, 'referidoPor'),
      consentimiento: (l) => extraTexto(l, 'consentimiento'),
    },
    'llego',
    'desc',
  );

  const celdaLead = (key: string, l: LeadEntrante): ReactNode => {
    switch (key) {
      case 'mensaje':
        return (
          <div style={{ fontSize: 12, color: '#4a5568', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }} title={l.message || ''}>
            {l.message || <span style={{ color: '#a0aec0' }}>Sin mensaje</span>}
          </div>
        );
      case 'canal':
        return (
          <>
            {etiquetaCanal(l.channel)}
            {l.campaign && <div style={{ fontSize: 11, color: '#888' }}>{l.campaign}</div>}
            {origenLanding(l) && <div style={{ fontSize: 11, color: '#a0aec0' }}>{origenLanding(l)}</div>}
          </>
        );
      case 'motivo':
        return abiertos(l) ? (
          <>
            <select
              value={l.contactReason ?? ''}
              aria-label={`Tipo de contacto de ${l.name}`}
              onChange={(e) => clasificar(l, e.target.value)}
              style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12 }}
            >
              <option value="">Sin clasificar</option>
              {(Object.keys(MOTIVO_CONTACTO_LABEL) as MotivoContacto[]).map((k) => <option key={k} value={k}>{MOTIVO_CONTACTO_LABEL[k]}</option>)}
            </select>
            {!l.contactReason && l.sugerenciaMotivo && (
              <div style={{ fontSize: 11, marginTop: 3 }}>
                Parece de <strong>{MOTIVO_CONTACTO_LABEL[l.sugerenciaMotivo]}</strong>{' '}
                <button type="button" onClick={() => clasificar(l, l.sugerenciaMotivo!)}
                  style={{ background: 'none', border: 'none', color: '#2b6cb0', cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}>
                  aceptar
                </button>
              </div>
            )}
          </>
        ) : (
          l.contactReason ? MOTIVO_CONTACTO_LABEL[l.contactReason] : '—'
        );
      case 'estado':
        return (
          <>
            <span className="status-badge" style={{ backgroundColor: ESTADO_COLOR[l.status] + '22', color: ESTADO_COLOR[l.status], whiteSpace: 'nowrap' }}>
              {ESTADO_LABEL[l.status]}
            </span>
            {abiertos(l) && diasDesde(l.createdAt) >= DIAS_SIN_ATENDER && (
              <div>
                <span className="status-badge" style={{ backgroundColor: '#fef3c7', color: '#92400e', whiteSpace: 'nowrap', marginTop: 4, display: 'inline-block', fontSize: 11 }}
                  title="Solo es un aviso: el posible cliente sigue en la bandeja hasta que lo atiendas.">
                  Sin atender hace {diasDesde(l.createdAt)} días
                </span>
              </div>
            )}
          </>
        );
      case 'responsable':
        return l.assignedUserName || <span style={{ color: '#a0aec0' }}>Sin asignar</span>;
      case 'llego':
        return diaCortoEcuador(l.createdAt);
      case 'campana':
        return l.campaign || '—';
      case 'servicio':
        return extraTexto(l, 'servicio') || '—';
      case 'landing':
        return extraTexto(l, 'landing') || '—';
      case 'gclid':
        return extraTexto(l, 'gclid')
          ? <span title={extraTexto(l, 'gclid')} className="truncate" style={{ display: 'block', fontSize: 11 }}>{extraTexto(l, 'gclid')}</span>
          : '—';
      case 'referidoPor':
        return extraTexto(l, 'referidoPor') || '—';
      case 'consentimiento': {
        const c = extraTexto(l, 'consentimiento');
        if (!c) return '—';
        return c === 'SI' ? (extraTexto(l, 'politica') ? `Sí (${extraTexto(l, 'politica')})` : 'Sí') : 'No consta';
      }
      default:
        return null;
    }
  };

  // Valor en texto plano de cada columna, para exportar (la tabla dibuja JSX).
  const valorExportarLead = (l: LeadEntrante, key: string): string => {
    switch (key) {
      case 'contacto': return l.name;
      case 'empresa': return l.companyName || '';
      case 'correo': return l.email || '';
      case 'telefono': return l.phone || '';
      case 'mensaje': return l.message || '';
      case 'canal': return etiquetaCanal(l.channel);
      case 'motivo': return l.contactReason ? MOTIVO_CONTACTO_LABEL[l.contactReason] : '';
      case 'estado': return ESTADO_LABEL[l.status];
      case 'responsable': return l.assignedUserName || 'Sin asignar';
      case 'llego': return diaCorto(l.createdAt);
      case 'campana': return l.campaign || '';
      case 'servicio': case 'landing': case 'gclid': case 'referidoPor': return extraTexto(l, key);
      case 'consentimiento': {
        const c = extraTexto(l, 'consentimiento');
        if (!c) return '';
        return c === 'SI' ? (extraTexto(l, 'politica') ? `Sí (${extraTexto(l, 'politica')})` : 'Sí') : 'No consta';
      }
      default: return '';
    }
  };

  const correr = async (fn: () => Promise<unknown>, ok: string, falla: string) => {
    try {
      await fn();
      if (ok) showToast(ok, 'success');
      cargar();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      showToast((Array.isArray(msg) ? msg[0] : msg) || falla, 'error');
    }
  };

  const clasificar = (l: LeadEntrante, valor: string) =>
    correr(
      () => updateLeadEntrante(l.id, { contactReason: (valor || null) as MotivoContacto | null }),
      '',
      'No se pudo clasificar el contacto',
    );

  const abiertos = (l: LeadEntrante) => l.status === 'NUEVO' || l.status === 'EN_SEGUIMIENTO';

  const acciones = (l: LeadEntrante): RowAction[] => {
    const lista: RowAction[] = [];
    if (l.status === 'CONVERTIDO' && (l.convertedOpportunityId || l.convertedClientId)) {
      lista.push({ label: 'Ver la oportunidad', icon: <ClipboardList size={14} />, onClick: () => navigate('/ventas/oportunidades') });
    }
    if (abiertos(l)) {
      if (!l.assignedUserId) {
        lista.push({ label: 'Tomar este posible cliente', icon: <UserPlus size={14} />, onClick: () => correr(() => tomarLeadEntrante(l.id), 'Posible cliente tomado', 'No se pudo tomar el posible cliente') });
      } else if (l.assignedUserId === usuario?.id) {
        lista.push({ label: 'Soltar este posible cliente', icon: <UserMinus size={14} />, onClick: () => correr(() => soltarLeadEntrante(l.id), 'Posible cliente liberado', 'No se pudo soltar el posible cliente') });
      }
      lista.push({ label: 'Descartar', icon: <XCircle size={14} />, danger: true, onClick: () => setDescartando(l) });
    }
    return lista;
  };

  const hayFiltros = !!busqueda || estado !== 'pendientes' || !!motivo || !!canal || !!motivoDescarte || !!soloResp || hayFiltroFecha(filtroFecha);
  const motivosDeDescarte = useMemo(
    () => [...new Set(leads.map((l) => l.motivoDescarte).filter((m): m is string => !!m))].sort((a, b) => a.localeCompare(b, 'es')),
    [leads],
  );
  const sinClasificar = leads.filter((l) => abiertos(l) && !l.contactReason).length;

  return (
    <div className="page-container">
      <VentasPageHeader
        title="Posibles clientes"
        description={<>Contactos que llegan por la web, los anuncios o a mano (en Google Ads: leads). Solo los de servicio pasan a oportunidad. {sinClasificar > 0 && <strong>{sinClasificar} sin clasificar.</strong>}</>}
        actions={
          <button className="auth-btn" onClick={() => setNuevo(true)}>
            <Plus size={16} /> Nuevo posible cliente
          </button>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-fields filter-bar-fields--etiquetas">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, correo, teléfono o mensaje..."
            style={{ flex: '1 1 200px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
          <FilterField label="Estado">
            <select className="filter-select" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="pendientes">Pendientes</option>
              <option value="">Todos</option>
              <option value="NUEVO">Sin procesar</option>
              <option value="EN_SEGUIMIENTO">Contactados</option>
              <option value="CONVERTIDO">Pasaron a oportunidad</option>
              <option value="DESCARTADO">Descartados</option>
            </select>
          </FilterField>
          <FilterField label="Tipo de contacto">
            <select className="filter-select" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              <option value="">Todos</option>
              <option value="SIN_CLASIFICAR">Sin clasificar</option>
              {(Object.keys(MOTIVO_CONTACTO_LABEL) as MotivoContacto[]).map((k) => <option key={k} value={k}>{MOTIVO_CONTACTO_LABEL[k]}</option>)}
            </select>
          </FilterField>
          {estado === 'DESCARTADO' && (
            <FilterField label="Motivo del descarte">
              <select className="filter-select" value={motivoDescarte} onChange={(e) => setMotivoDescarte(e.target.value)}>
                <option value="">Todos</option>
                {motivosDeDescarte.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </FilterField>
          )}
          <FilterField label="Fuente">
            <select className="filter-select" value={canal} onChange={(e) => setCanal(e.target.value)}>
              <option value="">Todas ({sinFiltroDeFuente.length})</option>
              {canales.map((c) => <option key={c.key} value={c.key}>{c.label} ({totalesPorFuente.get(c.key) ?? 0})</option>)}
            </select>
          </FilterField>
          <FiltroFecha label="Llegó" valor={filtroFecha} onChange={setFiltroFecha} title="Filtra por el día en que llegó el posible cliente (la columna «Llegó»)" />
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={COLUMNAS_LEAD}
            visible={columnPrefs.visible}
            pinned={columnPrefs.pinned}
            maxPinned={columnPrefs.maxPinned}
            fixedLabel="Contacto"
            onApply={async (keys, fijas) => {
              const guardado = await columnPrefs.set(keys, fijas);
              if (!guardado) showToast('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.', 'error');
            }}
          />
          <ClearFiltersButton
            onClear={() => { setBusqueda(''); setEstado('pendientes'); setMotivo(''); setCanal(''); setMotivoDescarte(''); setSoloResp(''); setFiltroFecha(FILTRO_FECHA_VACIO); }}
            disabled={!hayFiltros}
          />
          <ExportTableButton
            titulo="Posibles clientes"
            columns={COLUMNAS_EXPORTAR_LEAD}
            defaultKeys={['contacto', ...columnasVisiblesLead]}
            rows={filas}
            getValue={valorExportarLead}
            historial={(l) => ({ leadId: l.id, oportunidadId: l.convertedOpportunityId, clienteId: l.convertedClientId })}
          />
        </div>
      </div>

      <ChipAlcance alcance={soloResp || null} que="posibles clientes" total={filtrados.length} onQuitar={() => setSoloResp('')} />

      <div className="admin-section">
        {cargando ? (
          <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
        ) : leads.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 36, marginBottom: 8 }}>📥</div>
            <div>Aún no hay posibles clientes. Llegan solos desde la web y las landings (ver Configuración → Cómo llegan los posibles clientes) o se ingresan a mano.</div>
          </div>
        ) : filas.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>No hay posibles clientes que coincidan con los filtros.</p>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
              <thead>
                <tr>
                  <th {...thProps('contacto')} style={{ width: 240 }}>Contacto <SortIcon campo="contacto" /></th>
                  {columnasVisiblesLead.map((k) => {
                    const col = COLUMNAS_LEAD.find((c) => c.key === k)!;
                    return (
                      <th key={k} {...thProps(k)} style={{ width: ANCHO_COLUMNA_LEAD[k] }}>
                        {col.label} <SortIcon campo={k} />
                      </th>
                    );
                  })}
                  <th className="col-acciones col-acciones--ancha" style={{ width: 190 }}><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{l.name}</div>
                      {l.companyName && <div style={{ fontSize: 11, color: '#888' }}>{l.companyName}</div>}
                      <div style={{ fontSize: 11, color: '#888' }}>{[l.email, l.phone].filter(Boolean).join(' · ')}</div>
                      {abiertos(l) && l.clienteExistente && (
                        <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                          Ya está en el directorio:{' '}
                          <a className="enlace-tabla" href={`/ventas/clientes?ficha=${l.clienteExistente.id}`}
                            onClick={(e) => { e.preventDefault(); navigate(`/ventas/clientes?ficha=${l.clienteExistente!.id}`); }}>
                            {l.clienteExistente.name}
                          </a>
                        </div>
                      )}
                    </td>
                    {columnasVisiblesLead.map((k) => (
                      <td key={k} style={k === 'llego' ? { whiteSpace: 'nowrap' } : k === 'canal' ? { fontSize: 12 } : undefined}>
                        {celdaLead(k, l)}
                      </td>
                    ))}
                    <td className="col-acciones col-acciones--ancha">
                      <div className="acciones-iconos" style={{ justifyContent: 'flex-end' }}>
                        {abiertos(l) && (!l.contactReason || l.contactReason === 'SERVICIO') && (
                          <button className="btn-secondary" onClick={() => setConvirtiendo(l)} style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <ArrowRightCircle size={14} /> Pasar a oportunidad
                          </button>
                        )}
                        {l.status === 'CONVERTIDO' && (l.convertedOpportunityId || l.convertedClientId) && (
                          <button className="btn-secondary" onClick={() => navigate('/ventas/oportunidades')} style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <ArrowRightCircle size={14} /> Ver oportunidad
                          </button>
                        )}
                        <RowActionsMenu actions={acciones(l)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nuevo && (
        <NuevoLeadModal
          onClose={() => setNuevo(false)}
          onSaved={() => { setNuevo(false); showToast('Posible cliente creado', 'success'); cargar(); }}
        />
      )}
      {convirtiendo && (
        <ConvertirLeadModal
          lead={convirtiendo}
          servicios={servicios}
          onClose={() => setConvirtiendo(null)}
          onDone={(r) => {
            setConvirtiendo(null);
            const base = r.sumadaAClienteExistente ? 'Oportunidad sumada a su ficha del directorio' : 'Oportunidad creada: queda como prospecto hasta que acepte';
            const aviso = r.posiblesDuplicados?.length
              ? ` (se parece a «${r.posiblesDuplicados[0].name}»: revisa que no sea el mismo)`
              : '';
            showToast(base + aviso, 'success');
            cargar();
            navigate('/ventas/oportunidades');
          }}
        />
      )}
      {descartando && (
        <MotivoCierreModal
          kind="LEAD_DESCARTE"
          titulo="Descartar posible cliente"
          descripcion={descartando.name}
          contexto="Un posible cliente descartado sale de la bandeja pero no se borra. Elige por qué: no contestó, postulante, proveedor, spam, no es un servicio nuestro…"
          confirmLabel="Descartar"
          onConfirm={async (m) => {
            await descartarLeadEntrante(descartando.id, m);
            setDescartando(null);
            showToast('Posible cliente descartado', 'success');
            cargar();
          }}
          onCancel={() => setDescartando(null)}
        />
      )}
    </div>
  );
}

// «Landing: monitoreo · Servicio pedido: Alarmas», si la landing los mandó.
function origenLanding(l: LeadEntrante): string {
  const e = l.extra || {};
  const landing = typeof e.landing === 'string' ? e.landing.trim() : '';
  const servicio = typeof e.servicio === 'string' ? e.servicio.trim() : '';
  return [landing && `Landing: ${landing}`, servicio && `Servicio pedido: ${servicio}`].filter(Boolean).join(' · ');
}

const GRUPO_CANAL_LABEL: Record<CanalLeadDef['grupo'], string> = {
  ANUNCIO: 'Anuncios pagados',
  WEB: 'Sitio web',
  DIRECTO: 'Contacto directo',
};

const OTRA_PERSONA = '__otra__';

// «Quién lo refirió»: se elige a alguien de la empresa de la lista (queda unido al cliente y se le avisa
// cuando avance) o se escribe el nombre de alguien de afuera. Guarda `<campo>UserId` cuando es de la lista.
function CampoReferidor({ campo, propios, setPropios }: {
  campo: { key: string; label: string; ayuda?: string };
  propios: Record<string, string>;
  setPropios: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const [personas, setPersonas] = useState<{ id: number; fullName: string; position?: string | null }[]>([]);
  const [fallo, setFallo] = useState(false);
  const claveId = `${campo.key}UserId`;
  useEffect(() => {
    let vivo = true;
    getReferidoresLead().then((p) => { if (vivo) setPersonas(p); }).catch(() => { if (vivo) setFallo(true); });
    return () => { vivo = false; };
  }, []);

  const elegido = propios[claveId] ?? '';
  const escribiendo = elegido === OTRA_PERSONA || fallo;
  const elegir = (v: string) => setPropios((p) => {
    const { [campo.key]: _texto, [claveId]: _id, ...resto } = p;
    return v === '' ? resto : { ...resto, [claveId]: v };
  });

  return (
    <div className="form-group">
      <label>{campo.label} (opcional)</label>
      {!fallo && (
        <select value={elegido} onChange={(e) => elegir(e.target.value)}>
          <option value="">Nadie en particular</option>
          {personas.length > 0 && (
            <optgroup label="Personas de la empresa">
              {personas.map((u) => (
                <option key={u.id} value={String(u.id)}>{u.fullName}{u.position ? ` · ${u.position}` : ''}</option>
              ))}
            </optgroup>
          )}
          <option value={OTRA_PERSONA}>Otra persona (escribir el nombre)</option>
        </select>
      )}
      {escribiendo && (
        <input type="text" style={{ marginTop: fallo ? 0 : 8 }} placeholder="Nombre de quien lo refirió" maxLength={300}
          value={propios[campo.key] ?? ''} onChange={(e) => setPropios((p) => ({ ...p, [campo.key]: e.target.value }))} />
      )}
      {campo.ayuda && <small style={{ color: '#718096' }}>{campo.ayuda}</small>}
    </div>
  );
}

// Ingreso manual de un lead (una llamada, un referido, un lead de Meta que aún
// no entra solo). La fuente es obligatoria: sin ella no se sabría de dónde
// vienen los leads ni cuáles terminan en venta. Al elegirla aparecen solo los
// datos propios de esa fuente.
function NuevoLeadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const navigate = useNavigate();
  const { canales } = useCanalesLead();
  const [datos, setDatos] = useState({ name: '', email: '', phone: '', companyName: '', direccion: '', message: '', channel: '' });
  const [propios, setPropios] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof datos, v: string) => setDatos((d) => ({ ...d, [k]: v }));
  const canalElegido = canales.find((c) => c.key === datos.channel);

  const elegirFuente = (key: string) => {
    set('channel', key);
    setPropios({});
  };

  const guardar = async () => {
    setError('');
    if (!datos.channel) {
      return setError('Elige cómo llegó el posible cliente (Google Ads, Referido, WhatsApp, llamada…).');
    }
    if (!datos.name.trim() && !datos.email.trim() && !datos.phone.trim()) {
      return setError('Escribe al menos un nombre, un correo o un teléfono.');
    }
    setGuardando(true);
    try {
      const { campaign, ...extra } = propios;
      // «Otra persona» es solo una opción del selector, no un usuario: no viaja al servidor.
      for (const k of Object.keys(extra)) if (extra[k] === OTRA_PERSONA) delete extra[k];
      await createLeadEntrante({ ...datos, campaign, extra });
      onSaved();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError((Array.isArray(msg) ? msg[0] : msg) || 'No se pudo guardar el posible cliente. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nuevo posible cliente</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          <div className="form-ayuda">
            <FlujoComercialPasos actual={1} />
            <p>
              Para alguien que <strong>apenas te contactó</strong> y aún no sabes si quiere un servicio. Solo guardas sus datos y cómo llegó;
              {' '}<strong>todavía no está en el Directorio</strong>: entra cuando lo pasas a oportunidad, y ahí eliges los servicios.
            </p>
            <p>
              ¿Ya está en el Directorio y pide otro servicio?{' '}
              <a href="#nueva-oportunidad" className="enlace-tabla" onClick={(e) => { e.preventDefault(); navigate('/ventas/oportunidades?nueva=1'); }}>
                Crea una nueva oportunidad
              </a>
            </p>
          </div>
          <div className="form-group"><label>Nombre</label><input type="text" value={datos.name} maxLength={150} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="form-row">
            <div className="form-group"><label>Correo</label><input type="email" value={datos.email} onChange={(e) => set('email', e.target.value)} /></div>
            <div className="form-group"><label>Teléfono</label><input type="text" value={datos.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          </div>
          <div className="form-group"><label>Empresa</label><input type="text" value={datos.companyName} maxLength={150} onChange={(e) => set('companyName', e.target.value)} /></div>
          <div className="form-group">
            <label>Dirección (opcional)</label>
            <input type="text" value={datos.direccion} maxLength={300} placeholder="Ej: Av. Amazonas 123, Quito" onChange={(e) => set('direccion', e.target.value)} />
            <small style={{ color: '#718096' }}>Pasa a la ficha de la empresa cuando este posible cliente se convierta en oportunidad.</small>
          </div>
          <div className="form-group" role="radiogroup" aria-label="Fuente: cómo llegó" aria-required="true">
            <label>Fuente: ¿cómo llegó? *</label>
            {(['ANUNCIO', 'WEB', 'DIRECTO'] as const).map((g) => {
              const delGrupo = canales.filter((c) => c.grupo === g);
              return delGrupo.length === 0 ? null : (
                <div key={g} className="fuente-grupo">
                  <span className="fuente-grupo-titulo">{GRUPO_CANAL_LABEL[g]}</span>
                  <div className="fuente-chips">
                    {delGrupo.map((c) => (
                      <button type="button" key={c.key} role="radio" aria-checked={datos.channel === c.key}
                        className={`fuente-chip${datos.channel === c.key ? ' activo' : ''}`}
                        onClick={() => elegirFuente(c.key)}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {canalElegido && canalElegido.campos.length > 0 && (
            <div className="fuente-datos">
              <span className="fuente-grupo-titulo">Datos de «{canalElegido.label}»</span>
              {canalElegido.campos.map((campo) => campo.usuario ? (
                <CampoReferidor key={campo.key} campo={campo} propios={propios} setPropios={setPropios} />
              ) : (
                <div className="form-group" key={campo.key}>
                  <label>{campo.label} (opcional)</label>
                  <input type="text" value={propios[campo.key] ?? ''} maxLength={campo.key === 'campaign' ? 150 : 300}
                    onChange={(e) => setPropios((p) => ({ ...p, [campo.key]: e.target.value }))} />
                  {campo.ayuda && <small style={{ color: '#718096' }}>{campo.ayuda}</small>}
                </div>
              ))}
            </div>
          )}
          <div className="form-group">
            <label>Qué pidió o escribió</label>
            <textarea className="form-textarea" rows={3} maxLength={2000} value={datos.message} onChange={(e) => set('message', e.target.value)} />
            <small style={{ color: '#718096' }}>Con sus palabras. Los servicios exactos se eligen al pasar a oportunidad.</small>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}
