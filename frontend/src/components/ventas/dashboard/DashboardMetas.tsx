import { useCallback, useEffect, useState } from 'react';
import {
  getMetasCumplimiento,
  type CumplimientoMeta,
  type EstadoMeta,
  type MetasCumplimiento,
  type TarjetasMeta,
  type TipoMeta,
} from '../../../services/ventas.service';
import { useSortableTable } from '../../../hooks/useSortableTable';
import { Cargando, SinDatos, Tarjeta, dinero } from './DashboardBits';

const TIPOS: { key: TipoMeta; titulo: string; hint: string; corto: string }[] = [
  { key: 'MONTO', titulo: 'Ventas en dólares', hint: 'Monto cotizado de las oportunidades aceptadas en el periodo', corto: 'Ventas (USD)' },
  { key: 'CLIENTES_NUEVOS', titulo: 'Clientes nuevos', hint: 'Empresas o personas que compran por primera vez', corto: 'Clientes nuevos' },
  { key: 'IMPACTOS', titulo: 'Impactos', hint: 'Cada oportunidad aceptada cuenta como un impacto', corto: 'Impactos' },
];

const COLOR: Record<EstadoMeta, string> = {
  VERDE: '#2f855a',
  AMARILLO: '#b7791f',
  ROJO: '#c53030',
  SIN_META: '#a0aec0',
};

const valor = (tipo: TipoMeta, v: number | null) =>
  v === null ? '—' : tipo === 'MONTO' ? dinero(v) : v.toLocaleString('en-US', { maximumFractionDigits: 0 });
