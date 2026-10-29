import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboard, getDashboardCompras } from '../../services/cacao.service';
import PageHeader from '../../components/common/PageHeader';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import {
  Tarjeta, KpiFila, Contador, BarraH, SinDatos, dinero, iso,
} from '../../components/ventas/dashboard/DashboardBits';
import { AreaGrafico } from '../../components/ventas/dashboard/DashboardGraficos';
import { useTablaCacao } from './useTablaCacao';

// El dashboard de Ventas pasó a un periodo único con calendario; el de Compras de Cacao conserva su selector de
// «últimos N días» (se movió aquí desde DashboardBits, donde ya no lo usa nadie más).
const PERIODOS = [
  { dias: 30, label: 'Últimos 30 días' },
  { dias: 90, label: 'Últimos 90 días' },
  { dias: 180, label: 'Últimos 6 meses' },
  { dias: 365, label: 'Último año' },
];

/** Últimos N días contando hoy, en hora local de quien mira. */
function periodoDesdeDias(dias: number): { desde: string; hasta: string } {
  const hoy = new Date();
  const ini = new Date(hoy);
  ini.setDate(hoy.getDate() - (dias - 1));
  return { desde: iso(ini), hasta: iso(hoy) };
}

function SelectorPeriodo({ dias, onChange }: { dias: number; onChange: (d: number) => void }) {
  return (
    <select className="filter-select" value={dias} onChange={(e) => onChange(Number(e.target.value))} aria-label="Periodo">
      {PERIODOS.map((p) => <option key={p.dias} value={p.dias}>{p.label}</option>)}
    </select>
  );
}

// Los pasos opcionales se muestran, pero no mantienen la guía a la vista: solo los obligatorios la hacen aparecer.
const PASOS_INICIALES: Array<{ clave: 'calidades' | 'saco' | 'puntos' | 'proveedores' | 'recepciones'; titulo: string; texto: string; ruta: string; opcional?: boolean }> = [
  { clave: 'calidades', titulo: 'Crea tus calidades de cacao', texto: 'Define cuánto se descuenta por humedad e impurezas en cada calidad.', ruta: '/cacao/configuracion?tab=calidades' },
  { clave: 'proveedores', titulo: 'Registra a tus proveedores', texto: 'Las personas y empresas a las que les compras cacao.', ruta: '/cacao/suppliers' },
  { clave: 'recepciones', titulo: 'Registra tu primera recepción', texto: 'Al guardarla se crea su lote y entra al inventario.', ruta: '/cacao/receptions/new' },
  { clave: 'saco', titulo: 'Configura el peso de tu saco', texto: 'Solo si compras o vendes en sacos; las toneladas, los quintales y los kilos no lo necesitan.', ruta: '/cacao/configuracion?tab=unidades', opcional: true },
  { clave: 'puntos', titulo: 'Crea tus puntos de acopio', texto: 'Solo si recibes cacao en varias sucursales; así cada recepción dice dónde se recibió.', ruta: '/cacao/configuracion?tab=puntos', opcional: true },
];

interface ProveedorCompra {
  supplierId: number; nombre: string; entregas: number; pesoNetoKg: number; pesoNetoQq: number;
  compra: number; precioPromedioQq: number | null; pctCompra: number; sinLiquidar: number;
}
interface Compras {
  desde: string; hasta: string; agrupadoPor: 'dia' | 'semana';
  totales: {
    entregas: number; pesoNetoKg: number; pesoNetoQq: number; compra: number;
    precioPromedioQq: number | null; precioPromedioKg: number | null;
    sinLiquidar: number; sinLiquidarPct: number; parciales: number; liquidadas: number; cerradas: number;
  };
  porProveedor: ProveedorCompra[];
  porCalidad: { nombre: string; pesoNetoKg: number; pesoNetoQq: number; compra: number; pctCompra: number }[];
  precioPorPeriodo: { clave: string; pesoNetoKg: number; precioQq: number | null }[];
}

