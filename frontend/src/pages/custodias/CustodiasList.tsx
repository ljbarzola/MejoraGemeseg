import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Eye, Trash2, Plus, Pencil, Undo2 } from 'lucide-react';
import { getCustodias, deleteCustodia, updateCustodiaEstado, descargarOrdenCustodia } from '../../services/custodia.service';
import CustodiaDetalleModal from '../../components/custodias/CustodiaDetalleModal';
import CustodiaFormModal from '../../components/custodias/CustodiaFormModal';
import MarcarEstadoModal from '../../components/custodias/MarcarEstadoModal';
import ImprimirOrdenModal from '../../components/custodias/ImprimirOrdenModal';
import PageHeader from '../../components/common/PageHeader';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ErrorBanner from '../../components/common/ErrorBanner';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import ExportTableButton from '../../components/common/ExportTableButton';
import RowActionsMenu, { type RowAction } from '../../components/common/RowActionsMenu';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { usePermissions } from '../../hooks/usePermissions';

const TYPE_COLORS: Record<string, string> = { HACIENDA: '#276749', PUERTO: '#2b6cb0', VIP: '#6b46c1' };
const TYPE_LABELS: Record<string, string> = { HACIENDA: 'Hacienda', PUERTO: 'Puerto', VIP: 'VIP' };
const ESTADO_LABELS: Record<string, string> = {
  LISTO_PARA_CUSTODIAR: 'Listo para custodiar',
  EN_CAMINO: 'En camino',
  LLEGO: 'Llegó',
};
const ESTADO_COLORS: Record<string, string> = {
  LISTO_PARA_CUSTODIAR: '#b7791f',
  EN_CAMINO: '#2b6cb0',
  LLEGO: '#2f855a',
};

// Columnas que se pueden mostrar u ocultar; la guía va siempre primera y fija.
const COLUMNAS: { key: string; label: string }[] = [
  { key: 'estado', label: 'Estado' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'placa', label: 'Placa' },
  { key: 'personal', label: 'Personal' },
  { key: 'salida', label: 'Salida' },
  { key: 'llegada', label: 'Llegada' },
  { key: 'ruta', label: 'Ruta' },
  { key: 'observaciones', label: 'Observaciones' },
];
const COLUMNAS_POR_DEFECTO = ['estado', 'tipo', 'cliente', 'placa', 'personal', 'salida', 'llegada'];
const ANCHO: Record<string, number> = {
  estado: 185, tipo: 105, cliente: 130, placa: 95, personal: 165, salida: 125, llegada: 125, ruta: 260, observaciones: 240,
};
const COLUMNAS_EXPORTAR = [
  { key: 'guia', label: 'Guía' },
  { key: 'estado', label: 'Estado' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'placa', label: 'Placa' },
  { key: 'chofer', label: 'Chofer' },
  { key: 'custodio1', label: 'Custodio 1' },
  { key: 'custodio2', label: 'Custodio 2' },
  { key: 'salida', label: 'Salida' },
  { key: 'llegada', label: 'Llegada' },
  { key: 'origen', label: 'Dirección de salida' },
  { key: 'destino', label: 'Dirección de llegada' },
  { key: 'observaciones', label: 'Observaciones' },
];

