import { useCallback, useEffect, useState } from 'react';
import {
  getAnaliticaAceptacion,
  getAnaliticaEmbudo,
  type AnaliticaAceptacion,
  type AnaliticaEmbudo,
  type GrupoAceptacion,
  type ResumenMuestra,
} from '../../../services/ventas.service';
import DashboardMarketing from './DashboardMarketing';
import { BarraH, Cargando, Contador, Muestra, SelectorPeriodo, SinDatos, Tarjeta, formatoDia, periodoDesdeDias } from './DashboardBits';

const dias = (v: number | null) => (v === null ? '—' : `${v} ${v === 1 ? 'día' : 'días'}`);

function Velocidad({ titulo, detalle, m }: { titulo: string; detalle: string; m: ResumenMuestra }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: '0.78rem', color: '#718096', fontWeight: 600 }}>{titulo}</div>
      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#2b6cb0', lineHeight: 1.2 }}>{dias(m.mediana)}</div>
      <div style={{ fontSize: 11.5, color: '#a0aec0' }}>
        {m.p75 !== null && <>El 75% en {dias(m.p75)} o menos · </>}
        <Muestra n={m.n} pocas={m.pocasMuestras} />
      </div>
      <div style={{ fontSize: 11, color: '#cbd5e0', marginTop: 2 }}>{detalle}</div>
    </div>
  );
}

function TablaAceptacion({ titulo, filas }: { titulo: string; filas: GrupoAceptacion[] }) {
  return (
    <Tarjeta titulo={titulo}>
      {filas.length === 0 ? (
        <SinDatos texto="Sin cierres en el periodo." />
      ) : (
        <div className="tasks-table-wrapper">
          <table className="tasks-table">
            <thead>
              <tr><th>Grupo</th><th>Ganadas</th><th>Perdidas</th><th>Aceptación</th></tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.nombre}>
                  <td><span className="truncate">{f.nombre}</span></td>
                  <td>{f.ganadas}</td>
                  <td>{f.perdidas}</td>
                  <td>
                    <strong>{f.tasa}%</strong> <Muestra n={f.n} pocas={f.pocasMuestras} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

// Embudo, velocidad y qué funciona. Todo sale del historial de cambios de etapa
// de las oportunidades (existe desde el 30/09/2026): por eso cada cifra dice en
// cuántas oportunidades se midió.
export default function DashboardEmbudo({ alcance }: { alcance: string }) {
  const [embudo, setEmbudo] = useState<AnaliticaEmbudo | null>(null);
  const [aceptacion, setAceptacion] = useState<AnaliticaAceptacion | null>(null);
  const [periodo, setPeriodo] = useState(90);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    try {
      const { desde, hasta } = periodoDesdeDias(periodo);
      const [e, a] = await Promise.all([
        getAnaliticaEmbudo({ alcance, desde, hasta }),
        getAnaliticaAceptacion({ alcance, desde, hasta }),
      ]);
      setEmbudo(e);
      setAceptacion(a);
    } catch {
      setError(true);
    }
  }, [alcance, periodo]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!embudo || !aceptacion) return <Cargando error={error} onReintentar={cargar} />;
  const maxAlcanzaron = Math.max(1, ...embudo.conversion.map((c) => c.alcanzaron));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '16px 0 0' }}>
        <SelectorPeriodo dias={periodo} onChange={setPeriodo} />
        <span style={{ fontSize: 12, color: '#a0aec0' }}>
          {embudo.oportunidades} oportunidades llegaron del {formatoDia(embudo.periodo.desde)} al {formatoDia(embudo.periodo.hasta)}.
        </span>
      </div>

      <div style={{ marginTop: 14 }}>
        <DashboardMarketing desde={embudo.periodo.desde.slice(0, 10)} hasta={embudo.periodo.hasta.slice(0, 10)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginTop: 14 }}>
        <Velocidad titulo="Tiempo de respuesta" detalle="De llegar a la primera revisión" m={embudo.velocidad.respuestaDias} />
        <Velocidad titulo="Tiempo de cotización" detalle="De llegar a cotizar" m={embudo.velocidad.cotizacionDias} />
        <Velocidad titulo="Duración del ciclo" detalle="De llegar a aceptar" m={embudo.velocidad.cicloDias} />
        <Contador titulo="Medido en" valor={`${embudo.cobertura.medidas} de ${embudo.cobertura.de}`} color="#718096"
          detalle={`El historial de etapas existe desde el ${formatoDia(embudo.cobertura.historialDesde)}; lo anterior no se puede medir`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginTop: 20 }}>
        <Tarjeta titulo="Conversión entre etapas" hint="Cuántas llegaron a cada etapa y cuántas pasaron a la siguiente">
          {embudo.oportunidades === 0 ? (
            <SinDatos texto="No llegaron oportunidades en este periodo." />
          ) : (
            embudo.conversion.map((c) => (
              <BarraH
                key={c.etapa} etiqueta={c.etiqueta} valor={c.alcanzaron} max={maxAlcanzaron}
                detalle={c.tasa === null ? `${c.alcanzaron}` : `${c.alcanzaron} · ${c.tasa}% pasó a la siguiente`}
              />
            ))
          )}
        </Tarjeta>

        <Tarjeta titulo="Tiempo en cada etapa" hint="Mediana de días entre entrar a una etapa y salir de ella">
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead><tr><th>Etapa</th><th>Mediana</th><th>El 75%</th><th>Casos</th></tr></thead>
              <tbody>
                {embudo.tiempoPorEtapa.map((t) => (
                  <tr key={t.etapa}>
                    <td>{t.etiqueta}</td>
                    <td>{dias(t.mediana)}</td>
                    <td>{dias(t.p75)}</td>
                    <td><Muestra n={t.n} pocas={t.pocasMuestras} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>

        <TablaAceptacion titulo="Aceptación por fuente" filas={aceptacion.porFuente} />
        <TablaAceptacion titulo="Aceptación por servicio" filas={aceptacion.porServicio} />
        {aceptacion.porResponsable.length > 0 && <TablaAceptacion titulo="Aceptación por responsable" filas={aceptacion.porResponsable} />}
        {aceptacion.porReferidor.length > 0 && <TablaAceptacion titulo="Aceptación por referidor" filas={aceptacion.porReferidor} />}
      </div>
    </div>
  );
}