const numero = (n: number, decimales = 0) => n.toLocaleString('en-US', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
const fmtKg = (n: number) => `${numero(n)} kg`;
const etiquetaDia = (clave: string) => clave.slice(0, 10).split('-').reverse().slice(0, 2).join('/');

export default function CacaoDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const [compras, setCompras] = useState<Compras | null>(null);
  const [errorCompras, setErrorCompras] = useState(false);

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const cargarCompras = useCallback(() => {
    const { desde, hasta } = periodoDesdeDias(dias);
    setErrorCompras(false);
    getDashboardCompras(desde, hasta).then(setCompras).catch(() => setErrorCompras(true));
  }, [dias]);

  useEffect(() => { cargarCompras(); }, [cargarCompras]);

  if (loading) return <div className="loading-state">Cargando dashboard...</div>;

  const setup = data?.setup;
  const pasosPendientes = setup ? PASOS_INICIALES.filter((p) => !p.opcional && !setup[p.clave]) : [];
  const porAprobar = data?.pendingApprovalCount || 0;

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Cacao"
        title="Dashboard"
        description="Cómo va tu negocio de cacao: inventario, precios por fijar, lo que debes y te deben, y lo que compraste."
        actions={<button className="btn-secondary" onClick={() => navigate('/cacao/guia')}>Cómo funciona</button>}
      />

      {pasosPendientes.length > 0 && (
        <div style={{ marginBottom: '16px', padding: '18px 20px', background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: '10px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#2c5282', margin: '0 0 4px' }}>Primeros pasos</h2>
          <p style={{ fontSize: '13px', color: '#4a5568', margin: '0 0 12px' }}>
            Antes de registrar tu primera compra, deja listo lo propio de tu empresa. Esta guía desaparece cuando completes los tres primeros pasos; los marcados «opcional» son solo si te aplican.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '10px' }}>
            {PASOS_INICIALES.map((p, i) => {
              const hecho = !!setup?.[p.clave];
              return (
                <button
                  key={p.clave}
                  onClick={() => navigate(p.ruta)}
                  style={{ textAlign: 'left', padding: '12px 14px', background: hecho ? '#f0fff4' : 'white', border: `1px solid ${hecho ? '#c6f6d5' : '#bee3f8'}`, borderRadius: '8px', cursor: 'pointer' }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: hecho ? '#276749' : '#2d3748' }}>
                    {hecho ? '✓' : p.opcional ? '•' : `${i + 1}.`} {p.titulo}{p.opcional && !hecho ? ' (opcional)' : ''}
                  </div>
                  <div style={{ fontSize: '12px', color: '#718096', marginTop: '4px', lineHeight: 1.4 }}>{p.texto}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="dash-pila">
        {/* Dónde está hoy el negocio */}
        <KpiFila className="dash-kpis--cuatro">
          <Contador titulo="Valor inventario" valor={dinero(data?.inventoryValue || 0)} color="#2b6cb0" detalle={fmtKg(data?.totalInventoryKg || 0)} onClick={() => navigate('/cacao/lots')} />
          <Contador titulo="Exposición sin fijar" valor={dinero(data?.openFixingValue || 0)} color="#b7791f" detalle={`${fmtKg(data?.openFixingKg || 0)} pendientes`} onClick={() => navigate('/cacao/price-fixings')} />
          <Contador titulo="Liquidaciones por aprobar" valor={dinero(data?.pendingApprovalAmount || 0)} color="#6b46c1" detalle={porAprobar ? `${porAprobar} ${porAprobar === 1 ? 'liquidación' : 'liquidaciones'}` : 'Ninguna pendiente'} onClick={() => navigate('/cacao/settlements')} />
          <Contador titulo="CxP pendiente" valor={dinero(data?.totalPayables || 0)} color="#e53e3e" detalle={data?.payableCount ? `${data.payableCount} cuentas` : 'Saldo'} onClick={() => navigate('/cacao/payables')} />
          <Contador titulo="CxC pendiente" valor={dinero(data?.totalReceivables || 0)} color="#38a169" detalle={data?.receivableCount ? `${data.receivableCount} cuentas` : 'Saldo'} onClick={() => navigate('/cacao/receivables')} />
        </KpiFila>

        {/* Lo que se compró en el periodo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#4a5568', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Compras</h2>
          <SelectorPeriodo dias={dias} onChange={setDias} />
        </div>

        {errorCompras ? (
          <div className="admin-section">
            <p style={{ margin: 0, color: '#718096' }}>No se pudieron cargar las compras.</p>
            <button type="button" className="btn-secondary" onClick={cargarCompras} style={{ marginTop: 10, padding: '8px 16px', fontSize: '0.9rem' }}>Reintentar</button>
          </div>
        ) : !compras ? (
          <div className="loading-state">Cargando compras...</div>
        ) : (
          <ComprasDelPeriodo compras={compras} dias={dias} />
        )}

        {/* Últimos embarques */}
        <Tarjeta
          titulo="Últimos embarques"
          hint="Los cinco más recientes."
          accion={<button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => navigate('/cacao/shipments')}>Ver todos</button>}
        >
          {!data?.recentShipments?.length ? (
            <SinDatos texto="No hay embarques recientes." />
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Referencia</th>
                    <th>Peso Total</th>
                    <th>Precio Venta</th>
                    <th>Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentShipments.map((s: any) => (
                    <tr key={s.id}>
                      <td>{new Date(s.date).toLocaleDateString('es-EC', { timeZone: 'UTC' })}</td>
                      <td>{s.client?.name || '—'}</td>
                      <td>{s.contractRef}</td>
                      <td>{fmtKg(s.totalWeightKg ?? s.totalWeight)}</td>
                      <td>{dinero(s.salePrice)}/kg</td>
                      <td style={{ color: s.margin >= 0 ? '#38a169' : '#e53e3e', fontWeight: 600 }}>{s.margin}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}

function ComprasDelPeriodo({ compras, dias }: { compras: Compras; dias: number }) {
  const navigate = useNavigate();
  const t = compras.totales;
  const top5 = compras.porProveedor.slice(0, 5);
  const maxProveedor = Math.max(0, ...top5.map((p) => p.compra));
  const maxCalidad = Math.max(0, ...compras.porCalidad.map((c) => c.compra));
  const puntosPrecio = compras.precioPorPeriodo
    .filter((p) => p.precioQq !== null)
    .map((p) => ({ etiqueta: etiquetaDia(p.clave), valor: p.precioQq as number }));
  const periodo = dias === 365 ? 'último año' : dias === 180 ? 'últimos 6 meses' : `últimos ${dias} días`;

  if (t.entregas === 0) {
    return (
      <Tarjeta titulo="Sin compras en este periodo" hint={`No hay recepciones en los ${periodo}.`}>
        <SinDatos texto="Cuando registres recepciones, aquí verás cuánto compraste, a quién y a qué precio por quintal." />
      </Tarjeta>
    );
  }

  return (
    <>
      <KpiFila className="dash-kpis--cuatro">
        <Contador titulo="Peso neto comprado" valor={`${numero(t.pesoNetoQq, 2)} qq`} color="#2b6cb0" detalle={fmtKg(t.pesoNetoKg)} onClick={() => navigate('/cacao/receptions')} />
        <Contador titulo="Compra total" valor={dinero(t.compra)} color="#1a365d" detalle={`A costo de lote · ${periodo}`} />
        <Contador titulo="Precio promedio por quintal" valor={t.precioPromedioQq === null ? '—' : dinero(t.precioPromedioQq)} color="#b7791f" detalle={t.precioPromedioKg === null ? undefined : `${dinero(t.precioPromedioKg)} por kg`} />
        <Contador titulo="Entregas" valor={numero(t.entregas)} color="#2f855a" detalle={`${t.liquidadas} liquidadas · ${t.parciales} parciales`} onClick={() => navigate('/cacao/receptions')} />
        <Contador titulo="Sin liquidar" valor={numero(t.sinLiquidar)} color={t.sinLiquidar > 0 ? '#c05621' : '#276749'} detalle={`${t.sinLiquidarPct}% de las entregas`} onClick={() => navigate('/cacao/receptions')} />
        <Contador titulo="Cerradas sin liquidar" valor={numero(t.cerradas)} color="#718096" detalle="No se le pagan al proveedor" onClick={() => navigate('/cacao/receptions')} />
      </KpiFila>

      <div className="dash-grid">
        <Tarjeta titulo="Top 5 proveedores" hint="Por lo comprado en el periodo.">
          {top5.map((p) => (
            <BarraH key={p.supplierId} etiqueta={p.nombre} valor={p.compra} max={maxProveedor} color="#2b6cb0" detalle={`${dinero(p.compra)} · ${p.pctCompra}%`} />
          ))}
        </Tarjeta>

        <Tarjeta titulo="Compra por calidad" hint="Cuánto se compró de cada calidad.">
          {compras.porCalidad.map((c) => (
            <BarraH key={c.nombre} etiqueta={c.nombre} valor={c.compra} max={maxCalidad} color="#2f855a" detalle={`${dinero(c.compra)} · ${numero(c.pesoNetoQq, 2)} qq`} />
          ))}
        </Tarjeta>

        <Tarjeta
          titulo="Precio promedio por quintal"
          hint={compras.agrupadoPor === 'semana' ? 'Dólares por quintal, por semana.' : 'Dólares por quintal, por día.'}
        >
          {puntosPrecio.length === 0 ? (
            <SinDatos texto="Aún no hay precios para graficar." />
          ) : (
            <AreaGrafico puntos={puntosPrecio} color="#b7791f" aria="Precio promedio por quintal en el tiempo" />
          )}
        </Tarjeta>
      </div>

      <Tarjeta titulo="Detalle por proveedor" hint="Lo que compraste a cada proveedor. Puedes buscar, ordenar y descargarlo en Excel.">
        <DetalleProveedores filas={compras.porProveedor} />
      </Tarjeta>
    </>
  );
}

function DetalleProveedores({ filas }: { filas: ProveedorCompra[] }) {
  const { tabla, selectorColumnas, buscador, botonExportar, limpiarBusqueda, hayBusqueda } = useTablaCacao<ProveedorCompra>({
    clave: 'dashboard-proveedores',
    filas,
    idFila: (p) => p.supplierId,
    ordenInicial: 'compra',
    direccionInicial: 'desc',
    principal: { key: 'proveedor', ancho: 220, label: 'Proveedor', clase: 'tasks-table-title', orden: (p) => p.nombre, celda: (p) => p.nombre },
    columnas: [
      { key: 'entregas', label: 'Entregas', derecha: true, orden: (p) => p.entregas, celda: (p) => numero(p.entregas) },
      { key: 'peso', ancho: 150, label: 'Peso neto', derecha: true, orden: (p) => p.pesoNetoKg, excel: { titulo: 'Peso neto (kg)' }, celda: (p) => fmtKg(p.pesoNetoKg) },
      { key: 'quintales', ancho: 130, label: 'Quintales', derecha: true, orden: (p) => p.pesoNetoQq, excel: { titulo: 'Quintales (qq)' }, celda: (p) => numero(p.pesoNetoQq, 2) },
      { key: 'compra', ancho: 140, label: 'Compra', derecha: true, orden: (p) => p.compra, excel: { tipo: 'moneda', titulo: 'Compra ($)' }, celda: (p) => dinero(p.compra) },
      { key: 'precio', ancho: 150, label: 'Precio por qq', derecha: true, orden: (p) => p.precioPromedioQq, excel: { tipo: 'moneda', titulo: 'Precio promedio por qq ($)' }, celda: (p) => (p.precioPromedioQq === null ? '—' : dinero(p.precioPromedioQq)) },
      { key: 'pct', label: '% compra', derecha: true, orden: (p) => p.pctCompra, excel: { tipo: 'porcentaje', titulo: '% de la compra' }, celda: (p) => `${p.pctCompra}%` },
      { key: 'sinliquidar', ancho: 130, label: 'Sin liquidar', derecha: true, orden: (p) => p.sinLiquidar, celda: (p) => numero(p.sinLiquidar) },
    ],
  });

  const barra = (
    <div className="filter-bar">
      <div className="filter-bar-fields">{buscador}</div>
      <div className="filter-bar-actions">
        {selectorColumnas}
        {botonExportar}
        <ClearFiltersButton onClear={limpiarBusqueda} disabled={!hayBusqueda} />
      </div>
    </div>
  );

  return (
    <>
      {barra}
      {tabla}
    </>
  );
}
