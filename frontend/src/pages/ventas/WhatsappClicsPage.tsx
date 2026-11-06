import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, MessageCircle } from 'lucide-react';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import ExportTableButton from '../../components/common/ExportTableButton';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useToast } from '../../contexts/ToastContext';
import { getClicsWhatsapp, type ClicWhatsapp } from '../../services/ventas.service';

// La pestaña es una bandeja: solo dice si el clic todavía puede escribir, si ya pasó el plazo sin mensaje o si ya
// escribió. El avance de la venta (En evaluación, Cotizada, Ganada…) se ve en Oportunidades y en el Dashboard.
// Las 48 horas solo ordenan la lista: un código que llega después (fin de semana, feriado) se enlaza igual.
type Bandeja = 'ESPERANDO' | 'SIN_MENSAJE' | 'ESCRIBIO';
const HORAS_ESPERA = 48;
const BANDEJAS: { key: Bandeja; label: string; ayuda: string }[] = [
  {
    key: 'ESPERANDO',
    label: 'Esperando mensaje',
    ayuda: `Clics de las últimas ${HORAS_ESPERA} horas. Cuando llegue un mensaje con código, búscalo aquí y pulsa «Escribió».`,
  },
  {
    key: 'SIN_MENSAJE',
    label: 'Sin mensaje aún',
    ayuda: `Pasaron más de ${HORAS_ESPERA} horas sin mensaje. Si alguien escribe tarde (fin de semana, feriado), todavía puedes pulsar «Escribió».`,
  },
  {
    key: 'ESCRIBIO',
    label: 'Ya escribió',
    ayuda: 'Ya tienen posible cliente. Su avance se ve en Oportunidades y en el Dashboard.',
  },
];
const BANDEJA_LABEL = Object.fromEntries(BANDEJAS.map((b) => [b.key, b.label])) as Record<Bandeja, string>;

const bandejaDe = (c: ClicWhatsapp): Bandeja => {
  if (c.fase !== 'CLIC') return 'ESCRIBIO';
  return Date.now() - new Date(c.clickedAt).getTime() < HORAS_ESPERA * 3600000 ? 'ESPERANDO' : 'SIN_MENSAJE';
};

