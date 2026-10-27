import { useState, useEffect } from 'react';
import { useCacaoUnidades } from '../useCacaoUnidades';
import PageHeader from '../../../components/common/PageHeader';
import { useNavigate } from 'react-router-dom';
import { getReceptions } from '../../../services/cacao.service';
import { formatDateEc } from '../utils';
import { useTablaCacao } from '../useTablaCacao';

const UNIT_ABBR: Record<string, string> = { TON: 'T', KG: 'kg', SACO: 'sacos' };

/** Cuánto de la entrega ya se le liquidó al proveedor: lo liquidado (sin contar rechazos ni anulaciones) frente al peso neto recibido. */
function estadoLiquidacionEntrega(r: { netWeight: number; liquidadoKg?: number }) {
  const liquidado = r.liquidadoKg || 0;
  // Misma tolerancia de redondeo que usa el servidor al topar la liquidación.
  if (liquidado <= 0.001) return { orden: 0, label: 'Sin liquidar', bg: '#fefcbf', color: '#975a16' };
  if (liquidado < r.netWeight - 0.001) return { orden: 1, label: 'Parcial', bg: '#bee3f8', color: '#2b6cb0' };
  return { orden: 2, label: 'Liquidada', bg: '#c6f6d5', color: '#276749' };
}

