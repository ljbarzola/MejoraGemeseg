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
import { BarraH, Cargando, Contador, Muestra, SelectorPeriodo, SinDatos, Tarjeta, formatoDia, periodoDesdeDias, EnBarra, KpiFila } from './DashboardBits';
import FilterField from '../../common/FilterField';

const dias = (v: number | null) => (v === null ? '—' : `${v} ${v === 1 ? 'día' : 'días'}`);

function Velocidad({ titulo, detalle, m }: { titulo: string; detalle: string; m: ResumenMuestra }) {
  return (
    <div className="dash-kpi" style={{ ['--kpi' as string]: '#2b6cb0' }}>
      <span className="dash-kpi-t">{titulo}</span>
      <span className="dash-kpi-v">{dias(m.mediana)}</span>
      <span className="dash-kpi-d">
        {m.p75 !== null && <>El 75% en {dias(m.p75)} o menos · </>}
        <Muestra n={m.n} pocas={m.pocasMuestras} />
      </span>
      <span className="dash-kpi-d">{detalle}</span>
    </div>
  );
}

function TablaAceptacion({ titulo, filas, hint }: { titulo: string; filas: GrupoAceptacion[]; hint?: string }) {
  return (
    <Tarjeta titulo={titulo} hint={hint ?? 'De las oportunidades que se cerraron en el periodo, cuántas se ganaron y cuántas se perdieron.'}>
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
    <div className="dash-pila">
      <EnBarra>
        <FilterField label="Periodo">
          <SelectorPeriodo dias={periodo} onChange={setPeriodo} />
        </FilterField>
        <p className="dash-barra-nota">
          {embudo.oportunidades} oportunidades llegaron del {formatoDia(embudo.periodo.desde)} al {formatoDia(embudo.periodo.hasta)}.
        </p>
      </EnBarra>

      <div>
        <DashboardMarketing desde={embudo.periodo.desde.slice(0, 10)} hasta={embudo.periodo.hasta.slice(0, 10)} />
      </div>

      <div>
        <p className="dash-seccion">Qué tan rápido trabajamos</p>
      <KpiFila>
        <Velocidad titulo="Tiempo de respuesta" detalle="De llegar a la primera revisión" m={embudo.velocidad.respuestaDias} />
        <Velocidad titulo="Tiempo de cotización" detalle="De llegar a cotizar" m={embudo.velocidad.cotizacionDias} />
        <Velocidad titulo="Duración del ciclo" detalle="De llegar a aceptar" m={embudo.velocidad.cicloDias} />
        <Contador titulo="Medido en" valor={`${embudo.cobertura.medidas} de ${embudo.cobertura.de}`} color="#718096"
          detalle={`El historial de etapas existe desde el ${formatoDia(embudo.cobertura.historialDesde)}; lo anterior no se puede medir`} />
      </KpiFila>
      </div>

      <div className="dash-grid dash-grid--2">
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
      </div>

      <div className="dash-grid dash-grid--2">
        <TablaAceptacion titulo="Aceptación por fuente" filas={aceptacion.porFuente} />
        <TablaAceptacion titulo="Aceptación por servicio" filas={aceptacion.porServicio} />
        {aceptacion.porResponsable.length > 0 && <TablaAceptacion titulo="Aceptación por responsable" filas={aceptacion.porResponsable} />}
        {aceptacion.porReferidor.length > 0 && <TablaAceptacion titulo="Aceptación por referidor" filas={aceptacion.porReferidor} />}
      </div>
    </div>
  );
}
