import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import ErrorBanner from '../../components/common/ErrorBanner';
import ExportTableButton from '../../components/common/ExportTableButton';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useToast } from '../../contexts/ToastContext';
import {
  getClicsWhatsapp,
  marcarEscribioWhatsapp,
  type ClicWhatsapp,
  type FaseClicWhatsapp,
} from '../../services/ventas.service';

// Los puntos del recorrido de UN mismo clic (estados del punto 9 de la guía de medición): no se marcan a mano,
// salen del posible cliente y de la oportunidad. Solo «Escribió» lo pulsa el vendedor.
const FASE_LABEL: Record<FaseClicWhatsapp, string> = {
  CLIC: 'Clic',
  ESCRIBIO: 'Escribió',
  OPORTUNIDAD: 'Oportunidad',
  VENTA: 'Venta',
  PERDIDA: 'Perdida',
  DESCARTADO: 'Descartado',
};
const FASE_COLOR: Record<FaseClicWhatsapp, string> = {
  CLIC: '#718096',
  ESCRIBIO: '#2b6cb0',
  OPORTUNIDAD: '#d97706',
  VENTA: '#2f855a',
  PERDIDA: '#c53030',
  DESCARTADO: '#a0aec0',
};

// «monitoreo_vehiculos» → «Monitoreo vehiculos»
const servicioLegible = (s: string | null) => (s ? s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');
const faseTexto = (c: ClicWhatsapp) => (c.fase === 'OPORTUNIDAD' && c.etapa ? c.etapa : FASE_LABEL[c.fase]);
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const COLUMNAS_EXPORTAR = [
  { key: 'codigo', label: 'Código' },
  { key: 'fecha', label: 'Fecha del clic' },
  { key: 'estado', label: 'Estado' },
  { key: 'fuente', label: 'Fuente' },
  { key: 'medio', label: 'Medio' },
  { key: 'campana', label: 'Campaña' },
  { key: 'landing', label: 'Landing' },
  { key: 'servicio', label: 'Servicio' },
  { key: 'grupo', label: 'Grupo de servicio' },
  { key: 'gclid', label: 'gclid' },
  { key: 'contacto', label: 'Posible cliente' },
];

// Pestaña «Clics de WhatsApp» de Posibles clientes. Cada vez que alguien toca el botón de WhatsApp de una landing
// queda aquí. Cuando llega su mensaje, el vendedor busca el código, pulsa «Escribió» y nace el posible cliente (fuente
// WhatsApp, mismo código); de ahí sigue el flujo normal en Oportunidades y la fila va mostrando el recorrido del mismo clic.
export default function WhatsappClicsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [clics, setClics] = useState<ClicWhatsapp[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [escribio, setEscribio] = useState<ClicWhatsapp | null>(null);

  const cf = useColumnFilters<ClicWhatsapp>(clics, [
    { key: 'codigo', etiqueta: 'Código', tipo: 'texto', getValue: (c) => c.trackingId },
    { key: 'fecha', etiqueta: 'Fecha del clic', tipo: 'fecha', getValue: (c) => c.clickedAt },
    {
      key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: Object.keys(FASE_LABEL),
      getValues: (c) => ({ valor: c.fase, etiqueta: FASE_LABEL[c.fase] }),
    },
    { key: 'fuente', etiqueta: 'Fuente', tipo: 'valores', getValues: (c) => c.utmSource },
    { key: 'campana', etiqueta: 'Campaña', tipo: 'valores', getValues: (c) => c.utmCampaign },
    { key: 'landing', etiqueta: 'Landing', tipo: 'valores', vacio: 'Sin dato', getValues: (c) => c.landingPage },
    {
      key: 'servicio', etiqueta: 'Servicio', tipo: 'valores', vacio: 'Sin dato',
      getValues: (c) => (c.serviceName ? { valor: c.serviceName, etiqueta: servicioLegible(c.serviceName) } : null),
    },
  ]);

  const cargar = async () => {
    try {
      setClics(await getClicsWhatsapp());
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudieron cargar los clics de WhatsApp', 'error');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return cf.filas;
    return cf.filas.filter((c) => (
      c.trackingId.toLowerCase().includes(q) ||
      c.utmCampaign.toLowerCase().includes(q) ||
      (c.landingPage || '').toLowerCase().includes(q) ||
      (c.leadName || '').toLowerCase().includes(q)
    ));
  }, [cf.filas, busqueda]);

  const tablaRef = useResizableColumns('ventas-whatsapp-clics', ['codigo', 'fecha', 'estado', 'fuente', 'campana', 'landing', 'servicio', 'contacto', 'acciones']);

  // Cifras del embudo: cada tramo cuenta los clics que llegaron AL MENOS hasta ahí.
  const total = clics.length;
  const escribieron = clics.filter((c) => c.fase !== 'CLIC').length;
  const oportunidades = clics.filter((c) => ['OPORTUNIDAD', 'VENTA', 'PERDIDA'].includes(c.fase)).length;
  const ventas = clics.filter((c) => c.fase === 'VENTA').length;
  const tasa = total ? Math.round((escribieron / total) * 100) : 0;

  const hayFiltros = !!busqueda || cf.hayFiltros;
  const limpiar = () => { setBusqueda(''); cf.limpiar(); };

  const valorExportar = (c: ClicWhatsapp, key: string): string => {
    switch (key) {
      case 'codigo': return c.trackingId;
      case 'fecha': return fechaHora(c.clickedAt);
      case 'estado': return faseTexto(c);
      case 'fuente': return c.utmSource;
      case 'medio': return c.utmMedium;
      case 'campana': return c.utmCampaign;
      case 'landing': return c.landingPage || '';
      case 'servicio': return servicioLegible(c.serviceName);
      case 'grupo': return c.serviceGroup || '';
      case 'gclid': return c.gclid || '';
      case 'contacto': return c.leadName || '';
      default: return '';
    }
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: '#718096', margin: '0 0 12px' }}>
        Cada vez que alguien toca el botón de WhatsApp en una landing queda aquí con su código. Cuando llega su mensaje, búscalo y pulsa <strong>Escribió</strong>: ahí nace el posible cliente. Es el mismo clic de principio a fin; su estado se actualiza solo según avance la oportunidad.
      </p>

      <div className="admin-section" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
        {[
          ['Clics', total],
          ['Escribieron', `${escribieron} (${tasa}%)`],
          ['Con oportunidad', oportunidades],
          ['Ventas', ventas],
        ].map(([etiqueta, valor]) => (
          <div key={etiqueta as string} style={{ minWidth: 120 }}>
            <div style={{ fontSize: 12, color: '#718096' }}>{etiqueta}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{valor}</div>
          </div>
        ))}
      </div>

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código, campaña, landing o nombre..."
            style={{ flex: '1 1 200px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={limpiar} disabled={!hayFiltros} />
          <ExportTableButton
            titulo="Clics de WhatsApp"
            columns={COLUMNAS_EXPORTAR}
            defaultKeys={['codigo', 'fecha', 'estado', 'fuente', 'campana', 'landing', 'servicio', 'contacto']}
            rows={filtrados}
            getValue={valorExportar}
          />
        </div>
      </div>

      <ChipsFiltros cf={cf} />

      <div className="admin-section">
        {cargando ? (
          <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
        ) : clics.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
            <div>Aún no hay clics. Aparecen cuando las landings tengan instalado el script (Configuración → Conexiones → WhatsApp de las landings) y alguien toque WhatsApp.</div>
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={1}>
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Código <ColumnFilter cf={cf} col="codigo" orden={cf.ordenDe('codigo')} /></th>
                  <th style={{ width: 130 }}>Fecha del clic <ColumnFilter cf={cf} col="fecha" orden={cf.ordenDe('fecha')} /></th>
                  <th style={{ width: 140 }}>Estado <ColumnFilter cf={cf} col="estado" orden={cf.ordenDe('estado')} /></th>
                  <th style={{ width: 110 }}>Fuente <ColumnFilter cf={cf} col="fuente" orden={cf.ordenDe('fuente')} /></th>
                  <th style={{ width: 170 }}>Campaña <ColumnFilter cf={cf} col="campana" orden={cf.ordenDe('campana')} /></th>
                  <th style={{ width: 170 }}>Landing <ColumnFilter cf={cf} col="landing" orden={cf.ordenDe('landing')} /></th>
                  <th style={{ width: 160 }}>Servicio <ColumnFilter cf={cf} col="servicio" orden={cf.ordenDe('servicio')} /></th>
                  <th style={{ width: 170 }}>Posible cliente</th>
                  <th className="col-acciones col-acciones--ancha" style={{ width: 190 }}><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <FilaSinResultados
                    columnas={9}
                    mensaje="No hay clics que coincidan con los filtros."
                    onLimpiar={hayFiltros ? limpiar : undefined}
                  />
                )}
                {filtrados.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.trackingId}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fechaHora(c.clickedAt)}</td>
                    <td>
                      <span className="status-badge" style={{ backgroundColor: FASE_COLOR[c.fase] + '22', color: FASE_COLOR[c.fase], whiteSpace: 'nowrap' }}>
                        {faseTexto(c)}
                      </span>
                    </td>
                    <td>{c.utmSource}{c.utmMedium !== 'none' && <div style={{ fontSize: 11, color: '#888' }}>{c.utmMedium}</div>}</td>
                    <td><span className="truncate" style={{ display: 'block' }} title={c.utmCampaign}>{c.utmCampaign}</span></td>
                    <td><span className="truncate" style={{ display: 'block' }} title={c.landingPage || ''}>{c.landingPage || '—'}</span></td>
                    <td>{servicioLegible(c.serviceName) || '—'}</td>
                    <td>{c.leadName || '—'}</td>
                    <td className="col-acciones col-acciones--ancha">
                      <div className="acciones-iconos" style={{ justifyContent: 'flex-end' }}>
                        {c.fase === 'CLIC' ? (
                          <button className="btn-secondary" onClick={() => setEscribio(c)} style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <MessageCircle size={14} /> Escribió
                          </button>
                        ) : (
                          <button className="btn-secondary" onClick={() => navigate(c.opportunityId ? '/ventas/oportunidades' : '/ventas/leads')} style={{ padding: '4px 10px', fontSize: 12 }}>
                            {c.opportunityId ? 'Ver oportunidad' : 'Ver posible cliente'}
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

      {escribio && (
        <EscribioModal
          clic={escribio}
          onClose={() => setEscribio(null)}
          onDone={() => {
            setEscribio(null);
            showToast('Posible cliente creado en Posibles clientes, con fuente WhatsApp y el mismo código', 'success');
            cargar();
          }}
        />
      )}
    </div>
  );
}

function EscribioModal({ clic, onClose, onDone }: { clic: ClicWhatsapp; onClose: () => void; onDone: () => void }) {
  const [datos, setDatos] = useState({ name: '', phone: '', email: '', companyName: '', message: '' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof datos, v: string) => setDatos((d) => ({ ...d, [k]: v }));

  const guardar = async () => {
    setError('');
    if (!datos.name.trim() && !datos.phone.trim() && !datos.email.trim()) {
      return setError('Escribe al menos un nombre, un teléfono o un correo de quien escribió.');
    }
    setGuardando(true);
    try {
      // Solo viajan los campos con texto: el servidor rechaza vacíos en los que sí valida.
      const limpio = Object.fromEntries(Object.entries(datos).filter(([, v]) => v.trim())) as typeof datos;
      await marcarEscribioWhatsapp(clic.id, limpio);
      onDone();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError((Array.isArray(msg) ? msg[0] : msg) || 'No se pudo crear el posible cliente. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Escribió</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          <div className="form-ayuda">
            <p>
              Código <strong style={{ fontFamily: 'monospace' }}>{clic.trackingId}</strong>
              {clic.landingPage ? <> · landing <strong>{clic.landingPage}</strong></> : null}
              {clic.utmCampaign !== 'none' ? <> · campaña <strong>{clic.utmCampaign}</strong></> : null}.
              {' '}Con los datos de quien escribió se crea el posible cliente; la fuente y el código quedan guardados.
            </p>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Nombre</label><input type="text" value={datos.name} maxLength={150} onChange={(e) => set('name', e.target.value)} /></div>
            <div className="form-group"><label>Teléfono</label><input type="text" value={datos.phone} maxLength={150} onChange={(e) => set('phone', e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Correo (opcional)</label><input type="email" value={datos.email} maxLength={150} onChange={(e) => set('email', e.target.value)} /></div>
            <div className="form-group"><label>Empresa (opcional)</label><input type="text" value={datos.companyName} maxLength={150} onChange={(e) => set('companyName', e.target.value)} /></div>
          </div>
          <div className="form-group">
            <label>Qué pidió (opcional)</label>
            <textarea className="form-textarea" rows={2} maxLength={2000} value={datos.message} onChange={(e) => set('message', e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Crear posible cliente'}</button>
        </div>
      </div>
    </div>
  );
}