// «monitoreo_vehiculos» → «Monitoreo vehiculos»
const servicioLegible = (s: string | null) => (s ? s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');
const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const hace = (iso: string) => {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `hace ${min} min`;
  if (min < 48 * 60) return `hace ${Math.floor(min / 60)} h`;
  return `hace ${Math.floor(min / 1440)} días`;
};

const COLUMNAS_EXPORTAR = [
  { key: 'codigo', label: 'Código' },
  { key: 'fecha', label: 'Fecha del clic' },
  { key: 'estado', label: 'Estado' },
  { key: 'fuente', label: 'Fuente' },
  { key: 'medio', label: 'Medio' },
  { key: 'contenido', label: 'Contenido / anuncio' },
  { key: 'palabra', label: 'Palabra clave' },
  { key: 'campana', label: 'Campaña' },
  { key: 'landing', label: 'Landing' },
  { key: 'servicio', label: 'Servicio' },
  { key: 'grupo', label: 'Grupo de servicio' },
  { key: 'gclid', label: 'gclid' },
  { key: 'contacto', label: 'Posible cliente' },
];

// Lista de los clics de WhatsApp de las landings (se abre en una ventana desde «Llegó un WhatsApp» y desde el Dashboard de
// marketing). Cada vez que alguien toca el botón de WhatsApp de una landing queda aquí. El camino del vendedor no empieza
// en esta lista sino en «Llegó un WhatsApp» (escribe el código del mensaje); aquí se consulta, se audita por campaña y,
// si hace falta, se pulsa «Escribió» en una fila. `version` cambia cuando la ventana de arriba creó un posible cliente.
export default function WhatsappClicsPage({ version, onEscribio }: { version: number; onEscribio: (c: ClicWhatsapp) => void }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [clics, setClics] = useState<ClicWhatsapp[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [bandeja, setBandeja] = useState<Bandeja>('ESPERANDO');

  const cf = useColumnFilters<ClicWhatsapp>(clics, [
    { key: 'codigo', etiqueta: 'Código', tipo: 'texto', getValue: (c) => c.trackingId },
    { key: 'fecha', etiqueta: 'Fecha del clic', tipo: 'fecha', getValue: (c) => c.clickedAt },
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
  useEffect(() => { cargar(); }, [version]);

  const cuentas = useMemo(() => {
    const n: Record<Bandeja, number> = { ESPERANDO: 0, SIN_MENSAJE: 0, ESCRIBIO: 0 };
    for (const c of clics) n[bandejaDe(c)] += 1;
    return n;
  }, [clics]);

  // Con algo escrito en el buscador se busca en TODOS los clics, sin importar la bandeja ni los filtros de columna:
  // el vendedor llega con un código en la mano y no tiene por qué saber en qué bandeja cayó.
  const q = busqueda.toLowerCase().trim();
  const filtrados = useMemo(() => {
    if (q) {
      return clics.filter((c) => (
        c.trackingId.toLowerCase().includes(q) ||
        c.utmCampaign.toLowerCase().includes(q) ||
        (c.landingPage || '').toLowerCase().includes(q) ||
        (c.leadName || '').toLowerCase().includes(q)
      ));
    }
    return cf.filas.filter((c) => bandejaDe(c) === bandeja);
  }, [clics, cf.filas, q, bandeja]);

  const tablaRef = useResizableColumns('ventas-whatsapp-clics', ['codigo', 'fecha', 'fuente', 'campana', 'landing', 'servicio', 'contacto', 'acciones']);

  const hayFiltros = !!busqueda || cf.hayFiltros;
  const limpiar = () => { setBusqueda(''); cf.limpiar(); };

  const valorExportar = (c: ClicWhatsapp, key: string): string => {
    switch (key) {
      case 'codigo': return c.trackingId;
      case 'fecha': return fechaHora(c.clickedAt);
      case 'estado': return BANDEJA_LABEL[bandejaDe(c)];
      case 'fuente': return c.utmSource;
      case 'medio': return c.utmMedium;
      case 'contenido': return c.utmContent || '';
      case 'palabra': return c.utmTerm || '';
      case 'campana': return c.utmCampaign;
      case 'landing': return c.landingPage || '';
      case 'servicio': return servicioLegible(c.serviceName);
      case 'grupo': return c.serviceGroup || '';
      case 'gclid': return c.gclid || '';
      case 'contacto': return c.leadName || '';
      default: return '';
    }
  };

  const ayuda = BANDEJAS.find((b) => b.key === bandeja)?.ayuda;

  // «Ver posible cliente» de un clic que ya escribió: con oportunidad se busca su código en Oportunidades; sin ella se
  // busca en Posibles clientes (que limpia sus filtros, porque puede estar descartado o convertido).
  const verPosibleCliente = (c: ClicWhatsapp) =>
    navigate(c.opportunityId
      ? `/ventas/oportunidades?q=${encodeURIComponent(c.trackingId)}`
      : `/ventas/leads?q=${encodeURIComponent(c.trackingId)}`);

  const anchoTabla = 125 + 215 + 125 + 140 + 140 + 130 + 130 + 110;

  return (
    <div className="clics-wa-page">
      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input
            className="clics-wa-search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código, campaña, landing o nombre..."
            aria-label="Buscar clics de WhatsApp"
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

      <div className="clics-wa-bandejas">
        <div className="fuente-chips" role="tablist" aria-label="Bandeja de clics">
          {BANDEJAS.map((b) => (
            <button
              type="button"
              key={b.key}
              role="tab"
              aria-selected={!q && bandeja === b.key}
              className={`fuente-chip${!q && bandeja === b.key ? ' activo' : ''}`}
              onClick={() => { setBusqueda(''); setBandeja(b.key); }}
            >
              {b.label} ({cuentas[b.key]})
            </button>
          ))}
        </div>
        <span className="clics-wa-ayuda">
          {q ? 'Buscando en todos los clics, sin importar la bandeja ni los filtros de columna.' : ayuda}
        </span>
      </div>

      <ChipsFiltros cf={cf} />

      {cargando ? (
        <p className="clics-wa-vacio">Cargando...</p>
      ) : clics.length === 0 ? (
        <p className="clics-wa-vacio">Aún no hay clics. Aparecen cuando las landings tengan instalado el script (Configuración → Conexiones → WhatsApp de las landings) y alguien toque WhatsApp.</p>
      ) : (
        <div className="tasks-table-wrapper clics-wa-wrap" data-viva-en-modal="">
          <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={1} style={{ minWidth: anchoTabla }}>
            <thead>
              <tr>
                <th style={{ width: 125 }}>Código <ColumnFilter cf={cf} col="codigo" orden={cf.ordenDe('codigo')} /></th>
                <th style={{ width: 215 }}>Fecha del clic <ColumnFilter cf={cf} col="fecha" orden={cf.ordenDe('fecha')} /></th>
                <th style={{ width: 125 }}>Fuente <ColumnFilter cf={cf} col="fuente" orden={cf.ordenDe('fuente')} /></th>
                <th style={{ width: 140 }}>Campaña <ColumnFilter cf={cf} col="campana" orden={cf.ordenDe('campana')} /></th>
                <th style={{ width: 140 }}>Landing <ColumnFilter cf={cf} col="landing" orden={cf.ordenDe('landing')} /></th>
                <th style={{ width: 130 }}>Servicio <ColumnFilter cf={cf} col="servicio" orden={cf.ordenDe('servicio')} /></th>
                <th style={{ width: 130 }}>Posible cliente</th>
                <th className="col-acciones" style={{ width: 110 }}><span className="visually-hidden">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <FilaSinResultados
                  columnas={8}
                  mensaje={q ? 'Ningún clic coincide con la búsqueda.' : cf.hayFiltros ? 'No hay clics que coincidan con los filtros.' : `No hay clics en «${BANDEJA_LABEL[bandeja]}».`}
                  onLimpiar={hayFiltros ? limpiar : undefined}
                />
              )}
              {filtrados.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.trackingId}</td>
                  <td>
                    {fechaHora(c.clickedAt)}
                    <span className="clics-wa-hace">{hace(c.clickedAt)}</span>
                  </td>
                  <td>
                    <span className="clics-wa-celda" title={c.utmMedium !== 'none' ? `${c.utmSource} / ${c.utmMedium}` : c.utmSource}>
                      {c.utmSource}{c.utmMedium !== 'none' ? ` / ${c.utmMedium}` : ''}
                    </span>
                  </td>
                  <td><span className="clics-wa-celda" title={c.utmCampaign}>{c.utmCampaign}</span></td>
                  <td><span className="clics-wa-celda" title={c.landingPage || ''}>{c.landingPage || '—'}</span></td>
                  <td>{servicioLegible(c.serviceName) || '—'}</td>
                  <td><span className="clics-wa-celda" title={c.leadName || ''}>{c.leadName || '—'}</span></td>
                  <td className="col-acciones">
                    <div className="clics-wa-acciones">
                      {bandejaDe(c) === 'ESCRIBIO' ? (
                        <button type="button" className="btn-secondary icon-btn" onClick={() => verPosibleCliente(c)}
                          title="Ver posible cliente" aria-label={`Ver posible cliente del código ${c.trackingId}`}>
                          <ArrowRight size={15} />
                        </button>
                      ) : (
                        <button type="button" className="btn-secondary" onClick={() => onEscribio(c)}
                          title="Llegó su mensaje: crear el posible cliente"
                          style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <MessageCircle size={14} /> Escribió
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
  );
}
