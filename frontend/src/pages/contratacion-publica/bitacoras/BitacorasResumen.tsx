import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ClipboardCheck, FileText, ShieldCheck } from 'lucide-react';
import DonutChart from '../../../components/common/DonutChart';
import { getResumenBitacoras } from '../../../services/bitacoras.service';
import type { FiltrosBitacoras, ResumenBitacoras } from '../../../types/bitacoras';
import { COLOR_CATEGORIA, SEVERIDAD_COLOR, SEVERIDAD_LABEL, TIPO_HALLAZGO_LABEL, fechaConDia, fechaLarga } from '../../../utils/bitacoras';
import { mensajeError } from '../../../utils/entregasCp';

/** Tarjeta de KPI: ícono a la izquierda, en la misma fila que el valor (UX §18). */
function Kpi({ icono, valor, etiqueta, nota, color }: { icono: ReactNode; valor: string | number; etiqueta: string; nota?: string; color?: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 16, padding: '16px 18px', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ color: color ?? 'var(--azul-oscuro)', flexShrink: 0 }}>{icono}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '1.7rem', fontWeight: 800, color: color ?? 'var(--azul-oscuro)', lineHeight: 1.1 }}>{valor}</div>
        <div style={{ fontSize: '0.78rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{etiqueta}</div>
        {nota && <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: 2 }}>{nota}</div>}
      </div>
    </div>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div style={{ background: 'white', borderRadius: 16, padding: '18px 20px', boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: 'var(--azul-oscuro)' }}>{titulo}</h3>
      {children}
    </div>
  );
}

