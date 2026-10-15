import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Plug, UserPlus, UserMinus, XCircle, ClipboardList, ArrowRightCircle } from 'lucide-react';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import ErrorBanner from '../../components/common/ErrorBanner';
import RowActionsMenu, { type RowAction } from '../../components/common/RowActionsMenu';
import MotivoCierreModal from '../../components/ventas/MotivoCierreModal';
import ConvertirLeadModal from '../../components/ventas/ConvertirLeadModal';
import ConexionesLeadsModal from '../../components/ventas/ConexionesLeadsModal';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useToast } from '../../contexts/ToastContext';
import { getUser } from '../../services/auth.service';
import {
  getLeadsEntrantes,
  createLeadEntrante,
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
import { diaCorto } from '../../utils/contratoComercial';

// Columnas elegibles (además de Contacto y Acciones, que son fijas). Las
// últimas son datos propios de cada fuente (campaña, gclid, landing, quién
// refirió): al filtrar por una fuente se muestran solas las que ella usa.
const COLUMNAS_LEAD = [
  { key: 'mensaje', label: 'Mensaje' },
  { key: 'canal', label: 'Canal' },
  { key: 'motivo', label: 'Motivo del contacto' },
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
  const [conexiones, setConexiones] = useState(false);
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
      showToast(err?.response?.data?.message || 'No se pudieron cargar los leads', 'error');
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
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.phone || '').includes(q) ||
        (l.companyName || '').toLowerCase().includes(q) ||
        (l.message || '').toLowerCase().includes(q)
      );
    });
  }, [leads, busqueda, estado, motivo]);
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
              aria-label={`Motivo del contacto de ${l.name}`}
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
                  title="Solo es un aviso: el lead sigue en la bandeja hasta que lo atiendas.">
                  Sin atender hace {diasDesde(l.createdAt)} días
                </span>
              </div>
            )}
          </>
        );
      case 'responsable':
        return l.assignedUserName || <span style={{ color: '#a0aec0' }}>Sin asignar</span>;
      case 'llego':
        return diaCorto(l.createdAt);
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
        lista.push({ label: 'Tomar este lead', icon: <UserPlus size={14} />, onClick: () => correr(() => tomarLeadEntrante(l.id), 'Lead tomado', 'No se pudo tomar el lead') });
      } else if (l.assignedUserId === usuario?.id) {
        lista.push({ label: 'Soltar este lead', icon: <UserMinus size={14} />, onClick: () => correr(() => soltarLeadEntrante(l.id), 'Lead liberado', 'No se pudo soltar el lead') });
      }
      lista.push({ label: 'Descartar', icon: <XCircle size={14} />, danger: true, onClick: () => setDescartando(l) });
    }
    return lista;
  };

  const hayFiltros = !!busqueda || estado !== 'pendientes' || !!motivo || !!canal;
  const sinClasificar = leads.filter((l) => abiertos(l) && !l.contactReason).length;

  return (
    <div className="page-container">
      <div className="page-title-row">
        <div>
          <p className="page-eyebrow">Ventas y CRM</p>
          <h1>Leads</h1>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setConexiones(true)}>
            <Plug size={16} /> Conexiones
          </button>
          <button className="auth-btn" onClick={() => setNuevo(true)}>
            <Plus size={16} /> Nuevo lead
          </button>
        </div>
      </div>

      <p style={{ fontSize: 13, color: '#666', margin: '-6px 0 14px' }}>
        Contactos que llegan por la web, los anuncios o a mano. Clasifícalos: solo uno de servicio pasa a oportunidad. {sinClasificar > 0 && <strong>{sinClasificar} sin clasificar.</strong>}
      </p>

      {leads.length > 0 && (
        <ResumenPorFuente
          canales={canales}
          totales={totalesPorFuente}
          total={sinFiltroDeFuente.length}
          activa={canal}
          onElegir={setCanal}
        />
      )}

      <div className="filter-bar">
        <div className="filter-bar-fields filter-bar-fields--una-linea">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, correo, teléfono o mensaje..."
            style={{ flex: '1 1 200px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
          <select className="filter-select" value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
            <option value="pendientes">Pendientes</option>
            <option value="">Todos</option>
            <option value="NUEVO">Sin procesar</option>
            <option value="EN_SEGUIMIENTO">Contactados</option>
            <option value="CONVERTIDO">Pasaron a oportunidad</option>
            <option value="DESCARTADO">Descartados</option>
          </select>
          <select className="filter-select" value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo del contacto">
            <option value="">Todos los motivos</option>
            <option value="SIN_CLASIFICAR">Sin clasificar</option>
            {(Object.keys(MOTIVO_CONTACTO_LABEL) as MotivoContacto[]).map((k) => <option key={k} value={k}>{MOTIVO_CONTACTO_LABEL[k]}</option>)}
          </select>
          <select className="filter-select" value={canal} onChange={(e) => setCanal(e.target.value)} aria-label="Canal">
            <option value="">Todas las fuentes</option>
            {canales.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={COLUMNAS_LEAD}
            visible={columnPrefs.visible}
            fixedLabel="Contacto"
            onApply={async (keys) => {
              const guardado = await columnPrefs.set(keys);
              if (!guardado) showToast('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.', 'error');
            }}
          />
          <ClearFiltersButton
            onClear={() => { setBusqueda(''); setEstado('pendientes'); setMotivo(''); setCanal(''); }}
            disabled={!hayFiltros}
          />
        </div>
      </div>

      <div className="admin-section">
        {cargando ? (
          <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
        ) : leads.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 36, marginBottom: 8 }}>📥</div>
            <div>Aún no hay leads. Llegan solos desde la web o Google Ads (ver «Conexiones») o se ingresan a mano.</div>
          </div>
        ) : filas.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>No hay leads que coincidan con los filtros.</p>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
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
                          Parece ser el cliente{' '}
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
          onSaved={() => { setNuevo(false); showToast('Lead creado', 'success'); cargar(); }}
        />
      )}
      {conexiones && <ConexionesLeadsModal onClose={() => setConexiones(false)} />}
      {convirtiendo && (
        <ConvertirLeadModal
          lead={convirtiendo}
          servicios={servicios}
          onClose={() => setConvirtiendo(null)}
          onDone={(r) => {
            setConvirtiendo(null);
            showToast(r.sumadaAClienteExistente ? 'Oportunidad sumada al cliente' : 'Oportunidad creada: queda como prospecto hasta que acepte', 'success');
            cargar();
            navigate('/ventas/oportunidades');
          }}
        />
      )}
      {descartando && (
        <MotivoCierreModal
          kind="LEAD_DESCARTE"
          titulo="Descartar lead"
          descripcion={descartando.name}
          contexto="Un lead descartado sale de la bandeja pero no se borra. Elige por qué: no contestó, postulante, proveedor, spam, no es un servicio nuestro…"
          confirmLabel="Descartar"
          onConfirm={async (m) => {
            await descartarLeadEntrante(descartando.id, m);
            setDescartando(null);
            showToast('Lead descartado', 'success');
            cargar();
          }}
          onCancel={() => setDescartando(null)}
        />
      )}
    </div>
  );
}

