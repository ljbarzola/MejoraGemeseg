import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, TrendingUp, Boxes, Receipt } from 'lucide-react';
import PageHeader from '../../../components/common/PageHeader';
import PageTabs, { type PageTab } from '../../../components/common/PageTabs';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { KpiFila, Contador, SinDatos, dinero } from '../../../components/ventas/dashboard/DashboardBits';
import { getPayables, getReceivables, getShipments, getLots } from '../../../services/cacao.service';
import { KG_POR_QUINTAL } from '../useCacaoUnidades';
import { useTablaCacao } from '../useTablaCacao';
import {
  antiguedad, totalesAntiguedad, ventasPorCliente, inventarioPorCalidad, hoyComoDia,
  type FilaAntiguedad, type FilaVentaCliente, type FilaInventarioCalidad,
} from './reportes.util';

type Pestana = 'cxp' | 'cxc' | 'ventas' | 'inventario';

const PESTANAS: PageTab<Pestana>[] = [
  { key: 'cxp', label: 'Cuentas por pagar', icon: Clock, title: 'Antigüedad de lo que debes a tus proveedores' },
  { key: 'cxc', label: 'Cuentas por cobrar', icon: Receipt, title: 'Antigüedad de lo que te deben tus clientes' },
  { key: 'ventas', label: 'Ventas por cliente', icon: TrendingUp, title: 'Lo vendido y el margen por cliente' },
  { key: 'inventario', label: 'Inventario', icon: Boxes, title: 'El cacao que tienes por calidad' },
];

const numero = (n: number, decimales = 0) => n.toLocaleString('en-US', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

export default function ReportesCacao() {
  const [params, setParams] = useSearchParams();
  const pedida = params.get('tab');
  const pestana: Pestana = PESTANAS.some((p) => p.key === pedida) ? (pedida as Pestana) : 'cxp';

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Cacao"
        title="Reportes"
        description="Lo que necesita mirar gerencia: cuánto vence, cuánto se vendió y qué cacao hay. Todos se pueden buscar, ordenar y descargar en Excel."
      />
      <PageTabs tabs={PESTANAS} value={pestana} onChange={(key) => setParams({ tab: key }, { replace: true })} label="Reportes de Cacao" />
      {pestana === 'cxp' && <AntiguedadTab tipo="cxp" />}
      {pestana === 'cxc' && <AntiguedadTab tipo="cxc" />}
      {pestana === 'ventas' && <VentasTab />}
      {pestana === 'inventario' && <InventarioTab />}
    </div>
  );
}

/** Estado de carga común de los reportes: mientras llegan los datos, o si fallaron. */
function useDatos<T>(cargar: () => Promise<T>) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const recargar = () => { setError(false); cargar().then(setDatos).catch(() => setError(true)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { recargar(); }, []);
  return { datos, error, recargar };
}

function Cargando({ error, recargar }: { error: boolean; recargar: () => void }) {
  return error ? (
    <div className="admin-section">
      <p style={{ margin: 0, color: '#718096' }}>No se pudo cargar este reporte.</p>
      <button type="button" className="btn-secondary" onClick={recargar} style={{ marginTop: 10, padding: '8px 16px', fontSize: '0.9rem' }}>Reintentar</button>
    </div>
  ) : (
    <div className="loading-state">Cargando reporte...</div>
  );
}

/** Barra de filtros común: buscar, columnas, exportar y limpiar. `extra` va a la izquierda (otros filtros). */
function BarraReporte({ tabla, extra, hayOtros, limpiarOtros }: {
  tabla: Pick<ReturnType<typeof useTablaCacao>, 'buscador' | 'selectorColumnas' | 'botonExportar' | 'limpiarBusqueda' | 'hayBusqueda'>;
  extra?: React.ReactNode;
  hayOtros?: boolean;
  limpiarOtros?: () => void;
}) {
  return (
    <div className="filter-bar">
      <div className="filter-bar-fields">{tabla.buscador}{extra}</div>
      <div className="filter-bar-actions">
        {tabla.selectorColumnas}
        {tabla.botonExportar}
        <ClearFiltersButton onClear={() => { tabla.limpiarBusqueda(); limpiarOtros?.(); }} disabled={!tabla.hayBusqueda && !hayOtros} />
      </div>
    </div>
  );
}

// ─── Antigüedad de cuentas por pagar / por cobrar ───

