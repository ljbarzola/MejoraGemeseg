import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../components/common/PageHeader';
import FilterField from '../../components/common/FilterField';
import { getCustodiasDashboard } from '../../services/custodia.service';
import { BarraApilada, AreaGrafico, Dona } from '../../components/ventas/dashboard/DashboardGraficos';
import { BarraH, Cargando, Contador, KpiFila, SinDatos, Tarjeta } from '../../components/ventas/dashboard/DashboardBits';

const TIPO_LABEL: Record<string, string> = { HACIENDA: 'Hacienda', PUERTO: 'Puerto', VIP: 'VIP' };
const TIPO_COLOR: Record<string, string> = { HACIENDA: '#2f855a', PUERTO: '#2b6cb0', VIP: '#6b46c1' };
const ESTADO_LABEL: Record<string, string> = { LISTO_PARA_CUSTODIAR: 'Listo para custodiar', EN_CAMINO: 'En camino', LLEGO: 'Llegó' };
const ESTADO_COLOR: Record<string, string> = { LISTO_PARA_CUSTODIAR: '#b7791f', EN_CAMINO: '#2b6cb0', LLEGO: '#2f855a' };

const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/**
 * Cifras de los viajes de custodia. `incrustado`: se muestra como una pestaña del Resumen de Operaciones (sin
 * encabezado ni marco propio); sin él es la pantalla completa, que ve quien tiene Custodias y no Operaciones.
 */
export default function CustodiasDashboard({ incrustado = false }: { incrustado?: boolean }) {
  const [mes, setMes] = useState(mesActual());
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    try {
      setData(await getCustodiasDashboard(mes));
    } catch {
      setError(true);
    }
  }, [mes]);
  useEffect(() => { setData(null); cargar(); }, [cargar]);

  const k = data?.kpis;
  const maxCliente = Math.max(1, ...(data?.por_cliente ?? []).map((c: any) => c.viajes));
  const maxPersona = Math.max(1, ...(data?.por_persona ?? []).map((p: any) => p.viajes));

  return (
    <div className={incrustado ? undefined : 'page-container'}>
      {!incrustado && (
        <PageHeader
          eyebrow="Operaciones"
          title="Resumen de custodias"
          description="Cómo van los viajes de custodia: cuántos hay, en qué estado, para qué clientes y con qué personal."
        />
      )}

      <div className="dash-barra">
        <FilterField label="Mes">
          <input
            type="month" className="filter-select" value={mes}
            onChange={(e) => e.target.value && setMes(e.target.value)}
          />
        </FilterField>
        <p className="dash-barra-rango"><strong>{nombreMes(mes)}</strong></p>
        <p className="dash-barra-nota">Las cifras son del mes elegido; la tendencia muestra los 6 meses hasta ese mes.</p>
      </div>

      {!data ? (
        <Cargando error={error} onReintentar={cargar} />
      ) : (
        <div className="dash-pila">
          <KpiFila>
            <Contador titulo="Viajes del mes" valor={k.total_viajes} color="#100F31" detalle="Registrados en el mes" />
            <Contador titulo="Finalizados" valor={k.viajes_finalizados} color="#2f855a" detalle="Llegaron a su destino" />
            <Contador titulo="En camino" valor={k.en_camino} color="#2b6cb0" detalle="Salieron y aún no llegan" />
            <Contador titulo="Clientes atendidos" valor={k.clientes_atendidos} color="#6b46c1" detalle="Con al menos un viaje" />
            <Contador titulo="Personal activo" valor={k.empleados_activos} color="#d97706" detalle="Choferes y custodios con viajes" />
          </KpiFila>

          <div className="dash-grid">
            <Tarjeta titulo="Viajes por mes" hint="Los últimos 6 meses, todos los tipos" className="dash-span2">
              <AreaGrafico
                puntos={data.por_mes.map((m: any) => ({ etiqueta: m.etiqueta, valor: m.total }))}
                aria="Viajes registrados por mes"
              />
            </Tarjeta>

            <Tarjeta titulo="Por tipo de custodia" hint={`En ${nombreMes(mes)}`}>
              <Dona
                aria="Viajes por tipo de custodia"
                centroTitulo="viajes"
                vacio="No hay viajes en este mes"
                segmentos={data.por_tipo.map((t: any) => ({
                  key: t.tipo, etiqueta: TIPO_LABEL[t.tipo] ?? t.tipo, valor: t.cantidad, color: TIPO_COLOR[t.tipo] ?? '#94a3b8',
                }))}
              />
            </Tarjeta>

            <Tarjeta titulo="Estado de los viajes" hint={`En ${nombreMes(mes)}`}>
              <BarraApilada
                vacio="No hay viajes en este mes"
                partes={data.por_estado.map((e: any) => ({
                  key: e.estado, etiqueta: ESTADO_LABEL[e.estado] ?? e.estado, valor: e.cantidad, color: ESTADO_COLOR[e.estado] ?? '#94a3b8',
                }))}
              />
            </Tarjeta>

            <Tarjeta titulo="Clientes con más viajes" hint={`En ${nombreMes(mes)}`}>
              {data.por_cliente.length === 0 ? (
                <SinDatos texto="No hay viajes en este mes." />
              ) : (
                data.por_cliente.map((c: any) => (
                  <BarraH key={c.cliente} etiqueta={c.cliente} valor={c.viajes} max={maxCliente} color="#6b46c1" detalle={`${c.viajes}`} />
                ))
              )}
            </Tarjeta>

            <Tarjeta titulo="Personal con más viajes" hint={`Como chofer o custodio, en ${nombreMes(mes)}`}>
              {data.por_persona.length === 0 ? (
                <SinDatos texto="No hay viajes en este mes." />
              ) : (
                data.por_persona.map((p: any) => (
                  <BarraH key={p.nombre} etiqueta={p.nombre} valor={p.viajes} max={maxPersona} color="#d97706" detalle={`${p.viajes}`} />
                ))
              )}
            </Tarjeta>
          </div>
        </div>
      )}
    </div>
  );
}
