import { useState, useEffect } from 'react';
import { useCacaoUnidades } from '../useCacaoUnidades';
import PageHeader from '../../../components/common/PageHeader';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { useNavigate } from 'react-router-dom';
import { getLots } from '../../../services/cacao.service';
import { useTablaCacao } from '../useTablaCacao';

/** Los tres estados de un lote: con existencia, vendido por completo, o anulado (recepción registrada por error). */
const estadoLote = (status: string) =>
  status === 'OPEN' ? { label: 'Abierto', bg: '#c6f6d5', color: '#276749' }
  : status === 'VOIDED' ? { label: 'Anulado', bg: '#e2e8f0', color: '#4a5568' }
  : { label: 'Cerrado', bg: '#fed7d7', color: '#9b2c2c' };
import { ABREVIATURA_UNIDAD as UNIT_ABBR } from '../useCacaoUnidades';


export default function LotsList() {
  const { factor: factorUnidad } = useCacaoUnidades();
  const navigate = useNavigate();
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    getLots(statusFilter ? { status: statusFilter } : undefined)
      .then(setLots)
      .finally(() => setLoading(false));
  }, [statusFilter]);

  function getOrigWeight(kg: number, unit: string | null) {
    if (!unit || unit === 'KG') return null;
    // El peso del saco es el de la empresa; si aún no lo configuró no se inventa una conversión.
    const factor = factorUnidad(unit);
    if (!factor) return null;
    return { value: (kg / factor).toFixed(2), abbr: UNIT_ABBR[unit] || unit };
  }

  const unidadDe = (l: any): string | null => l.receptions?.[0]?.unitOfMeasure || null;

  const { tabla, selectorColumnas, buscador, botonExportar, limpiarBusqueda, hayBusqueda } = useTablaCacao<any>({
    clave: 'lotes',
    filas: lots,
    idFila: (l) => l.id,
    ordenInicial: 'codigo',
    direccionInicial: 'desc',
    principal: { key: 'codigo', filtro: { tipo: 'texto', getValue: (l) => l.code }, ancho: 160, label: 'Código', clase: 'tasks-table-title', orden: (l) => l.code, celda: (l) => l.code },
    columnas: [
      { key: 'calidad', filtro: { tipo: 'valores', vacio: 'Sin calidad', getValues: (l) => l.quality?.name }, ancho: 160, label: 'Calidad', orden: (l) => l.quality?.name, celda: (l) => l.quality?.name || '—' },
      {
        key: 'entrada', filtro: { tipo: 'valores', vacio: 'Sin dato', orden: ['KG', 'TON', 'SACO'], getValues: (l) => unidadDe(l) },
        label: 'Entrada',
        orden: (l) => unidadDe(l),
        celda: (l) => {
          const unit = unidadDe(l);
          if (!unit) return null;
          return (
            <span className="status-badge" style={{
              backgroundColor: unit === 'KG' ? '#f0fff4' : '#ebf8ff',
              color: unit === 'KG' ? '#276749' : '#2b6cb0',
              fontSize: '11px',
            }}>
              {unit}
            </span>
          );
        },
      },
      {
        key: 'peso', filtro: { tipo: 'numero', formato: (n) => `${n.toLocaleString()} kg`, getValue: (l) => l.netWeight }, excel: { titulo: 'Peso Neto (kg)' }, ancho: 190,
        label: 'Peso Neto',
        orden: (l) => l.netWeight,
        celda: (l) => {
          const orig = getOrigWeight(l.netWeight, unidadDe(l));
          return (
            <span style={{ fontWeight: 600 }}>
              {l.netWeight.toLocaleString()} kg
              {orig && <span style={{ fontSize: '11px', color: '#2b6cb0', marginLeft: '4px' }}>({orig.value} {orig.abbr})</span>}
            </span>
          );
        },
      },
      { key: 'costo', filtro: { tipo: 'numero', formato: (n) => `$${n.toFixed(2)}`, getValue: (l) => l.averageCost }, excel: { tipo: 'moneda', titulo: 'Costo Promedio ($/kg)' }, label: 'Costo Promedio', orden: (l) => l.averageCost, celda: (l) => `$${l.averageCost.toFixed(2)}` },
      {
        key: 'valor', filtro: { tipo: 'numero', formato: (n) => `$${n.toFixed(2)}`, getValue: (l) => l.netWeight * l.averageCost }, excel: { tipo: 'moneda', titulo: 'Valor ($)' },
        label: 'Valor',
        orden: (l) => l.netWeight * l.averageCost,
        celda: (l) => `$${(l.netWeight * l.averageCost).toFixed(2)}`,
      },
      {
        key: 'estado', filtro: { tipo: 'valores', orden: ['OPEN', 'CLOSED'], getValues: (l) => ({ valor: l.status, etiqueta: estadoLote(l.status).label }) }, excel: { valor: (l) => estadoLote(l.status).label }, ancho: 110,
        label: 'Estado',
        orden: (l) => l.status,
        celda: (l) => (
          <span
            className="status-badge"
            style={{
              backgroundColor: estadoLote(l.status).bg,
              color: estadoLote(l.status).color,
            }}
          >
            {estadoLote(l.status).label}
          </span>
        ),
      },
    ],
    acciones: (l) => <button className="btn-sm-edit btn-sm-edit--texto" onClick={() => navigate(`/cacao/lots/${l.id}`)}>Ver Kardex</button>,
  });

  return (
    <div className="page-container">
      <PageHeader eyebrow="Cacao" title="Lotes" description="El inventario de cacao: cada recepción forma un lote que viaja hasta su embarque." />

      <div className="filter-bar">
        <div className="filter-bar-fields">
          {buscador}
          <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos</option>
            <option value="OPEN">Abierto</option>
            <option value="CLOSED">Cerrado</option>
            <option value="VOIDED">Anulado</option>
          </select>
        </div>
        <div className="filter-bar-actions">
          {selectorColumnas}
          {botonExportar}
          <ClearFiltersButton onClear={() => { setStatusFilter(''); limpiarBusqueda(); }} disabled={!statusFilter && !hayBusqueda} />
        </div>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando lotes...</div>
        ) : lots.length === 0 ? (
          <div className="empty-state">Todavía no hay lotes. Se crean solos cuando registras una recepción.</div>
        ) : (
          tabla
        )}
      </div>
    </div>
  );
}