function AntiguedadTab({ tipo }: { tipo: 'cxp' | 'cxc' }) {
  const esPagar = tipo === 'cxp';
  const { datos, error, recargar } = useDatos(async () => {
    const lista: any[] = await (esPagar ? getPayables() : getReceivables());
    return lista
      // una cuenta anulada ya no se debe ni se cobra
      .filter((c) => c.status !== 'CANCELLED')
      .map((c) => ({
        nombre: (esPagar ? c.supplier?.name : c.client?.name) || 'Sin nombre',
        saldo: esPagar ? c.totalAmount - c.paidAmount : c.totalAmount - c.receivedAmount,
        vence: c.dueDate as string,
      }));
  });

  const filas = useMemo(() => (datos ? antiguedad(datos, hoyComoDia()) : []), [datos]);
  const tot = useMemo(() => totalesAntiguedad(filas), [filas]);

  const dinero2 = (campo: keyof FilaAntiguedad, titulo: string) => ({
    orden: (f: FilaAntiguedad) => f[campo] as number,
    excel: { tipo: 'moneda' as const, titulo },
    celda: (f: FilaAntiguedad) => ((f[campo] as number) > 0 ? dinero(f[campo] as number) : '—'),
    derecha: true,
    ancho: 150,
  });

  const t = useTablaCacao<FilaAntiguedad>({
    clave: tipo === 'cxp' ? 'reporte-cxp' : 'reporte-cxc',
    filas,
    idFila: (f) => f.nombre,
    ordenInicial: 'vencido',
    direccionInicial: 'desc',
    principal: { key: 'nombre', ancho: 220, label: esPagar ? 'Proveedor' : 'Cliente', clase: 'tasks-table-title', orden: (f) => f.nombre, celda: (f) => f.nombre },
    columnas: [
      { key: 'cuentas', label: 'Cuentas', derecha: true, orden: (f) => f.cuentas, celda: (f) => numero(f.cuentas) },
      { key: 'alDia', label: 'Al día', ...dinero2('alDia', 'Al día ($)') },
      { key: 'd1_30', label: '1–30 días', ...dinero2('d1_30', 'Vencido 1–30 días ($)') },
      { key: 'd31_60', label: '31–60 días', ...dinero2('d31_60', 'Vencido 31–60 días ($)') },
      { key: 'd61_90', label: '61–90 días', ...dinero2('d61_90', 'Vencido 61–90 días ($)') },
      { key: 'd90', label: '+90 días', ...dinero2('d90', 'Vencido +90 días ($)') },
      { key: 'vencido', label: 'Vencido', ...dinero2('vencido', 'Total vencido ($)') },
      { key: 'total', label: 'Total', ...dinero2('total', 'Total pendiente ($)') },
    ],
  });

  if (!datos) return <Cargando error={error} recargar={recargar} />;

  const quien = esPagar ? 'proveedores' : 'clientes';
  return (
    <>
      <KpiFila className="dash-kpis--cuatro">
        <Contador titulo={esPagar ? 'Por pagar' : 'Por cobrar'} valor={dinero(tot.total)} color={esPagar ? '#e53e3e' : '#38a169'} detalle={`${numero(tot.cuentas)} ${tot.cuentas === 1 ? 'cuenta' : 'cuentas'} · ${filas.length} ${quien}`} />
        <Contador titulo="Vencido" valor={dinero(tot.vencido)} color={tot.vencido > 0 ? '#c05621' : '#276749'} detalle={tot.total > 0 ? `${Math.round((tot.vencido / tot.total) * 100)}% del total` : 'Nada pendiente'} />
        <Contador titulo="Al día" valor={dinero(tot.alDia)} color="#2b6cb0" detalle="Aún no vence" />
        <Contador titulo="Vencido +90 días" valor={dinero(tot.d90)} color={tot.d90 > 0 ? '#c53030' : '#276749'} detalle={tot.d90 > 0 ? 'Lo más urgente' : 'Nada tan atrasado'} />
      </KpiFila>
      <BarraReporte tabla={t} />
      <div className="admin-section">
        {filas.length === 0 ? <SinDatos texto={esPagar ? 'No debes nada a tus proveedores en este momento.' : 'Tus clientes no te deben nada en este momento.'} /> : t.tabla}
      </div>
    </>
  );
}

