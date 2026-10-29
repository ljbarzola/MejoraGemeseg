import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCustodias, deleteCustodia } from '../../services/custodia.service';
import EstadoSelect from '../../components/custodias/EstadoSelect';
import CustodiaDetalleModal from '../../components/custodias/CustodiaDetalleModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import { useColumnFilters } from '../../hooks/useColumnFilters';

const TYPE_COLORS: Record<string, string> = {
  HACIENDA: '#276749',
  PUERTO: '#2b6cb0',
  VIP: '#6b46c1',
};

const TYPE_LABELS: Record<string, string> = {
  HACIENDA: 'Hacienda',
  PUERTO: 'Puerto',
  VIP: 'VIP',
};

const ESTADO_LABELS: Record<string, string> = {
  LISTO_PARA_CUSTODIAR: 'Listo para custodiar',
  EN_CAMINO: 'En camino',
  LLEGO: 'Llegó',
};

function formatFecha(date: string) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatFechaHora(date: string) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function CustodiasList() {
  const navigate = useNavigate();
  const [custodias, setCustodias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState<any>(null);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    // La API devuelve todas las custodias de la empresa; los filtros viven en la cabecera de cada columna.
    getCustodias().then(setCustodias).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const cf = useColumnFilters<any>(custodias, [
    { key: 'guia', etiqueta: 'Guía', tipo: 'texto', getValue: (c) => c.numeroGuia },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: Object.keys(ESTADO_LABELS), getValues: (c) => ({ valor: c.estado, etiqueta: ESTADO_LABELS[c.estado] || c.estado }) },
    { key: 'tipo', etiqueta: 'Tipo', tipo: 'valores', orden: Object.keys(TYPE_LABELS), getValues: (c) => ({ valor: c.tipoCustodia, etiqueta: TYPE_LABELS[c.tipoCustodia] || c.tipoCustodia }) },
    { key: 'cliente', etiqueta: 'Cliente', tipo: 'valores', vacio: 'Sin cliente', getValues: (c) => c.cliente },
    { key: 'placa', etiqueta: 'Placa', tipo: 'texto', getValue: (c) => c.placa },
    { key: 'personal', etiqueta: 'Personal', tipo: 'texto', getValue: (c) => [c.choferName, c.custodio1Name, c.custodio2Name].filter(Boolean).join(' ') },
    // Es la fecha que muestra la columna: la de salida y, si no tiene, la de registro.
    { key: 'horario', etiqueta: 'Horario', tipo: 'fecha', getValue: (c) => c.fechaHoraSalida || c.createdAt },
  ]);
  const filas = cf.filas;

  function handleDelete(id: number) {
    setConfirmandoEliminar(id);
  }

  async function confirmarEliminar() {
    if (confirmandoEliminar === null) return;
    const id = confirmandoEliminar;
    setConfirmandoEliminar(null);
    await deleteCustodia(id);
    load();
  }

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div>
            <p className="page-eyebrow">CUSTODIAS</p>
            <h1>Custodias</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => navigate('/custodias/new')}>+ Nueva Custodia</button>
      </div>

      <div className="admin-section">
        <div className="filter-bar">
          <div className="filter-bar-actions">
            <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
          </div>
        </div>

        <ChipsFiltros cf={cf} />

        {loading ? (
          <div className="loading-state">Cargando custodias...</div>
        ) : custodias.length === 0 ? (
          <div className="empty-state">No hay custodias registradas.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Guía<ColumnFilter cf={cf} col="guia" orden={cf.ordenDe('guia')} /></th>
                  <th>Estado<ColumnFilter cf={cf} col="estado" orden={cf.ordenDe('estado')} /></th>
                  <th>Tipo<ColumnFilter cf={cf} col="tipo" orden={cf.ordenDe('tipo')} /></th>
                  <th>Cliente<ColumnFilter cf={cf} col="cliente" orden={cf.ordenDe('cliente')} /></th>
                  <th>Placa<ColumnFilter cf={cf} col="placa" orden={cf.ordenDe('placa')} /></th>
                  <th>Personal<ColumnFilter cf={cf} col="personal" orden={cf.ordenDe('personal')} /></th>
                  <th>Horario<ColumnFilter cf={cf} col="horario" orden={cf.ordenDe('horario')} /></th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={8} mensaje="No hay custodias que coincidan con los filtros." onLimpiar={cf.limpiar} />
                )}
                {filas.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#2b6cb0' }}>{c.numeroGuia}</td>
                    <td>
                      <EstadoSelect custodiaId={c.id} estadoActual={c.estado} onUpdated={load} />
                    </td>
                    <td>
                      <span className="status-badge" style={{
                        backgroundColor: TYPE_COLORS[c.tipoCustodia] + '20',
                        color: TYPE_COLORS[c.tipoCustodia],
                      }}>
                        {TYPE_LABELS[c.tipoCustodia] || c.tipoCustodia}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{c.cliente || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{c.placa || '—'}</td>
                    <td style={{ fontSize: '0.8rem' }}>
                      <div>{c.choferName}</div>
                      <div>{c.custodio1Name}</div>
                      <div>{c.custodio2Name}</div>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: '#718096' }}>
                      {c.fechaHoraSalida && <div>S: {formatFechaHora(c.fechaHoraSalida)}</div>}
                      {c.fechaHoraLlegada && <div>L: {formatFechaHora(c.fechaHoraLlegada)}</div>}
                      {!c.fechaHoraSalida && <div>{formatFecha(c.createdAt)}</div>}
                    </td>
                    <td className="no-print">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <button onClick={() => setDetalle(c)} style={{ fontSize: '0.78rem', color: '#1e3a5f', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          Ver Detalle
                        </button>
                        <button onClick={() => handleDelete(c.id)} style={{ fontSize: '0.78rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          Eliminar
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

      <CustodiaDetalleModal custodia={detalle} onClose={() => setDetalle(null)} />

      {confirmandoEliminar !== null && (
        <ConfirmDialog
          title="Eliminar custodia"
          message="¿Eliminar esta custodia?"
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}