/** Un aviso pensado para la persona (error 400 del servidor, p. ej. «ya tiene pagos registrados») se muestra tal cual; el resto, un mensaje general. */
function avisoDe(err: any, general: string): string {
  const m = err?.response?.data?.message;
  return err?.response?.status === 400 && typeof m === 'string' ? m : general;
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function formatFechaHora(date?: string | null) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const fechaSalida = (c: any): string => c.fechaHoraSalida || c.createdAt;
const personalTexto = (c: any) =>
  [c.choferName, c.custodio1Name, c.custodio2Name, c.choferCedula, c.custodio1Cedula, c.custodio2Cedula].filter(Boolean).join(' ');

function valorExportar(c: any, key: string): string {
  switch (key) {
    case 'guia': return c.numeroGuia;
    case 'estado': return ESTADO_LABELS[c.estado] || c.estado;
    case 'tipo': return TYPE_LABELS[c.tipoCustodia] || c.tipoCustodia;
    case 'cliente': return c.cliente || '';
    case 'placa': return c.placa || '';
    case 'chofer': return c.choferName || '';
    case 'custodio1': return c.custodio1Name || '';
    case 'custodio2': return c.custodio2Name || '';
    case 'salida': return formatFechaHora(fechaSalida(c));
    case 'llegada': return c.fechaHoraLlegada ? formatFechaHora(c.fechaHoraLlegada) : '';
    case 'origen': return c.direccionSalida || '';
    case 'destino': return c.direccionLlegada || '';
    case 'observaciones': return c.observaciones || '';
    default: return '';
  }
}

/** Qué viene después de cada estado: es la acción visible de la fila (el resto va en «⋯»). */
const SIGUIENTE: Record<string, { estado: 'EN_CAMINO' | 'LLEGO'; texto: string; ayuda: string }> = {
  LISTO_PARA_CUSTODIAR: { estado: 'EN_CAMINO', texto: 'Salió', ayuda: 'Marcar salida' },
  EN_CAMINO: { estado: 'LLEGO', texto: 'Llegó', ayuda: 'Marcar llegada' },
};

export default function CustodiasList() {
  const { canWrite } = usePermissions();
  const puedeEscribir = canWrite('CUSTODIAS');
  const [params, setParams] = useSearchParams();
  const [custodias, setCustodias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detalle, setDetalle] = useState<any>(null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<any>(null);
  const [formAbierto, setFormAbierto] = useState(false);
  const [creada, setCreada] = useState<any>(null);
  const [editando, setEditando] = useState<any>(null);
  const [confirmandoVolver, setConfirmandoVolver] = useState<any>(null);
  // «Salió»/«Llegó» abren una ventana para elegir la hora real.
  const [marcando, setMarcando] = useState<{ custodia: any; estado: 'EN_CAMINO' | 'LLEGO' } | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    // La API devuelve todos los viajes de la empresa; los filtros viven en la cabecera de cada columna.
    getCustodias()
      .then((d) => { setCustodias(d); setError(''); })
      .catch(() => setError('No se pudieron cargar los viajes. Inténtalo de nuevo.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  // Los enlaces viejos a «Nueva Custodia» (`/custodias/new`) llegan como `?nueva=1`: se abre la ventana.
  useEffect(() => {
    if (params.get('nueva') && puedeEscribir) {
      setFormAbierto(true);
      params.delete('nueva');
      setParams(params, { replace: true });
    }
  }, [params, setParams, puedeEscribir]);

  const columnPrefs = useColumnPreferences('custodias-viajes', COLUMNAS_POR_DEFECTO);
  const visibles = columnPrefs.visible.filter((k) => COLUMNAS.some((c) => c.key === k));
  const tablaRef = useResizableColumns('custodias-viajes', ['guia', ...visibles, 'acciones']);

  const cf = useColumnFilters<any>(custodias, [
    { key: 'guia', etiqueta: 'Guía', tipo: 'texto', getValue: (c) => c.numeroGuia },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: Object.keys(ESTADO_LABELS), getValues: (c) => ({ valor: c.estado, etiqueta: ESTADO_LABELS[c.estado] || c.estado }) },
    { key: 'tipo', etiqueta: 'Tipo', tipo: 'valores', orden: Object.keys(TYPE_LABELS), getValues: (c) => ({ valor: c.tipoCustodia, etiqueta: TYPE_LABELS[c.tipoCustodia] || c.tipoCustodia }) },
    { key: 'cliente', etiqueta: 'Cliente', tipo: 'valores', vacio: 'Sin cliente', getValues: (c) => c.cliente },
    { key: 'placa', etiqueta: 'Placa', tipo: 'texto', getValue: (c) => c.placa },
    // Por nombre o por cédula: reemplaza a la antigua «Consulta por cédula».
    { key: 'personal', etiqueta: 'Personal (nombre o cédula)', tipo: 'texto', getValue: personalTexto },
    { key: 'salida', etiqueta: 'Salida', tipo: 'fecha', getValue: fechaSalida },
    { key: 'llegada', etiqueta: 'Llegada', tipo: 'fecha', getValue: (c) => c.fechaHoraLlegada },
    { key: 'ruta', etiqueta: 'Ruta', tipo: 'texto', getValue: (c) => `${c.direccionSalida || ''} ${c.direccionLlegada || ''}` },
    { key: 'observaciones', etiqueta: 'Observaciones', tipo: 'texto', getValue: (c) => c.observaciones },
  ]);
  const hayFiltros = !!busqueda || cf.hayFiltros;
  const limpiarTodo = () => { setBusqueda(''); cf.limpiar(); };

  // Los filtros de columna ya se aplicaron (cf.filas); aquí solo falta el buscador general.
  const filas = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    if (!q) return cf.filas;
    return cf.filas.filter((c) =>
      sinTildes([c.numeroGuia, c.cliente, c.placa, personalTexto(c)].filter(Boolean).join(' ')).includes(q),
    );
  }, [cf.filas, busqueda]);

  async function cambiarEstado(c: any, estado: string) {
    setError('');
    try {
      await updateCustodiaEstado(c.id, estado);
      load();
    } catch (err) {
      setError(avisoDe(err, 'No se pudo cambiar el estado del viaje. Inténtalo de nuevo.'));
    }
  }

  async function confirmarEliminar() {
    if (!confirmandoEliminar) return;
    const c = confirmandoEliminar;
    setConfirmandoEliminar(null);
    setError('');
    try {
      await deleteCustodia(c.id);
      load();
    } catch (err) {
      setError(avisoDe(err, 'No se pudo eliminar el viaje. Inténtalo de nuevo.'));
    }
  }

  async function imprimir() {
    if (!creada) return;
    const c = creada;
    setCreada(null);
    setError('');
    try {
      await descargarOrdenCustodia(c.id, c.numeroGuia);
    } catch {
      setError('No se pudo generar la orden en PDF. Inténtalo de nuevo desde «⋯ → Orden en PDF».');
    }
  }

  const accionesDe = (c: any): RowAction[] => {
    const acciones: RowAction[] = [
      { label: 'Ver detalle', icon: <Eye size={14} />, onClick: () => setDetalle(c) },
      {
        label: 'Orden en PDF', icon: <FileText size={14} />,
        onClick: () => descargarOrdenCustodia(c.id, c.numeroGuia).catch(() => setError('No se pudo generar la orden en PDF. Inténtalo de nuevo.')),
      },
    ];
    if (puedeEscribir) {
      acciones.push({ label: 'Editar', icon: <Pencil size={14} />, onClick: () => setEditando(c) });
      // Un viaje solo avanza al paso siguiente (botón de la fila) o vuelve al inicio.
      if (c.estado !== 'LISTO_PARA_CUSTODIAR') {
        acciones.push({
          label: 'Volver al inicio', icon: <Undo2 size={14} />,
          // Un viaje que llegó ya cuenta como pago en Contabilidad: se pide confirmar antes de sacarlo de ahí.
          onClick: () => (c.estado === 'LLEGO' ? setConfirmandoVolver(c) : cambiarEstado(c, 'LISTO_PARA_CUSTODIAR')),
        });
      }
      acciones.push({ label: 'Eliminar', icon: <Trash2 size={14} />, danger: true, onClick: () => setConfirmandoEliminar(c) });
    }
    return acciones;
  };

  const celda = (k: string, c: any) => {
    switch (k) {
      case 'estado':
        return (
          <span className="status-badge" style={{ background: `${ESTADO_COLORS[c.estado]}1f`, color: ESTADO_COLORS[c.estado] }}>
            {ESTADO_LABELS[c.estado] || c.estado}
          </span>
        );
      case 'tipo':
        return (
          <span className="status-badge" style={{ backgroundColor: `${TYPE_COLORS[c.tipoCustodia]}20`, color: TYPE_COLORS[c.tipoCustodia] }}>
            {TYPE_LABELS[c.tipoCustodia] || c.tipoCustodia}
          </span>
        );
      case 'cliente': return <span className="truncate">{c.cliente || '—'}</span>;
      case 'placa': return <span style={{ fontFamily: 'monospace' }}>{c.placa || '—'}</span>;
      case 'personal':
        return (
          <div style={{ fontSize: '0.8rem', lineHeight: 1.35 }}>
            <div>{c.choferName} <span style={{ color: '#718096' }}>(chofer)</span></div>
            <div>{c.custodio1Name}</div>
            <div>{c.custodio2Name}</div>
          </div>
        );
      case 'salida': return <span style={{ fontSize: '0.8rem', color: '#4a5568' }}>{formatFechaHora(fechaSalida(c))}</span>;
      case 'llegada': return <span style={{ fontSize: '0.8rem', color: '#4a5568' }}>{formatFechaHora(c.fechaHoraLlegada)}</span>;
      case 'ruta': return <span style={{ fontSize: '0.8rem' }}>{c.direccionSalida || '—'} ➔ {c.direccionLlegada || '—'}</span>;
      case 'observaciones': return <span className="truncate" style={{ fontSize: '0.8rem' }}>{c.observaciones || '—'}</span>;
      default: return null;
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Operaciones · Custodias"
        title="Viajes"
        description="Todos los viajes de custodia. Cada uno pasa de «Listo para custodiar» a «En camino» y a «Llegó»; solo los que llegaron se pagan en Contabilidad."
        actions={puedeEscribir ? (
          <button className="auth-btn" onClick={() => setFormAbierto(true)}><Plus size={16} /> Nueva custodia</button>
        ) : undefined}
      />

      <ErrorBanner mensaje={error} />

      <div className="filter-bar" style={{ marginTop: 16 }}>
        <div className="filter-bar-fields">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por guía, cliente, placa o persona (nombre o cédula)..."
            style={{ flex: '1 1 200px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={COLUMNAS}
            visible={columnPrefs.visible}
            pinned={columnPrefs.pinned}
            maxPinned={columnPrefs.maxPinned}
            fixedLabel="Guía"
            onApply={(keys, fijas) => columnPrefs.set(keys, fijas)}
          />
          <ClearFiltersButton onClear={limpiarTodo} disabled={!hayFiltros} />
          <ExportTableButton
            titulo="Viajes de custodia"
            columns={COLUMNAS_EXPORTAR}
            defaultKeys={['guia', ...visibles.filter((k) => k !== 'personal' && k !== 'ruta'), 'chofer', 'custodio1', 'custodio2']}
            rows={filas}
            getValue={valorExportar}
          />
        </div>
      </div>

      <ChipsFiltros cf={cf} />

      <div className="admin-section">
        {loading && custodias.length === 0 ? (
          <div className="loading-state">Cargando viajes...</div>
        ) : custodias.length === 0 ? (
          <div className="empty-state">
            <div>Todavía no hay viajes registrados.{puedeEscribir ? ' Registra el primero con «Nueva custodia».' : ''}</div>
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
              <thead>
                <tr>
                  <th style={{ width: 120 }}>Guía <ColumnFilter cf={cf} col="guia" orden={cf.ordenDe('guia')} /></th>
                  {visibles.map((k) => (
                    <th key={k} style={{ width: ANCHO[k] }}>
                      {COLUMNAS.find((c) => c.key === k)!.label} <ColumnFilter cf={cf} col={k} orden={cf.ordenDe(k)} />
                    </th>
                  ))}
                  <th className="col-acciones col-acciones--dos"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={visibles.length + 2} mensaje="No hay viajes que coincidan con los filtros." onLimpiar={hayFiltros ? limpiarTodo : undefined} />
                )}
                {filas.map((c) => {
                  const siguiente = SIGUIENTE[c.estado];
                  return (
                    <tr key={c.id}>
                      <td>
                        <a href="#detalle" className="enlace-tabla" style={{ fontFamily: 'monospace', fontWeight: 600 }}
                          onClick={(e) => { e.preventDefault(); setDetalle(c); }}>
                          {c.numeroGuia}
                        </a>
                      </td>
                      {visibles.map((k) => <td key={k}>{celda(k, c)}</td>)}
                      <td className="col-acciones col-acciones--dos">
                        <div className="acciones-iconos" style={{ justifyContent: 'flex-end' }}>
                          {/* El siguiente paso, con una sola palabra («Salió» / «Llegó») para que se entienda sin ensanchar la columna. */}
                          {puedeEscribir && siguiente && (
                            <button
                              type="button" className="btn-secondary"
                              title={siguiente.ayuda} aria-label={siguiente.ayuda}
                              onClick={() => setMarcando({ custodia: c, estado: siguiente.estado })}
                              style={{ padding: '4px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                            >
                              {siguiente.texto}
                            </button>
                          )}
                          <RowActionsMenu actions={accionesDe(c)} />
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

      <CustodiaDetalleModal custodia={detalle} onClose={() => setDetalle(null)} />

      {(formAbierto || editando) && (
        <CustodiaFormModal
          custodia={editando ?? undefined}
          onClose={() => { setFormAbierto(false); setEditando(null); }}
          onGuardada={(c, esNueva) => {
            setFormAbierto(false);
            setEditando(null);
            if (esNueva) setCreada(c); // solo un viaje nuevo ofrece imprimir su orden
            load();
          }}
        />
      )}

      {marcando && (
        <MarcarEstadoModal
          custodia={marcando.custodia}
          estado={marcando.estado}
          onClose={() => setMarcando(null)}
          onHecho={() => { setMarcando(null); load(); }}
        />
      )}

      {confirmandoVolver && (
        <ConfirmDialog
          title="Volver al inicio"
          message={`El viaje ${confirmandoVolver.numeroGuia} ya llegó. Si vuelve a «Listo para custodiar» dejará de contarse como pago en Contabilidad hasta que vuelva a llegar. ¿Continuar?`}
          confirmLabel="Volver al inicio"
          onConfirm={() => { const c = confirmandoVolver; setConfirmandoVolver(null); cambiarEstado(c, 'LISTO_PARA_CUSTODIAR'); }}
          onCancel={() => setConfirmandoVolver(null)}
        />
      )}

      {creada && (
        <ImprimirOrdenModal numeroGuia={creada.numeroGuia} onImprimir={imprimir} onCerrar={() => setCreada(null)} />
      )}

      {confirmandoEliminar && (
        <ConfirmDialog
          title="Eliminar custodia"
          message={`¿Eliminar el viaje ${confirmandoEliminar.numeroGuia}? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}