export default function ReceptionsList() {
  const { factor: factorUnidad } = useCacaoUnidades();
  const navigate = useNavigate();
  const [receptions, setReceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReceptions().then(setReceptions).finally(() => setLoading(false));
  }, []);

  // Filtros en la cabecera de cada columna (se aplican a las filas ya cargadas).
  const kg = (n: number) => `${n.toLocaleString()} kg`;
  const cf = useColumnFilters<any>(receptions, [
    { key: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', soloDia: true, getValue: (r) => r.date },
    { key: 'proveedor', etiqueta: 'Proveedor', tipo: 'valores', vacio: 'Sin proveedor', getValues: (r) => (r.supplier?.name ? { valor: String(r.supplier.id ?? r.supplier.name), etiqueta: r.supplier.name } : null) },
    { key: 'guia', etiqueta: 'Guía', tipo: 'texto', getValue: (r) => r.guideNumber },
    { key: 'entrada', etiqueta: 'Entrada', tipo: 'valores', orden: ['KG', 'TON', 'SACO'], getValues: (r) => r.unitOfMeasure || 'KG' },
    { key: 'bruto', etiqueta: 'Peso Bruto', tipo: 'numero', formato: kg, getValue: (r) => r.grossWeight },
    { key: 'tara', etiqueta: 'Tara', tipo: 'numero', formato: kg, getValue: (r) => r.tare },
    { key: 'neto', etiqueta: 'Peso Neto', tipo: 'numero', formato: kg, getValue: (r) => r.netWeight },
    { key: 'humedad', etiqueta: 'Humedad %', tipo: 'numero', formato: (n) => `${n}%`, getValue: (r) => r.humidity },
    { key: 'impurezas', etiqueta: 'Impurezas %', tipo: 'numero', formato: (n) => `${n}%`, getValue: (r) => r.impurities },
    { key: 'precio', etiqueta: 'Precio Prov.', tipo: 'numero', formato: (n) => `$${n.toFixed(2)}`, getValue: (r) => r.provisionalPrice },
    { key: 'lote', etiqueta: 'Lote', tipo: 'valores', vacio: 'Sin lote', getValues: (r) => r.lot?.code },
  ]);
  const filas = cf.filas;

  function getOrigWeight(kg: number, unit: string | null) {
    if (!unit || unit === 'KG') return null;
    // El peso del saco es el de la empresa; si aún no lo configuró no se inventa una conversión.
    const factor = factorUnidad(unit);
    if (!factor) return null;
    return { value: (kg / factor).toFixed(2), abbr: UNIT_ABBR[unit] || unit };
  }

  const pesoConUnidad = (kg: number, unit: string | null, color: string, negrita?: boolean) => {
    const orig = getOrigWeight(kg, unit);
    return (
      <span style={negrita ? { fontWeight: 700 } : undefined}>
        {kg.toLocaleString()} kg
        {orig && <span style={{ fontSize: '11px', color, fontWeight: negrita ? 600 : undefined, marginLeft: '4px' }}>({orig.value} {orig.abbr})</span>}
      </span>
    );
  };

  const { tabla, selectorColumnas } = useTablaCacao<any>({
    clave: 'recepciones',
    filas: receptions,
    idFila: (r) => r.id,
    ordenInicial: 'fecha',
    direccionInicial: 'desc',
    principal: { key: 'fecha', ancho: 100, label: 'Fecha', orden: (r) => new Date(r.date).getTime(), celda: (r) => formatDateEc(r.date) },
    columnas: [
      { key: 'proveedor', ancho: 200, label: 'Proveedor', orden: (r) => r.supplier?.name, celda: (r) => r.supplier?.name || '—' },
      { key: 'guia', ancho: 130, label: 'Guía', orden: (r) => r.guideNumber, celda: (r) => r.guideNumber },
      {
        key: 'entrada',
        label: 'Entrada',
        orden: (r) => r.unitOfMeasure || 'KG',
        celda: (r) => (
          <span className="status-badge" style={{
            backgroundColor: r.unitOfMeasure === 'KG' ? '#f0fff4' : '#ebf8ff',
            color: r.unitOfMeasure === 'KG' ? '#276749' : '#2b6cb0',
            fontSize: '11px',
          }}>
            {r.unitOfMeasure || 'KG'}
          </span>
        ),
      },
      { key: 'bruto', ancho: 170, label: 'Peso Bruto', orden: (r) => r.grossWeight, celda: (r) => pesoConUnidad(r.grossWeight, r.unitOfMeasure, '#718096') },
      { key: 'tara', ancho: 150, label: 'Tara', orden: (r) => r.tare, celda: (r) => pesoConUnidad(r.tare, r.unitOfMeasure, '#718096') },
      { key: 'neto', ancho: 170, label: 'Peso Neto', orden: (r) => r.netWeight, celda: (r) => pesoConUnidad(r.netWeight, r.unitOfMeasure, '#2b6cb0', true) },
      { key: 'humedad', label: 'Humedad %', orden: (r) => r.humidity, celda: (r) => `${r.humidity}%` },
      { key: 'impurezas', label: 'Impurezas %', orden: (r) => r.impurities, celda: (r) => `${r.impurities}%` },
      { key: 'precio', label: 'Precio Prov.', orden: (r) => r.provisionalPrice, celda: (r) => `$${r.provisionalPrice.toFixed(2)}` },
      {
        key: 'lote', ancho: 150,
        label: 'Lote',
        orden: (r) => r.lot?.code,
        celda: (r) =>
          r.lot ? (
            <span className="status-badge" style={{ backgroundColor: '#ebf8ff', color: '#2b6cb0' }}>{r.lot.code}</span>
          ) : '—',
      },
      {
        key: 'liquidacion', ancho: 130,
        label: 'Liquidación',
        orden: (r) => estadoLiquidacionEntrega(r).orden,
        celda: (r) => {
          const e = estadoLiquidacionEntrega(r);
          return (
            <span className="status-badge" style={{ backgroundColor: e.bg, color: e.color }}
              title={`Liquidado ${(r.liquidadoKg || 0).toLocaleString()} de ${r.netWeight.toLocaleString()} kg`}>
              {e.label}
            </span>
          );
        },
      },
    ],
  });

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Cacao"
        title="Recepciones"
        description="Cada entrega de cacao que recibes. Al guardarla se crea su lote y entra al inventario."
        actions={
          <>
            <button className="auth-btn" onClick={() => navigate('/cacao/receptions/new')}>+ Nueva Recepción</button>
          </>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-fields" />
        <div className="filter-bar-actions">{selectorColumnas}</div>
      </div>

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando recepciones...</div>
        ) : receptions.length === 0 ? (
          <div className="empty-state">No hay recepciones registradas.</div>
        ) : (
          tabla
        )}
      </div>
    </div>
  );
}