const porcentaje = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`);

function BarraMeta({ c, ritmo }: { c: CumplimientoMeta; ritmo: number | null }) {
  const ancho = c.pct === null ? 0 : Math.min(100, Math.max(c.pct > 0 ? 2 : 0, c.pct));
  return (
    <div
      className="meta-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, c.pct ?? 0))}
      title={ritmo !== null ? `La marca gris es dónde deberías ir hoy (${Math.round(ritmo * 100)} % del periodo)` : undefined}
    >
      <div className="meta-barra-relleno" style={{ width: `${ancho}%`, background: COLOR[c.estado] }} />
      {ritmo !== null && c.meta !== null && <span className="meta-barra-ritmo" style={{ left: `${Math.min(100, ritmo * 100)}%` }} />}
    </div>
  );
}

function TarjetaMeta({ tipo, c, ritmo }: { tipo: (typeof TIPOS)[number]; c: CumplimientoMeta; ritmo: number | null }) {
  const brecha = c.brecha;
  return (
    <Tarjeta titulo={tipo.titulo} hint={tipo.hint}>
      <div className="meta-cifra" style={{ color: COLOR[c.estado] }}>{valor(tipo.key, c.avance)}</div>
      <BarraMeta c={c} ritmo={ritmo} />
      <p className="meta-linea">
        {c.meta === null
          ? 'Sin meta fijada para este periodo'
          : <>Meta: <strong>{valor(tipo.key, c.meta)}</strong>{c.pct !== null && <> · <strong>{porcentaje(c.pct)}</strong> cumplido</>}</>}
      </p>
      {brecha !== null && (
        <p className="meta-linea meta-linea--suave">
          {brecha > 0
            ? <>Faltan {valor(tipo.key, brecha)}</>
            : brecha === 0 ? <>Meta cumplida</> : <>Superaste la meta por {valor(tipo.key, -brecha)}</>}
        </p>
      )}
    </Tarjeta>
  );
}

// Fila de la meta de la empresa que ve un vendedor (o gerencia cuando mira a una sola persona).
function MetaEmpresa({ global, ritmo }: { global: TarjetasMeta; ritmo: number | null }) {
  return (
    <Tarjeta titulo="Meta de la empresa" hint="Lo que se espera de toda la empresa en este periodo">
      <div className="meta-empresa">
        {TIPOS.map((t) => {
          const c = global[t.key];
          return (
            <div key={t.key} className="meta-empresa-fila">
              <div className="meta-empresa-cab">
                <span>{t.corto}</span>
                <strong>
                  {valor(t.key, c.avance)}{c.meta !== null && <> de {valor(t.key, c.meta)}</>}
                  {c.pct !== null && <> · {porcentaje(c.pct)}</>}
                </strong>
              </div>
              <BarraMeta c={c} ritmo={ritmo} />
            </div>
          );
        })}
      </div>
    </Tarjeta>
  );
}

type FilaVendedor = { id: number; nombre: string; tarjetas: TarjetasMeta };

function TablaVendedores({ filas, total }: { filas: FilaVendedor[]; total: TarjetasMeta }) {
  const campos: Record<string, (f: FilaVendedor) => string | number | null> = { nombre: (f) => f.nombre };
  for (const t of TIPOS) {
    campos[`${t.key}_meta`] = (f) => f.tarjetas[t.key].meta;
    campos[`${t.key}_avance`] = (f) => f.tarjetas[t.key].avance;
    campos[`${t.key}_pct`] = (f) => f.tarjetas[t.key].pct;
  }
  const { filas: ordenadas, thProps, SortIcon } = useSortableTable(filas, campos, 'nombre');
  return (
    <div className="tasks-table-wrapper">
      <table className="tasks-table meta-tabla">
        <thead>
          <tr>
            <th rowSpan={2} {...thProps('nombre')}>Persona <SortIcon campo="nombre" /></th>
            {TIPOS.map((t) => <th key={t.key} colSpan={3} className="meta-grupo">{t.corto}</th>)}
          </tr>
          <tr>
            {TIPOS.flatMap((t) => [
              <th key={`${t.key}m`} {...thProps(`${t.key}_meta`)}>Meta <SortIcon campo={`${t.key}_meta`} /></th>,
              <th key={`${t.key}a`} {...thProps(`${t.key}_avance`)}>Avance <SortIcon campo={`${t.key}_avance`} /></th>,
              <th key={`${t.key}p`} {...thProps(`${t.key}_pct`)}>% <SortIcon campo={`${t.key}_pct`} /></th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f) => (
            <tr key={f.id}>
              <td><span className="truncate" style={{ fontWeight: 600 }}>{f.nombre}</span></td>
              {TIPOS.flatMap((t) => {
                const c = f.tarjetas[t.key];
                return [
                  <td key={`${t.key}m`}>{valor(t.key, c.meta)}</td>,
                  <td key={`${t.key}a`}>{valor(t.key, c.avance)}</td>,
                  <td key={`${t.key}p`} style={{ color: COLOR[c.estado], fontWeight: 700 }}>{porcentaje(c.pct)}</td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="meta-total">
            <td>Total</td>
            {TIPOS.flatMap((t) => {
              const c = total[t.key];
              return [
                <td key={`${t.key}m`}>{valor(t.key, c.meta)}</td>,
                <td key={`${t.key}a`}>{valor(t.key, c.avance)}</td>,
                <td key={`${t.key}p`} style={{ color: COLOR[c.estado] }}>{porcentaje(c.pct)}</td>,
              ];
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Pestaña «Metas» del Dashboard: avance contra la meta del periodo que ya eligió la barra de arriba. Gerencia,
// mirando a toda la empresa, ve además una fila por persona; un vendedor ve su meta y la de la empresa.
// Las metas se fijan en Configuración → Metas (no hay atajo aquí a propósito: la configuración vive en un solo lugar).
export default function DashboardMetas({
  alcance, desde, hasta, atajo,
}: { alcance: string; desde: string; hasta: string; atajo: string }) {
  const [datos, setDatos] = useState<MetasCumplimiento | null>(null);
  const [error, setError] = useState(false);

  // Lo que eligió la persona en «Periodo»; «Mes pasado» es un mes. Con «90 días» o fechas sueltas no hay meta.
  const pista = atajo === 'semana' ? 'semana' : atajo === 'mes' || atajo === 'mes_pasado' ? 'mes' : atajo === 'anio' ? 'anio' : 'ninguno';

  const cargar = useCallback(async () => {
    setError(false);
    try {
      setDatos(await getMetasCumplimiento({ alcance, desde, hasta, periodo: pista }));
    } catch {
      setError(true);
    }
  }, [alcance, desde, hasta, pista]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!datos) return <Cargando error={error} onReintentar={cargar} />;

  const miraAUno = datos.alcance.vendedorId !== null;

  return (
    <div className="dash-pila">
      {!datos.periodo ? (
        <div className="dash-aviso" role="status">
          <span>
            Para ver el <strong>cumplimiento</strong> elige «Esta semana», «Este mes», «Mes pasado» o «Este año» en el periodo.
            Con este rango solo se muestran las cifras, sin meta.
          </span>
        </div>
      ) : (
        <p className="meta-periodo">
          <strong>{datos.etiquetaPeriodo}</strong>
          {datos.ritmo !== null && datos.ritmo < 1 && <> · va el {Math.round(datos.ritmo * 100)} % del periodo</>}
        </p>
      )}

      {datos.periodo && !datos.hayMetas && (
        <div className="dash-aviso" role="status">
          <span>Gerencia aún no fijó metas para este periodo. Cuando lo haga, aquí verás cuánto llevas y cuánto falta.</span>
        </div>
      )}

      <div className="dash-grid dash-grid--3">
        {TIPOS.map((t) => <TarjetaMeta key={t.key} tipo={t} c={datos.tarjetas[t.key]} ritmo={datos.periodo ? datos.ritmo : null} />)}
      </div>

      {datos.sinMonto > 0 && (
        <p className="meta-nota">
          {datos.sinMonto === 1 ? '1 venta aceptada no tiene' : `${datos.sinMonto} ventas aceptadas no tienen`} monto cotizado:
          cuenta como impacto, pero no suma dólares.
        </p>
      )}

      {miraAUno && datos.global && datos.hayMetas && <MetaEmpresa global={datos.global} ritmo={datos.periodo ? datos.ritmo : null} />}

      {datos.vendedores && datos.total && (
        <Tarjeta titulo="Cumplimiento por persona" hint="Meta y avance de cada vendedor en el periodo; el total suma las filas">
          {datos.vendedores.length === 0 ? <SinDatos texto="No hay personas para mostrar." /> : <TablaVendedores filas={datos.vendedores} total={datos.total} />}
        </Tarjeta>
      )}
    </div>
  );
}
