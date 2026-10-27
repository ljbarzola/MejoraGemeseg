import { useState, useEffect } from 'react';
import { useCacaoUnidades } from '../useCacaoUnidades';
import PageHeader from '../../../components/common/PageHeader';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { useNavigate } from 'react-router-dom';
import { getLots } from '../../../services/cacao.service';
import { useTablaCacao } from '../useTablaCacao';

const UNIT_ABBR: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos' };

export default function LotsList() {
  const { factor: factorUnidad } = useCacaoUnidades();
  const navigate = useNavigate();
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLots().then(setLots).finally(() => setLoading(false));
  }, []);

  // El estado ya no se pide al servidor: la API devuelve todos los lotes y se filtra en la cabecera de la columna.
  const cf = useColumnFilters<any>(lots, [
    { key: 'codigo', etiqueta: 'Código', tipo: 'texto', getValue: (l) => l.code },
    { key: 'calidad', etiqueta: 'Calidad', tipo: 'valores', vacio: 'Sin calidad', getValues: (l) => l.quality?.name },
    { key: 'entrada', etiqueta: 'Entrada', tipo: 'valores', vacio: 'Sin dato', orden: ['KG', 'TON', 'SACO'], getValues: (l) => l.receptions?.[0]?.unitOfMeasure },
    { key: 'neto', etiqueta: 'Peso Neto', tipo: 'numero', formato: (n) => `${n.toLocaleString()} kg`, getValue: (l) => l.netWeight },
    { key: 'costo', etiqueta: 'Costo Promedio', tipo: 'numero', formato: (n) => `$${n.toFixed(2)}`, getValue: (l) => l.averageCost },
    { key: 'valor', etiqueta: 'Valor', tipo: 'numero', formato: (n) => `$${n.toFixed(2)}`, getValue: (l) => l.netWeight * l.averageCost },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ['OPEN', 'CLOSED'], getValues: (l) => ({ valor: l.status, etiqueta: l.status === 'OPEN' ? 'Abierto' : 'Cerrado' }) },
  ]);
  const filas = cf.filas;

  function getOrigWeight(kg: number, unit: string | null) {
    if (!unit || unit === 'KG') return null;
    // El peso del saco es el de la empresa; si aún no lo configuró no se inventa una conversión.
    const factor = factorUnidad(unit);
    if (!factor) return null;
    return { value: (kg / factor).toFixed(2), abbr: UNIT_ABBR[unit] || unit };
  }

  const unidadDe = (l: any): string | null => l.receptions?.[0]?.unitOfMeasure || null;

  const { tabla, selectorColumnas } = useTablaCacao<any>({
    clave: 'lotes',
    filas: lots,
    idFila: (l) => l.id,
    ordenInicial: 'codigo',
    direccionInicial: 'desc',
    principal: { key: 'codigo', ancho: 160, label: 'Código', clase: 'tasks-table-title', orden: (l) => l.code, celda: (l) => l.code },
    columnas: [
      { key: 'calidad', ancho: 160, label: 'Calidad', orden: (l) => l.quality?.name, celda: (l) => l.quality?.name || '—' },
      {
        key: 'entrada',
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
        key: 'peso', ancho: 190,
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
      { key: 'costo', label: 'Costo Promedio', orden: (l) => l.averageCost, celda: (l) => `$${l.averageCost.toFixed(2)}` },
      {
        key: 'valor',
        label: 'Valor',
        orden: (l) => l.netWeight * l.averageCost,
        celda: (l) => `$${(l.netWeight * l.averageCost).toFixed(2)}`,
      },
      {
        key: 'estado', ancho: 110,
        label: 'Estado',
        orden: (l) => l.status,
        celda: (l) => (
          <span
            className="status-badge"
            style={{
              backgroundColor: l.status === 'OPEN' ? '#c6f6d5' : '#fed7d7',
              color: l.status === 'OPEN' ? '#276749' : '#9b2c2c',
            }}
          >
            {l.status === 'OPEN' ? 'Abierto' : 'Cerrado'}
          </span>
        ),
      },
    ],
    acciones: (l) => <button className="btn-sm-edit" onClick={() => navigate(`/cacao/lots/${l.id}`)}>Ver Kardex</button>,
  });

  return (
    <div className="page-container">
      <PageHeader eyebrow="Cacao" title="Lotes" description="El inventario de cacao: cada recepción forma un lote que viaja hasta su embarque." />

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos</option>
            <option value="OPEN">Abierto</option>
            <option value="CLOSED">Cerrado</option>
          </select>
        </div>
        <div className="filter-bar-actions">
          {selectorColumnas}
          <ClearFiltersButton onClear={() => setStatusFilter('')} disabled={!statusFilter} />
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
        </div>
      </div>

      <ChipsFiltros cf={cf} />

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando lotes...</div>
        ) : lots.length === 0 ? (
          <div className="empty-state">No hay lotes registrados.</div>
        ) : (
          tabla
        )}
      </div>
    </div>
  );
}