// ─── Ventas por cliente ───

const PERIODOS_VENTAS = [
  { valor: 0, label: 'Todo el historial' },
  { valor: 30, label: 'Últimos 30 días' },
  { valor: 90, label: 'Últimos 90 días' },
  { valor: 180, label: 'Últimos 6 meses' },
  { valor: 365, label: 'Último año' },
];

function VentasTab() {
  const [dias, setDias] = useState(0);
  const { datos, error, recargar } = useDatos(async () => {
    const lista: any[] = await getShipments();
    // un embarque anulado no es una venta
    return lista.filter((s) => s.status !== 'CANCELLED').map((s) => ({
      cliente: s.client?.name || 'Sin cliente',
      fecha: s.date as string,
      // `totalWeight` está en la unidad del embarque; los kilos van en `totalWeightKg`.
      kg: (s.totalWeightKg ?? s.totalWeight) as number,
      precioKg: s.salePrice as number,
      costo: s.totalCost as number,
    }));
  });

  const filas = useMemo(() => {
    if (!datos) return [];
    const hoy = hoyComoDia();
    return ventasPorCliente(datos, dias > 0 ? hoy - (dias - 1) * 24 * 60 * 60 * 1000 : null);
  }, [datos, dias]);

  const total = useMemo(() => {
    const venta = filas.reduce((s, f) => s + f.venta, 0);
    const costo = filas.reduce((s, f) => s + f.costo, 0);
    return {
      embarques: filas.reduce((s, f) => s + f.embarques, 0),
      kg: filas.reduce((s, f) => s + f.kg, 0),
      venta, costo, margen: venta - costo,
      margenPct: costo > 0 ? Math.round((venta / costo - 1) * 1000) / 10 : null,
    };
  }, [filas]);

  const t = useTablaCacao<FilaVentaCliente>({
    clave: 'reporte-ventas',
    filas,
    idFila: (f) => f.cliente,
    ordenInicial: 'venta',
    direccionInicial: 'desc',
    principal: { key: 'cliente', ancho: 220, label: 'Cliente', clase: 'tasks-table-title', orden: (f) => f.cliente, celda: (f) => f.cliente },
    columnas: [
      { key: 'embarques', label: 'Embarques', derecha: true, orden: (f) => f.embarques, celda: (f) => numero(f.embarques) },
      { key: 'kg', ancho: 150, label: 'Peso', derecha: true, orden: (f) => f.kg, excel: { titulo: 'Peso (kg)' }, celda: (f) => `${numero(f.kg)} kg` },
      { key: 'venta', ancho: 140, label: 'Venta', derecha: true, orden: (f) => f.venta, excel: { tipo: 'moneda', titulo: 'Venta ($)' }, celda: (f) => dinero(f.venta) },
      { key: 'costo', ancho: 140, label: 'Costo', derecha: true, orden: (f) => f.costo, excel: { tipo: 'moneda', titulo: 'Costo ($)' }, celda: (f) => dinero(f.costo) },
      { key: 'margen', ancho: 140, label: 'Margen', derecha: true, orden: (f) => f.margen, excel: { tipo: 'moneda', titulo: 'Margen ($)' }, celda: (f) => <span style={{ color: f.margen >= 0 ? '#38a169' : '#e53e3e', fontWeight: 600 }}>{dinero(f.margen)}</span> },
      { key: 'margenpct', ancho: 130, label: 'Margen %', derecha: true, orden: (f) => f.margenPct, excel: { tipo: 'porcentaje', titulo: 'Margen (%)' }, celda: (f) => (f.margenPct === null ? '—' : `${f.margenPct}%`) },
    ],
  });

  if (!datos) return <Cargando error={error} recargar={recargar} />;

  return (
    <>
      <KpiFila className="dash-kpis--cuatro">
        <Contador titulo="Venta total" valor={dinero(total.venta)} color="#1a365d" detalle={`${numero(total.embarques)} ${total.embarques === 1 ? 'embarque' : 'embarques'} · ${filas.length} ${filas.length === 1 ? 'cliente' : 'clientes'}`} />
        <Contador titulo="Costo" valor={dinero(total.costo)} color="#718096" detalle="Costo de los lotes vendidos" />
        <Contador titulo="Margen" valor={dinero(total.margen)} color={total.margen >= 0 ? '#276749' : '#c53030'} detalle={total.margenPct === null ? undefined : `${total.margenPct}% sobre el costo`} />
        <Contador titulo="Peso vendido" valor={`${numero(total.kg / KG_POR_QUINTAL, 2)} qq`} color="#2b6cb0" detalle={`${numero(total.kg)} kg`} />
      </KpiFila>
      <BarraReporte
        tabla={t}
        extra={
          <select className="filter-select" value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Periodo">
            {PERIODOS_VENTAS.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
          </select>
        }
        hayOtros={dias !== 0}
        limpiarOtros={() => setDias(0)}
      />
      <div className="admin-section">
        {filas.length === 0 ? <SinDatos texto="No hay embarques en este periodo." /> : t.tabla}
      </div>
    </>
  );
}

// ─── Inventario por calidad ───

function InventarioTab() {
  const { datos, error, recargar } = useDatos(async () => {
    const lista: any[] = await getLots({ status: 'OPEN' });
    return lista.map((l) => ({ calidad: l.quality?.name || 'Sin calidad', kg: l.netWeight as number, costoPorKg: l.averageCost as number }));
  });

  const filas = useMemo(() => (datos ? inventarioPorCalidad(datos) : []), [datos]);
  const total = useMemo(() => ({
    kg: filas.reduce((s, f) => s + f.kg, 0),
    valor: filas.reduce((s, f) => s + f.valor, 0),
    lotes: filas.reduce((s, f) => s + f.lotes, 0),
  }), [filas]);

  const t = useTablaCacao<FilaInventarioCalidad>({
    clave: 'reporte-inventario',
    filas,
    idFila: (f) => f.calidad,
    ordenInicial: 'valor',
    direccionInicial: 'desc',
    principal: { key: 'calidad', ancho: 220, label: 'Calidad', clase: 'tasks-table-title', orden: (f) => f.calidad, celda: (f) => f.calidad },
    columnas: [
      { key: 'lotes', label: 'Lotes', derecha: true, orden: (f) => f.lotes, celda: (f) => numero(f.lotes) },
      { key: 'kg', ancho: 150, label: 'Peso', derecha: true, orden: (f) => f.kg, excel: { titulo: 'Peso (kg)' }, celda: (f) => `${numero(f.kg)} kg` },
      { key: 'qq', ancho: 130, label: 'Quintales', derecha: true, orden: (f) => f.kg / KG_POR_QUINTAL, excel: { titulo: 'Quintales (qq)' }, celda: (f) => numero(f.kg / KG_POR_QUINTAL, 2) },
      { key: 'costo', ancho: 170, label: 'Costo promedio', derecha: true, orden: (f) => f.costoPromedioKg, excel: { tipo: 'moneda', titulo: 'Costo promedio ($/kg)' }, celda: (f) => (f.costoPromedioKg === null ? '—' : `${dinero(f.costoPromedioKg)}/kg`) },
      { key: 'valor', ancho: 150, label: 'Valor', derecha: true, orden: (f) => f.valor, excel: { tipo: 'moneda', titulo: 'Valor ($)' }, celda: (f) => dinero(f.valor) },
    ],
  });

  if (!datos) return <Cargando error={error} recargar={recargar} />;

  return (
    <>
      <KpiFila className="dash-kpis--cuatro">
        <Contador titulo="Valor del inventario" valor={dinero(total.valor)} color="#2b6cb0" detalle="Lotes abiertos, a su costo" />
        <Contador titulo="Peso" valor={`${numero(total.kg / KG_POR_QUINTAL, 2)} qq`} color="#1a365d" detalle={`${numero(total.kg)} kg`} />
        <Contador titulo="Lotes con existencia" valor={numero(total.lotes)} color="#2f855a" detalle={`${filas.length} ${filas.length === 1 ? 'calidad' : 'calidades'}`} />
        <Contador titulo="Costo promedio" valor={total.kg > 0 ? `${dinero(total.valor / total.kg)}/kg` : '—'} color="#b7791f" detalle={total.kg > 0 ? `${dinero((total.valor / total.kg) * KG_POR_QUINTAL)} por quintal` : undefined} />
      </KpiFila>
      <BarraReporte tabla={t} />
      <div className="admin-section">
        {filas.length === 0 ? <SinDatos texto="No tienes lotes con existencia en este momento." /> : t.tabla}
      </div>
    </>
  );
}