// Totales por fuente, de un vistazo. Cada tarjeta filtra la tabla por esa
// fuente; respeta los demás filtros (estado, motivo, búsqueda). Solo salen las
// fuentes que tienen leads (y la elegida), así una fuente que nadie usa no estorba.
function ResumenPorFuente({
  canales, totales, total, activa, onElegir,
}: {
  canales: CanalLeadDef[];
  totales: Map<string, number>;
  total: number;
  activa: string;
  onElegir: (key: string) => void;
}) {
  const conocidas = new Set(canales.map((c) => c.key));
  // Un canal que ya no esté en el registro sigue contando, con su clave.
  const desconocidas = [...totales.keys()].filter((k) => !conocidas.has(k));
  const tarjetas = [
    ...canales.filter((c) => (totales.get(c.key) ?? 0) > 0 || c.key === activa),
    ...desconocidas.map((k) => ({ key: k, label: k })),
  ];
  const estilo = (seleccionada: boolean) => ({
    display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-start', gap: 2,
    padding: '8px 14px', borderRadius: 10, cursor: 'pointer', minWidth: 110, font: 'inherit',
    border: seleccionada ? '2px solid #2b6cb0' : '1px solid #e2e8f0',
    background: seleccionada ? '#ebf4ff' : '#fff',
  });
  return (
    <div role="group" aria-label="Leads por fuente" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 14px' }}>
      <button type="button" style={estilo(!activa)} onClick={() => onElegir('')} aria-pressed={!activa}>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#1a202c' }}>{total}</span>
        <span style={{ fontSize: 12, color: '#4a5568' }}>Todas las fuentes</span>
      </button>
      {tarjetas.map((c) => (
        <button key={c.key} type="button" style={estilo(activa === c.key)} onClick={() => onElegir(activa === c.key ? '' : c.key)} aria-pressed={activa === c.key}>
          <span style={{ fontSize: 22, fontWeight: 700, color: '#1a202c' }}>{totales.get(c.key) ?? 0}</span>
          <span style={{ fontSize: 12, color: '#4a5568' }}>{c.label}</span>
        </button>
      ))}
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

// Ingreso manual de un lead (una llamada, un referido, un lead de Meta que aún
// no entra solo). La fuente es obligatoria: sin ella no se sabría de dónde
// vienen los leads ni cuáles terminan en venta. Al elegirla aparecen solo los
// datos propios de esa fuente.
function NuevoLeadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { canales } = useCanalesLead();
  const [datos, setDatos] = useState({ name: '', email: '', phone: '', companyName: '', message: '', channel: '' });
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
      return setError('Elige cómo llegó el lead (Google Ads, Referido, WhatsApp, llamada…).');
    }
    if (!datos.name.trim() && !datos.email.trim() && !datos.phone.trim()) {
      return setError('Escribe al menos un nombre, un correo o un teléfono.');
    }
    setGuardando(true);
    try {
      const { campaign, ...extra } = propios;
      await createLeadEntrante({ ...datos, campaign, extra });
      onSaved();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError((Array.isArray(msg) ? msg[0] : msg) || 'No se pudo guardar el lead. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nuevo lead</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          <div className="form-group"><label>Nombre</label><input type="text" value={datos.name} maxLength={150} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="form-row">
            <div className="form-group"><label>Correo</label><input type="email" value={datos.email} onChange={(e) => set('email', e.target.value)} /></div>
            <div className="form-group"><label>Teléfono</label><input type="text" value={datos.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          </div>
          <div className="form-group"><label>Empresa</label><input type="text" value={datos.companyName} maxLength={150} onChange={(e) => set('companyName', e.target.value)} /></div>
          <div className="form-group">
            <label>Fuente: cómo llegó *</label>
            <select value={datos.channel} onChange={(e) => elegirFuente(e.target.value)} aria-required="true">
              <option value="">Elige una fuente…</option>
              {(['ANUNCIO', 'WEB', 'DIRECTO'] as const).map((g) => {
                const delGrupo = canales.filter((c) => c.grupo === g);
                return delGrupo.length === 0 ? null : (
                  <optgroup key={g} label={GRUPO_CANAL_LABEL[g]}>
                    {delGrupo.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </div>
          {canalElegido && canalElegido.campos.length > 0 && (
            <div className="form-row">
              {canalElegido.campos.map((campo) => (
                <div className="form-group" key={campo.key}>
                  <label>{campo.label} (opcional)</label>
                  <input type="text" value={propios[campo.key] ?? ''} maxLength={campo.key === 'campaign' ? 150 : 300}
                    onChange={(e) => setPropios((p) => ({ ...p, [campo.key]: e.target.value }))} />
                  {campo.ayuda && <small style={{ color: '#718096' }}>{campo.ayuda}</small>}
                </div>
              ))}
            </div>
          )}
          <div className="form-group"><label>Qué pidió o escribió</label><textarea className="form-textarea" rows={3} maxLength={2000} value={datos.message} onChange={(e) => set('message', e.target.value)} /></div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}
