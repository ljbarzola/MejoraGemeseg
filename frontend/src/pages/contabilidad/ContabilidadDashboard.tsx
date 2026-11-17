import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/common/PageHeader';
import FilterField from '../../components/common/FilterField';
import { getContabilidadDashboard } from '../../services/contabilidad.service';
import { AreaGrafico, Dona } from '../../components/ventas/dashboard/DashboardGraficos';
import { BarraH, Cargando, Contador, KpiFila, SinDatos, Tarjeta, dinero } from '../../components/ventas/dashboard/DashboardBits';

const TIPO_LABEL: Record<string, string> = { HACIENDA: 'Hacienda', PUERTO: 'Puerto', VIP: 'VIP' };
const TIPO_COLOR: Record<string, string> = { HACIENDA: '#2f855a', PUERTO: '#2b6cb0', VIP: '#6b46c1' };

const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

export default function ContabilidadDashboard() {
  const navigate = useNavigate();
  const [mes, setMes] = useState(mesActual());
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    try {
      setData(await getContabilidadDashboard(mes));
    } catch {
      setError(true);
    }
  }, [mes]);
  useEffect(() => { setData(null); cargar(); }, [cargar]);

  const k = data?.kpis;
  const maxCliente = Math.max(1, ...(data?.por_cliente ?? []).map((c: any) => c.total_usd));
  const maxPersona = Math.max(1, ...(data?.por_persona ?? []).map((p: any) => p.total_usd));

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Contabilidad"
        title="Dashboard"
        description="Cuánto cuesta pagar a chofer y custodios por los viajes que llegaron a su destino."
      />

      <div className="dash-barra">
        <FilterField label="Mes">
          <input
            type="month" className="filter-select" value={mes}
            onChange={(e) => e.target.value && setMes(e.target.value)}
          />
        </FilterField>
        <p className="dash-barra-rango"><strong>{nombreMes(mes)}</strong></p>
        <p className="dash-barra-nota">Cada viaje se cuenta con la tarifa vigente el día en que se hizo. La tendencia muestra los 6 meses hasta el mes elegido.</p>
      </div>

      {!data ? (
        <Cargando error={error} onReintentar={cargar} />
      ) : (
        <div className="dash-pila">
          {k.viajes_sin_tarifa > 0 && (
            <div className="dash-aviso" role="status">
              <span>
                <strong>{k.viajes_sin_tarifa} viaje(s) de este mes no tienen tarifa definida</strong> y se cuentan como $0.
              </span>
              <button type="button" className="btn-secondary" onClick={() => navigate('/contabilidad/tarifas')}>Definir tarifas</button>
            </div>
          )}

          <KpiFila>
            <Contador titulo="Total a pagar" valor={dinero(k.total_nomina_usd)} color="#2f855a" detalle="Viajes que llegaron, con ajustes" />
            <Contador
              titulo="Ajustes" color="#718096" detalle="Extras menos descuentos del mes"
              valor={k.ajustes_usd === 0 ? '$0' : `${k.ajustes_usd > 0 ? '+' : '−'}${dinero(Math.abs(k.ajustes_usd))}`}
            />
            <Contador titulo="Viajes pagados" valor={k.viajes_finalizados} color="#2b6cb0" detalle="Estado «Llegó»" />
            <Contador titulo="Personas a pagar" valor={k.personas_pagadas} color="#d97706" detalle="Choferes y custodios" />
            <Contador titulo="Promedio por viaje" valor={k.promedio_por_viaje === null ? '—' : dinero(k.promedio_por_viaje)} color="#6b46c1" detalle="Costo de las 3 personas, sin ajustes" />
          </KpiFila>

          <div className="dash-grid">
            <Tarjeta titulo="Total pagado por mes" hint="Los últimos 6 meses, en dólares" className="dash-span2">
              <AreaGrafico
                puntos={data.por_mes.map((m: any) => ({ etiqueta: m.etiqueta, valor: Math.round(m.total_usd) }))}
                aria="Total pagado por mes en dólares"
              />
            </Tarjeta>

            <Tarjeta titulo="Costo por tipo de custodia" hint={`En ${nombreMes(mes)}`}>
              <Dona
                aria="Costo por tipo de custodia"
                centroValor={`$${Math.round(k.total_viajes_usd)}`}
                centroTitulo="total"
                vacio="No hay viajes pagados en este mes"
                segmentos={data.por_tipo.map((t: any) => ({
                  key: t.tipo, etiqueta: `${TIPO_LABEL[t.tipo] ?? t.tipo} (${t.cantidad})`, valor: Math.round(t.total_costo), color: TIPO_COLOR[t.tipo] ?? '#94a3b8',
                }))}
              />
            </Tarjeta>

            <Tarjeta titulo="Clientes que más cuestan" hint={`Costo de los viajes en ${nombreMes(mes)}`}>
              {data.por_cliente.length === 0 ? (
                <SinDatos texto="No hay viajes pagados en este mes." />
              ) : (
                data.por_cliente.map((c: any) => (
                  <BarraH key={c.cliente} etiqueta={`${c.cliente} (${c.viajes})`} valor={c.total_usd} max={maxCliente} color="#6b46c1" detalle={dinero(c.total_usd)} />
                ))
              )}
            </Tarjeta>

            <Tarjeta titulo="A quién se le paga más" hint={`Total de cada persona en ${nombreMes(mes)}`}>
              {data.por_persona.length === 0 ? (
                <SinDatos texto="No hay viajes pagados en este mes." />
              ) : (
                data.por_persona.map((p: any) => (
                  <BarraH key={p.cedula || p.nombre} etiqueta={`${p.nombre} (${p.viajes})`} valor={p.total_usd} max={maxPersona} color="#d97706" detalle={dinero(p.total_usd)} />
                ))
              )}
            </Tarjeta>
          </div>
        </div>
      )}
    </div>
  );
}
