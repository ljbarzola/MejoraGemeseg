import { useCallback, useEffect, useState } from 'react';
import { getAnaliticaMotivos, type AnaliticaMotivos } from '../../../services/ventas.service';
import { BarraH, Cargando, SelectorPeriodo, SinDatos, Tarjeta, formatoDia, periodoDesdeDias } from './DashboardBits';

// Por qué se pierde: pareto de los motivos registrados al descartar un lead,
// perder una oportunidad o cancelar, reducir o no renovar un contrato. Cada
// tarjeta dice cuánto de lo registrado es «sin información» y cuánto es solo la
// suposición del vendedor: sin eso, la gráfica parecería más segura de lo que es.
export default function DashboardMotivos({ alcance }: { alcance: string }) {
  const [datos, setDatos] = useState<AnaliticaMotivos | null>(null);
  const [periodo, setPeriodo] = useState(180);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    try {
      const { desde, hasta } = periodoDesdeDias(periodo);
      setDatos(await getAnaliticaMotivos({ alcance, desde, hasta }));
    } catch {
      setError(true);
    }
  }, [alcance, periodo]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!datos) return <Cargando error={error} onReintentar={cargar} />;
  const conDatos = datos.porCierre.filter((k) => k.total > 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '16px 0 0' }}>
        <SelectorPeriodo dias={periodo} onChange={setPeriodo} />
        <span style={{ fontSize: 12, color: '#a0aec0' }}>
          Motivos registrados del {formatoDia(datos.periodo.desde)} al {formatoDia(datos.periodo.hasta)}.
        </span>
      </div>

      {conDatos.length === 0 ? (
        <div className="admin-section" style={{ marginTop: 16 }}>
          <SinDatos texto="Todavía no hay motivos registrados en este periodo. Se piden al descartar un lead, perder una oportunidad o cancelar, reducir o no renovar un contrato." />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginTop: 16 }}>
          {conDatos.map((k) => (
            <Tarjeta key={k.kind} titulo={`${k.etiqueta} (${k.total})`}>
              {k.items.map((i) => (
                <BarraH key={i.label} etiqueta={i.label} valor={i.count} max={k.items[0].count} detalle={`${i.count} · ${i.pct}%`} />
              ))}
              <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#718096', lineHeight: 1.5 }}>
                <strong>{k.segunClientePct}%</strong> lo dijo el cliente · <strong>{k.segunVendedorPct}%</strong> es suposición del vendedor ·{' '}
                <strong>{k.sinInformacionPct}%</strong> sin información.
              </p>
            </Tarjeta>
          ))}
        </div>
      )}
    </div>
  );
}