/** Filas con barra horizontal: el nombre y la cantidad van escritos, la barra solo ayuda a comparar. */
function Barras({ filas, vacio }: { filas: { clave: string; etiqueta: ReactNode; cantidad: number; nota?: string }[]; vacio: string }) {
  const max = Math.max(1, ...filas.map((f) => f.cantidad));
  if (filas.length === 0) return <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>{vacio}</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {filas.map((f) => (
        <div key={f.clave}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '0.85rem' }}>
            <span style={{ minWidth: 0 }}>{f.etiqueta}</span>
            <strong>{f.cantidad}</strong>
          </div>
          <div style={{ height: 8, background: '#edf2f7', borderRadius: 4, marginTop: 3 }}>
            <div style={{ width: `${(f.cantidad / max) * 100}%`, height: '100%', background: '#2a78d6', borderRadius: 4 }} />
          </div>
          {f.nota && <div style={{ fontSize: '0.74rem', color: '#718096', marginTop: 2 }}>{f.nota}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * Resumen de las novedades que dejan las bitácoras y de cómo cuadran con el
 * horario: cuál es la novedad que más se repite, qué día hubo más, en qué
 * puesto, y qué hallazgos siguen abiertos.
 */
export default function BitacorasResumen({ filtros }: { filtros: FiltrosBitacoras }) {
  const [datos, setDatos] = useState<ResumenBitacoras | null>(null);
  const [error, setError] = useState('');

  const { entidadId, contratoId, puestoId, desde, hasta } = filtros;
  useEffect(() => {
    setDatos(null);
    setError('');
    getResumenBitacoras({ entidadId, contratoId, puestoId, desde, hasta })
      .then(setDatos)
      .catch((err) => setError(mensajeError(err, 'No se pudo cargar el resumen.')));
  }, [entidadId, contratoId, puestoId, desde, hasta]);

  if (error) return <div className="form-error">{error}</div>;
  if (!datos) return <div className="loading-state">Cargando resumen…</div>;

  const t = datos.totales;
  if (t.bitacoras === 0) {
    return (
      <div className="empty-state">
        No hay bitácoras entre el {fechaLarga(datos.desde)} y el {fechaLarga(datos.hasta)}. Sube la primera con «Subir bitácora»
        o cambia el período en los filtros.
      </div>
    );
  }

  const conNovedad = datos.categorias.filter((c) => c.codigo !== 'SIN_NOVEDAD');
  const sinNovedad = datos.categorias.find((c) => c.codigo === 'SIN_NOVEDAD')?.cantidad ?? 0;
  const masRepetida = conNovedad[0];
  const diaPico = datos.diasConMasNovedades[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: '0.85rem', color: '#718096' }}>
        Del {fechaLarga(datos.desde)} al {fechaLarga(datos.hasta)}.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        <Kpi icono={<FileText size={26} />} valor={t.bitacoras} etiqueta="Bitácoras" nota={`${t.conformes} conformes · ${t.aRevisar} a revisar · ${t.conErrores} con errores`} />
        <Kpi
          icono={<ShieldCheck size={26} />}
          valor={t.cumplimiento === null ? '—' : `${t.cumplimiento}%`}
          etiqueta="Cuadran con el horario"
          nota={t.sinComparar ? `${t.sinComparar} sin poder compararse` : 'de las que se compararon'}
          color={t.cumplimiento === null ? undefined : t.cumplimiento >= 90 ? '#276749' : t.cumplimiento >= 70 ? '#c05621' : '#c53030'}
        />
        <Kpi icono={<AlertTriangle size={26} />} valor={t.hallazgosAbiertos} etiqueta="Hallazgos abiertos" nota={t.hallazgosAltos ? `${t.hallazgosAltos} de gravedad alta` : 'ninguno de gravedad alta'} color={t.hallazgosAltos ? '#c53030' : undefined} />
        <Kpi icono={<ClipboardCheck size={26} />} valor={t.novedades} etiqueta="Novedades registradas" nota={sinNovedad ? `y ${sinNovedad} ${sinNovedad === 1 ? 'anotación' : 'anotaciones'} «sin novedad»` : undefined} />
      </div>

      {(masRepetida || diaPico) && (
        <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 12, padding: '12px 16px', fontSize: '0.92rem', color: '#2a4365' }}>
          {masRepetida && (
            <div>La novedad que más se repite es <strong>{masRepetida.etiqueta.toLowerCase()}</strong> ({masRepetida.cantidad} {masRepetida.cantidad === 1 ? 'vez' : 'veces'}).</div>
          )}
          {diaPico && (
            <div>El día con más novedades fue el <strong>{fechaConDia(diaPico.fecha)}</strong> ({diaPico.cantidad}{diaPico.graves ? `, ${diaPico.graves} grave${diaPico.graves === 1 ? '' : 's'}` : ''}).</div>
          )}
          {datos.puestosConMasNovedades[0] && (
            <div>El puesto con más novedades es <strong>{datos.puestosConMasNovedades[0].puestoNombre}</strong> ({datos.puestosConMasNovedades[0].entidadNombre}).</div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <Tarjeta titulo="Novedades por tipo">
          <DonutChart
            centerLabel="novedades"
            emptyText="Todavía no hay novedades registradas."
            ariaLabel="Novedades por tipo"
            segments={conNovedad.map((c) => ({ key: c.codigo, label: c.etiqueta, value: c.cantidad, color: COLOR_CATEGORIA[c.codigo] }))}
          />
        </Tarjeta>

        <Tarjeta titulo="Días con más novedades">
          <Barras
            vacio="No hay novedades en este período."
            filas={datos.diasConMasNovedades.map((d) => ({
              clave: d.fecha,
              etiqueta: fechaConDia(d.fecha),
              cantidad: d.cantidad,
              nota: d.graves ? `${d.graves} de gravedad alta` : undefined,
            }))}
          />
        </Tarjeta>

        <Tarjeta titulo="Novedades por día de la semana">
          <Barras vacio="No hay novedades en este período." filas={datos.porDiaSemana.map((d) => ({ clave: d.dia, etiqueta: d.dia, cantidad: d.cantidad }))} />
        </Tarjeta>

        <Tarjeta titulo="Puestos con más novedades">
          <Barras
            vacio="No hay novedades en este período."
            filas={datos.puestosConMasNovedades.map((p) => ({ clave: String(p.puestoId), etiqueta: <>{p.puestoNombre} <span style={{ color: '#718096' }}>· {p.entidadNombre}</span></>, cantidad: p.cantidad }))}
          />
        </Tarjeta>

        <Tarjeta titulo="Hallazgos abiertos por tipo">
          <Barras
            vacio="No hay hallazgos abiertos. Todo lo comparado cuadra."
            filas={datos.hallazgosPorTipo.map((h) => ({ clave: h.tipo, etiqueta: TIPO_HALLAZGO_LABEL[h.tipo] ?? h.tipo, cantidad: h.cantidad }))}
          />
        </Tarjeta>

        <Tarjeta titulo="Novedades que conviene mirar">
          {datos.novedadesGraves.length === 0 ? (
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem' }}>No hay incidentes ni fallas de equipos en este período.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {datos.novedadesGraves.map((n) => (
                <Link key={n.id} to={`/contratacion-publica/bitacoras/${n.bitacoraId}`} className="enlace-tabla" style={{ display: 'block' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="status-badge" style={{ background: SEVERIDAD_COLOR[n.gravedad].bg, color: SEVERIDAD_COLOR[n.gravedad].fg }}>{SEVERIDAD_LABEL[n.gravedad]}</span>
                    <span style={{ fontSize: '0.8rem', color: '#718096' }}>{fechaLarga(n.fecha)}{n.hora ? ` ${n.hora}` : ''} · {n.puestoNombre}</span>
                  </div>
                  <div style={{ fontSize: '0.88rem', marginTop: 2 }}>{n.texto}</div>
                </Link>
              ))}
            </div>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
