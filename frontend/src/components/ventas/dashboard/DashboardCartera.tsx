import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAnaliticaCartera,
  getAnaliticaRetencion,
  CICLO_COLOR,
  CICLO_LABEL,
  type AnaliticaCartera,
  type AnaliticaRetencion,
  type CicloVida,
} from '../../../services/ventas.service';
import { BarraH, Cargando, SinDatos, Tarjeta, dinero, formatoDia, pct } from './DashboardBits';
import { Contador, KpiFila } from './DashboardBits';
import { Dona } from './DashboardGraficos';

const COLOR_ALERTA = '#c53030';
const COLOR_AVISO = '#d97706';

// Cartera y contratos: cuántos prospectos, clientes, en riesgo e inactivos hay,
// qué contratos están en pie, cuánto valen y cuánto se retiene, todo dentro del periodo único del dashboard.
// Solo «Renovaciones próximas» y «Vencidos sin renovar» son de HOY (llevan su etiqueta).
export default function DashboardCartera({ alcance, desde, hasta }: { alcance: string; desde: string; hasta: string }) {
  const navigate = useNavigate();
  const [cartera, setCartera] = useState<AnaliticaCartera | null>(null);
  const [retencion, setRetencion] = useState<AnaliticaRetencion | null>(null);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    try {
      const [c, r] = await Promise.all([getAnaliticaCartera({ alcance, desde, hasta }), getAnaliticaRetencion({ alcance, desde, hasta })]);
      setCartera(c);
      setRetencion(r);
    } catch {
      setError(true);
    }
  }, [alcance, desde, hasta]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!cartera || !retencion) return <Cargando error={error} onReintentar={cargar} />;
  const { ciclo, contratos, renovaciones, vencidos, servicios, reducciones, bajas } = cartera;
  const maxServicio = Math.max(1, ...servicios.masContratados.map((s) => s.contratos));

  return (
    <div className="dash-pila">
      <div className="dash-grid">
        <Tarjeta className="dash-span2" titulo="Clientes y prospectos por relación" hint="De las empresas y personas registradas en el Directorio en el periodo, cómo se reparten hoy por relación. Pulsa una relación para verla">
          <Dona
            aria={`Directorio por relación: ${(Object.keys(CICLO_LABEL) as CicloVida[]).map((k) => `${CICLO_LABEL[k]} ${ciclo[k]}`).join(', ')}`}
            centroTitulo="registrados"
            vacio="No se registró nadie en el Directorio en este periodo."
            segmentos={(Object.keys(CICLO_LABEL) as CicloVida[]).map((k) => ({
              key: k, etiqueta: CICLO_LABEL[k], valor: ciclo[k], color: CICLO_COLOR[k],
              onClick: () => navigate(`/ventas/clientes?ciclo=${k}&responsable=${alcance}&desde=${desde}&hasta=${hasta}`),
            }))}
          />
        </Tarjeta>

        <Tarjeta titulo="Contratos" hint="Contratos que estuvieron en pie en algún momento del periodo, según su estado de hoy">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, textAlign: 'center' }}>
            {[
              { n: contratos.vigentes, t: 'Vigentes', c: '#2f855a', estado: 'EN_CURSO' },
              { n: contratos.porVencer, t: 'Por vencer (30 días)', c: COLOR_AVISO, estado: 'POR_VENCER' },
              { n: contratos.vencidosSinRenovar, t: 'Vencidos sin renovar', c: COLOR_ALERTA, estado: 'VENCIDO' },
              { n: contratos.cancelados, t: 'Cancelados', c: '#718096', estado: 'CANCELADO' },
            ].map((x) => (
              <button
                key={x.t} type="button" onClick={() => navigate(`/ventas/contratos?estado=${x.estado}&responsable=${alcance}&desde=${desde}&hasta=${hasta}`)}
                title="Ver estos contratos en Contratos" disabled={x.n === 0}
                style={{ background: 'none', border: 0, padding: '4px 0', font: 'inherit', cursor: x.n === 0 ? 'default' : 'pointer' }}
              >
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: x.c }}>{x.n}</div>
                <div style={{ fontSize: '0.72rem', color: '#718096' }}>{x.t}</div>
              </button>
            ))}
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 13 }}>
            Valor mensual de los contratos en curso: <strong>{dinero(contratos.valorMensualVigente)}</strong>
            {contratos.sinValor > 0 && (
              <span style={{ color: '#b45309' }}> ({contratos.sinValor} contratos sin valor registrado no suman)</span>
            )}
          </p>
        </Tarjeta>

        <Tarjeta hoy titulo="Renovaciones próximas" hint="Contratos vigentes que terminan pronto">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', marginBottom: 10 }}>
            {[['30 días', renovaciones.d30], ['60 días', renovaciones.d60], ['90 días', renovaciones.d90]].map(([t, n]) => (
              <div key={t as string}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: COLOR_AVISO }}>{n}</div>
                <div style={{ fontSize: '0.72rem', color: '#718096' }}>en {t}</div>
              </div>
            ))}
          </div>
          {renovaciones.proximas.length === 0 ? (
            <SinDatos texto="Ningún contrato vence en los próximos 90 días." />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {renovaciones.proximas.slice(0, 6).map((r) => (
                <li key={r.id} style={{ borderTop: '1px solid #edf2f7', padding: '6px 0', fontSize: 13 }}>
                  <a className="enlace-tabla" href={`/ventas/contratos/${r.id}`} onClick={(e) => { e.preventDefault(); navigate(`/ventas/contratos/${r.id}`); }}>
                    {r.cliente}
                  </a>
                  <span style={{ color: '#718096' }}> — vence el {formatoDia(r.fin)} (en {r.dias} {r.dias === 1 ? 'día' : 'días'})</span>
                  {r.valorMensual != null && <span style={{ color: '#a0aec0' }}> · {dinero(r.valorMensual)}</span>}
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta hoy titulo="Vencidos sin renovar" hint="Dentro de la gracia aún pueden renovar; pasada, el cliente ya está inactivo">
          {vencidos.length === 0 ? (
            <SinDatos texto="No hay contratos vencidos sin renovar." />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {vencidos.slice(0, 8).map((v) => (
                <li key={v.id} style={{ borderTop: '1px solid #edf2f7', padding: '6px 0', fontSize: 13 }}>
                  <a className="enlace-tabla" href={`/ventas/contratos/${v.id}`} onClick={(e) => { e.preventDefault(); navigate(`/ventas/contratos/${v.id}`); }}>
                    {v.cliente}
                  </a>
                  <span style={{ color: '#718096' }}> — venció el {formatoDia(v.fin)} (hace {v.diasVencido} días)</span>
                  <div style={{ fontSize: 11.5, color: v.enGracia ? COLOR_AVISO : COLOR_ALERTA }}>
                    {v.enGracia ? 'Dentro de la gracia' : 'Pasó la gracia'} ·{' '}
                    {v.motivoCierre ? `motivo: ${v.motivoCierre}` : 'sin motivo registrado'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta titulo="Servicios más contratados" hint="En los contratos que estuvieron en pie en el periodo (una renovación no cuenta doble)">
          {servicios.masContratados.length === 0 ? (
            <SinDatos texto="Aún no hay contratos vigentes con servicios." />
          ) : (
            servicios.masContratados.map((s) => (
              <BarraH key={s.servicio} etiqueta={s.servicio} valor={s.contratos} max={maxServicio} detalle={`${s.contratos} contratos · ${s.clientes} clientes`} />
            ))
          )}
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#4a5568' }}>
            Venta cruzada: <strong>{servicios.clientesConVarios}</strong> clientes con varios servicios y <strong>{servicios.clientesConUnServicio}</strong> con uno solo.
          </p>
        </Tarjeta>

        <Tarjeta titulo="Bajas y reducciones" hint="Clientes que dejaron de estar cubiertos en el periodo y contratos que se renovaron con menos">
          <p style={{ margin: '0 0 8px', fontSize: 13 }}>
            Dejaron de estar cubiertos: <strong>{bajas.total}</strong>
            {bajas.clientes.length > 0 && <span style={{ color: '#718096' }}> ({bajas.clientes.map((b) => b.cliente).join(', ')})</span>}
          </p>
          <p style={{ margin: '0 0 6px', fontSize: 13 }}>
            Renovaron con menos servicios o menor valor: <strong>{reducciones.total}</strong>
          </p>
          {reducciones.recientes.slice(0, 5).map((r) => (
            <div key={r.id} style={{ fontSize: 12.5, borderTop: '1px solid #edf2f7', padding: '5px 0' }}>
              {formatoDia(r.fecha)} · {r.cliente} — {r.motivo}
              {r.source === 'VENDEDOR' && <span style={{ color: '#a0aec0' }}> (suposición del vendedor)</span>}
              {r.source === 'CLIENTE' && <span style={{ color: '#a0aec0' }}> (lo dijo el cliente)</span>}
            </div>
          ))}
        </Tarjeta>

        <Tarjeta
          className="dash-span2" titulo="Retención" hint="De los clientes cubiertos por un contrato el primer día del periodo, cuántos lo siguen estando el último"
        >
          <KpiFila className="dash-kpis--cuatro">
            <Contador titulo="Clientes retenidos" valor={pct(retencion.clientes.tasa)} color="#2f855a"
              detalle={`${retencion.clientes.retenidos} de ${retencion.clientes.cohorte} que estaban al inicio`} />
            <Contador titulo="Renovación de contratos" valor={pct(retencion.renovacion.tasa)} color="#2b6cb0"
              detalle={`${retencion.renovacion.renovados} renovados · ${retencion.renovacion.vencidosSinRenovar} sin renovar · ${retencion.renovacion.cancelados} cancelados`} />
            <Contador titulo="Retención bruta (dinero)" valor={pct(retencion.dinero.retencionBruta)} color="#2f855a"
              detalle="Lo que se conserva sin contar lo que crece" />
            <Contador titulo="Retención neta (dinero)" valor={pct(retencion.dinero.retencionNeta)} color="#2b6cb0"
              detalle="Contando lo que crece (más de 100% = se vende más a los mismos)" />
          </KpiFila>
          <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#a0aec0' }}>
            Valor mensual de ese grupo: de {dinero(retencion.dinero.mrrInicial)} a {dinero(retencion.dinero.mrrFinal)}.
            {retencion.dinero.clientesSinValor > 0 && ` ${retencion.dinero.clientesSinValor} clientes se dejaron fuera del dinero por no tener valor registrado.`}
          </p>
        </Tarjeta>
      </div>
    </div>
  );
}
