import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, UserPlus, UserMinus, XCircle, ClipboardList, ArrowRightCircle } from 'lucide-react';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import ExportTableButton from '../../components/common/ExportTableButton';
import ErrorBanner from '../../components/common/ErrorBanner';
import RowActionsMenu, { type RowAction } from '../../components/common/RowActionsMenu';
import MotivoCierreModal from '../../components/ventas/MotivoCierreModal';
import ConvertirLeadModal from '../../components/ventas/ConvertirLeadModal';
import VentasPageHeader from '../../components/ventas/VentasPageHeader';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useColumnFilters } from '../../hooks/useColumnFilters';
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
import { diaCortoEcuador } from '../../utils/rangoFechas';
import { filtroDeValores } from '../../utils/columnFilters';
import { ESTADOS_LEAD_PENDIENTES, filtrosDeUrlLeads } from '../../utils/ventasFiltrosUrl';

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
  // Solo tiene dato en los descartados. Se muestra sola al filtrar por ella (p. ej. desde el Dashboard).
  { key: 'motivoDescarte', label: 'Motivo del descarte' },
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
  landing: 150, gclid: 170, referidoPor: 150, consentimiento: 150, motivoDescarte: 160,
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
  // Los filtros viven en la cabecera de cada columna (useColumnFilters). Abre mostrando solo los pendientes
  // (sin procesar y contactados): se ve como el chip «Estado» y se cambia o se quita desde ahí.
  const cf = useColumnFilters<LeadEntrante>(leads, [
    { key: 'contacto', etiqueta: 'Contacto', tipo: 'texto', getValue: (l) => [l.name, l.companyName, l.email, l.phone].filter(Boolean).join(' ') },
    { key: 'mensaje', etiqueta: 'Mensaje', tipo: 'texto', getValue: (l) => l.message },
    { key: 'canal', etiqueta: 'Fuente', tipo: 'valores', orden: canales.map((c) => c.key), getValues: (l) => ({ valor: l.channel, etiqueta: etiquetaCanal(l.channel) }) },
    {
      key: 'motivo', etiqueta: 'Tipo de contacto', tipo: 'valores', vacio: 'Sin clasificar', orden: Object.keys(MOTIVO_CONTACTO_LABEL),
      getValues: (l) => (l.contactReason ? { valor: l.contactReason, etiqueta: MOTIVO_CONTACTO_LABEL[l.contactReason] } : null),
    },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: Object.keys(ESTADO_LABEL), getValues: (l) => ({ valor: l.status, etiqueta: ESTADO_LABEL[l.status] }) },
    {
      key: 'responsable', etiqueta: 'Responsable', tipo: 'valores', vacio: 'Sin asignar',
      getValues: (l) => (l.assignedUserId ? { valor: String(l.assignedUserId), etiqueta: l.assignedUserName || `Usuario ${l.assignedUserId}` } : null),
    },
    { key: 'llego', etiqueta: 'Llegó', tipo: 'fecha', getValue: (l) => l.createdAt },
    { key: 'campana', etiqueta: 'Campaña', tipo: 'valores', vacio: 'Sin campaña', getValues: (l) => l.campaign },
    { key: 'servicio', etiqueta: 'Servicio pedido', tipo: 'valores', vacio: 'Sin dato', getValues: (l) => extraTexto(l, 'servicio') },
    { key: 'landing', etiqueta: 'Landing', tipo: 'valores', vacio: 'Sin dato', getValues: (l) => extraTexto(l, 'landing') },
    { key: 'gclid', etiqueta: 'gclid', tipo: 'texto', getValue: (l) => extraTexto(l, 'gclid') },
    { key: 'referidoPor', etiqueta: 'Referido por', tipo: 'valores', vacio: 'Nadie', getValues: (l) => extraTexto(l, 'referidoPor') },
    {
      key: 'consentimiento', etiqueta: 'Consentimiento', tipo: 'valores', vacio: 'Sin dato',
      getValues: (l) => { const c = extraTexto(l, 'consentimiento'); return c ? { valor: c, etiqueta: c === 'SI' ? 'Sí' : 'No consta' } : null; },
    },
    { key: 'motivoDescarte', etiqueta: 'Motivo del descarte', tipo: 'valores', vacio: 'Sin motivo', getValues: (l) => l.motivoDescarte },
  ], { inicial: { estado: filtroDeValores(ESTADOS_LEAD_PENDIENTES) } });

  const [searchParams, setSearchParams] = useSearchParams();
  const { fijarVarios } = cf;
  useEffect(() => {
    // Llegan del Dashboard («Motivos de pérdida», tarjetas…): ?estado=DESCARTADO&motivoDescarte=…&responsable=mine|<id>
    // &desde=&hasta=. Cada uno se vuelve el filtro de su columna y queda a la vista como chip.
    const filtros = filtrosDeUrlLeads(searchParams, usuario?.id);
    fijarVarios(filtros);
    // ?nuevo=1: «Nueva oportunidad» manda aquí a quien apenas escribió y todavía no es oportunidad.
    if (searchParams.get('nuevo') === '1') setNuevo(true);
    if (Object.keys(filtros).length > 0 || searchParams.get('nuevo')) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- usuario no cambia mientras la pantalla está abierta.
  }, [searchParams, setSearchParams, fijarVarios]);
  const [nuevo, setNuevo] = useState(false);
  const [convirtiendo, setConvirtiendo] = useState<LeadEntrante | null>(null);
  const [descartando, setDescartando] = useState<LeadEntrante | null>(null);
  // Columnas que cada persona elige ver (preferencia en su cuenta).
  const columnPrefs = useColumnPreferences('ventas-leads', COLUMNAS_LEAD_POR_DEFECTO);
  // Al filtrar por una fuente se suman las columnas con los datos propios de
  // esa fuente (p. ej. gclid en Google Ads), aunque no las haya elegido.
  const columnasVisiblesLead = useMemo(() => {
    const elegidas = columnPrefs.visible.filter((k) => COLUMNAS_LEAD.some((c) => c.key === k));
    const filtroCanal = cf.filtro('canal');
    const canal = filtroCanal?.tipo === 'valores' && filtroCanal.incluir.length === 1 ? filtroCanal.incluir[0] : '';
    const propias = (canales.find((c) => c.key === canal)?.campos ?? [])
      .map((c) => COLUMNA_DE_CAMPO[c.key])
      .filter((k): k is string => !!k && !elegidas.includes(k));
    // Filtrar por «Motivo del descarte» muestra esa columna aunque no se haya elegido.
    if (cf.filtro('motivoDescarte') && !elegidas.includes('motivoDescarte')) propias.push('motivoDescarte');
    return [...elegidas, ...propias];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cf.filtro lee los filtros de ese momento; se recalcula cuando cambian.
  }, [columnPrefs.visible, canales, cf.filtros]);
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

  // Los filtros de columna ya se aplicaron (cf.filas); aquí solo falta el buscador general.
  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return cf.filas;
    return cf.filas.filter((l) => (
      l.name.toLowerCase().includes(q) ||
      (l.email || '').toLowerCase().includes(q) ||
      (l.phone || '').includes(q) ||
      (l.companyName || '').toLowerCase().includes(q) ||
      (l.message || '').toLowerCase().includes(q)
    ));
  }, [cf.filas, busqueda]);

  const { filas, thProps, ordenDe } = useSortableTable(
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
      motivoDescarte: (l) => l.motivoDescarte,
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
      case 'motivoDescarte':
        return l.motivoDescarte || '—';
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
      case 'llego': return diaCortoEcuador(l.createdAt);
      case 'campana': return l.campaign || '';
      case 'servicio': case 'landing': case 'gclid': case 'referidoPor': return extraTexto(l, key);
      case 'motivoDescarte': return l.motivoDescarte || '';
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

  const hayFiltros = !!busqueda || cf.hayFiltros;
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
        <div className="filter-bar-fields">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, correo, teléfono o mensaje..."
            style={{ flex: '1 1 200px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
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
            onClear={() => { setBusqueda(''); cf.limpiar(); }}
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

      <ChipsFiltros cf={cf} />

      <div className="admin-section">
        {cargando ? (
          <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
        ) : leads.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 36, marginBottom: 8 }}>📥</div>
            <div>Aún no hay posibles clientes. Llegan solos desde la web y las landings (ver Configuración → Cómo llegan los posibles clientes) o se ingresan a mano.</div>
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
              <thead>
                <tr>
                  <th {...thProps('contacto')} style={{ width: 240 }}>Contacto <ColumnFilter cf={cf} col="contacto" orden={ordenDe('contacto')} /></th>
                  {columnasVisiblesLead.map((k) => {
                    const col = COLUMNAS_LEAD.find((c) => c.key === k)!;
                    return (
                      <th key={k} {...thProps(k)} style={{ width: ANCHO_COLUMNA_LEAD[k] }}>
                        {col.label} <ColumnFilter cf={cf} col={k} orden={ordenDe(k)} />
                      </th>
                    );
                  })}
                  <th className="col-acciones col-acciones--ancha" style={{ width: 190 }}><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados
                    columnas={columnasVisiblesLead.length + 2}
                    mensaje="No hay posibles clientes que coincidan con los filtros."
                    onLimpiar={hayFiltros ? () => { setBusqueda(''); cf.limpiar(); } : undefined}
                  />
                )}
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
