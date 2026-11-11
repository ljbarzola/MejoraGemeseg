import { useCallback, useEffect, useMemo, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import PageTabs from '../../components/common/PageTabs';
import FormModal from '../../components/common/FormModal';
import { Tarjeta, KpiFila, Contador, SinDatos, Cargando } from '../../components/ventas/dashboard/DashboardBits';
import { usePermissions } from '../../hooks/usePermissions';
import { apiError } from '../../utils/cotizador/format';
import {
  cambiarProgresoPropuesta,
  decidirPropuesta,
  getBriefPropuesta,
  getPanelMejoraContinua,
  type AccionDecision,
  type EstadoPropuesta,
  type InformeSemanal,
  type PanelMejoraContinua,
  type Propuesta,
} from '../../services/mejora-continua.service';

type Pestana = 'propuestas' | 'semanas' | 'historial';

const ESTADO_TEXTO: Record<EstadoPropuesta, string> = {
  PENDIENTE: 'Por decidir',
  PLAN_APROBADO: 'Plan aprobado',
  CAMBIOS_PEDIDOS: 'Cambios pedidos',
  RECHAZADA: 'Rechazada',
  MAS_TARDE: 'Más tarde',
  EN_CURSO: 'En curso',
  HECHA: 'Hecha',
};

const ESTADO_COLOR: Record<EstadoPropuesta, { bg: string; fg: string }> = {
  PENDIENTE: { bg: '#feebc8', fg: '#c05621' },
  PLAN_APROBADO: { bg: '#bee3f8', fg: '#2a69ac' },
  CAMBIOS_PEDIDOS: { bg: '#e9d8fd', fg: '#6b46c1' },
  RECHAZADA: { bg: '#fed7d7', fg: '#c53030' },
  MAS_TARDE: { bg: '#edf2f7', fg: '#4a5568' },
  EN_CURSO: { bg: '#bee3f8', fg: '#2a69ac' },
  HECHA: { bg: '#c6f6d5', fg: '#276749' },
};

const NIVEL_COLOR: Record<string, string> = { ALTO: '#c05621', MEDIO: '#975a16', BAJO: '#276749' };

const FILTROS: { clave: string; texto: string; estados: EstadoPropuesta[] | null }[] = [
  { clave: 'decidir', texto: 'Por decidir', estados: ['PENDIENTE', 'CAMBIOS_PEDIDOS', 'MAS_TARDE'] },
  { clave: 'aprobadas', texto: 'Aprobadas y en curso', estados: ['PLAN_APROBADO', 'EN_CURSO'] },
  { clave: 'hechas', texto: 'Hechas', estados: ['HECHA'] },
  { clave: 'rechazadas', texto: 'Rechazadas', estados: ['RECHAZADA'] },
  { clave: 'todas', texto: 'Todas', estados: null },
];

const fechaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-EC') : '');

interface DialogoTexto {
  propuesta: Propuesta;
  accion: Extract<AccionDecision, 'PEDIR_CAMBIOS' | 'RECHAZAR'>;
}

export default function MejoraContinuaPage() {
  const { canWrite } = usePermissions();
  const puedeEscribir = canWrite('SISTEMAS');
  const [panel, setPanel] = useState<PanelMejoraContinua | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [pestana, setPestana] = useState<Pestana>('propuestas');
  const [filtro, setFiltro] = useState('decidir');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [trabajando, setTrabajando] = useState<number | null>(null);
  const [dialogo, setDialogo] = useState<DialogoTexto | null>(null);
  const [textoDialogo, setTextoDialogo] = useState('');
  const [errorDialogo, setErrorDialogo] = useState('');
  const [guardandoDialogo, setGuardandoDialogo] = useState(false);
  const [cerrando, setCerrando] = useState<Propuesta | null>(null);
  const [horas, setHoras] = useState('');
  const [ayuda, setAyuda] = useState(false);

  const cargar = useCallback(() => {
    setErrorCarga(false);
    getPanelMejoraContinua().then(setPanel).catch(() => setErrorCarga(true));
  }, []);
  useEffect(cargar, [cargar]);

  const filtrada = useMemo(() => {
    const f = FILTROS.find((x) => x.clave === filtro);
    return (panel?.propuestas ?? []).filter((p) => !f?.estados || f.estados.includes(p.estado));
  }, [panel, filtro]);

  const conteoFiltro = (estados: EstadoPropuesta[] | null) =>
    (panel?.propuestas ?? []).filter((p) => !estados || estados.includes(p.estado)).length;

  async function ejecutar(id: number, tarea: () => Promise<unknown>, exito: string) {
    setTrabajando(id);
    setAviso(null);
    try {
      await tarea();
      setAviso({ tipo: 'ok', texto: exito });
      cargar();
    } catch (err) {
      setAviso({ tipo: 'error', texto: apiError(err, 'No se pudo guardar. Inténtalo de nuevo.') });
    } finally {
      setTrabajando(null);
    }
  }

  const aprobar = (p: Propuesta) =>
    ejecutar(p.id, () => decidirPropuesta(p.id, 'APROBAR'), `Plan aprobado: «${p.titulo}». Ya puedes copiar el brief y abrir la sesión en Claude.`);
  const masTarde = (p: Propuesta) =>
    ejecutar(p.id, () => decidirPropuesta(p.id, 'MAS_TARDE'), 'Queda para más tarde.');
  const enCurso = (p: Propuesta) =>
    ejecutar(p.id, () => cambiarProgresoPropuesta(p.id, 'EN_CURSO'), 'Marcada como en curso.');

  async function copiarBrief(p: Propuesta) {
    setTrabajando(p.id);
    setAviso(null);
    try {
      const { brief } = await getBriefPropuesta(p.id);
      await navigator.clipboard.writeText(brief);
      setAviso({ tipo: 'ok', texto: 'Brief copiado. Abre una sesión nueva en Claude y pégalo para empezar los cambios.' });
    } catch (err) {
      setAviso({ tipo: 'error', texto: apiError(err, 'No se pudo copiar el brief. Inténtalo de nuevo.') });
    } finally {
      setTrabajando(null);
    }
  }

  function abrirDialogo(propuesta: Propuesta, accion: DialogoTexto['accion']) {
    setDialogo({ propuesta, accion });
    setTextoDialogo('');
    setErrorDialogo('');
  }

  async function confirmarDialogo() {
    if (!dialogo) return;
    const texto = textoDialogo.trim();
    if (!texto) {
      setErrorDialogo(dialogo.accion === 'RECHAZAR' ? 'Escribe el motivo: así el agente aprende qué no proponer.' : 'Escribe qué quieres que cambie en el plan.');
      return;
    }
    setGuardandoDialogo(true);
    setErrorDialogo('');
    try {
      await decidirPropuesta(
        dialogo.propuesta.id,
        dialogo.accion,
        dialogo.accion === 'RECHAZAR' ? { motivo: texto } : { comentario: texto },
      );
      setAviso({
        tipo: 'ok',
        texto: dialogo.accion === 'RECHAZAR'
          ? 'Rechazada. El agente no la volverá a proponer sin un motivo nuevo.'
          : 'Cambios pedidos. El agente reescribirá el plan y lo verás de nuevo por decidir.',
      });
      setDialogo(null);
      cargar();
    } catch (err) {
      setErrorDialogo(apiError(err, 'No se pudo guardar. Inténtalo de nuevo.'));
    } finally {
      setGuardandoDialogo(false);
    }
  }

  async function confirmarHecha() {
    if (!cerrando) return;
    const n = horas.trim() === '' ? undefined : Number(horas.replace(',', '.'));
    if (n !== undefined && (!Number.isFinite(n) || n < 0)) {
      setErrorDialogo('Escribe las horas como un número, por ejemplo 4 o 2,5.');
      return;
    }
    setGuardandoDialogo(true);
    setErrorDialogo('');
    try {
      await cambiarProgresoPropuesta(cerrando.id, 'HECHA', n);
      setAviso({ tipo: 'ok', texto: 'Marcada como hecha.' });
      setCerrando(null);
      cargar();
    } catch (err) {
      setErrorDialogo(apiError(err, 'No se pudo guardar. Inténtalo de nuevo.'));
    } finally {
      setGuardandoDialogo(false);
    }
  }

  const encabezado = (
    <PageHeader
      eyebrow="Sistemas"
      title="Mejora continua"
      description="Cada lunes el agente propone qué automatizar y qué idea nueva probar; tú decides. Cada viernes cierra la semana."
      actions={
        <button type="button" className="btn-secondary btn-icon-toolbar" onClick={() => setAyuda(true)} title="Cómo funciona" aria-label="Cómo funciona">
          <HelpCircle size={18} />
        </button>
      }
    />
  );

  if (!panel) {
    return (
      <div className="page-container">
        {encabezado}
        <Cargando error={errorCarga} onReintentar={cargar} />
      </div>
    );
  }

  const { resumen } = panel;
  const informesViernes = panel.informes.filter((i) => i.tipo === 'VIERNES');
  const informesLunes = panel.informes.filter((i) => i.tipo === 'LUNES');

  return (
    <div className="page-container">
      {encabezado}

      <KpiFila className="dash-kpis--cuatro">
        <Contador titulo="Por decidir" valor={resumen.porEstado.PENDIENTE + resumen.porEstado.CAMBIOS_PEDIDOS} color="#c05621" detalle="Esperan tu respuesta" onClick={() => { setPestana('propuestas'); setFiltro('decidir'); }} />
        <Contador titulo="Aprobadas y en curso" valor={`${resumen.cupo.ocupados} / ${resumen.cupo.limite}`} color="#2a78d6" detalle="Máximo a la vez" onClick={() => { setPestana('propuestas'); setFiltro('aprobadas'); }} />
        <Contador titulo="Hechas" valor={resumen.porEstado.HECHA} color="#1baf7a" detalle="Mejoras terminadas" onClick={() => { setPestana('propuestas'); setFiltro('hechas'); }} />
        <Contador titulo="Horas ahorradas al mes" valor={resumen.horasAhorradasMes} color="#6b46c1" detalle="Estimadas, de lo ya hecho" />
      </KpiFila>

      <PageTabs<Pestana>
        label="Mejora continua"
        value={pestana}
        onChange={setPestana}
        tabs={[
          { key: 'propuestas', label: 'Propuestas' },
          { key: 'semanas', label: 'Resumen semanal' },
          { key: 'historial', label: 'Historial de decisiones' },
        ]}
      />

      {aviso && (
        <div className={aviso.tipo === 'ok' ? 'form-success' : 'form-error'} role="status" style={{ marginBottom: 16 }}>
          {aviso.texto}
        </div>
      )}

      {pestana === 'propuestas' && (
        <>
          <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
            {FILTROS.map((f) => (
              <button
                key={f.clave}
                type="button"
                className={filtro === f.clave ? 'auth-btn' : 'btn-secondary'}
                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                onClick={() => setFiltro(f.clave)}
              >
                {f.texto} ({conteoFiltro(f.estados)})
              </button>
            ))}
          </div>
          {filtrada.length === 0 ? (
            <div className="admin-section">
              <SinDatos texto={panel.propuestas.length === 0
                ? 'Todavía no hay propuestas. Aparecerán aquí cuando el agente corra el próximo lunes.'
                : 'No hay propuestas en este grupo.'} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {filtrada.map((p) => (
                <TarjetaPropuesta
                  key={p.id}
                  p={p}
                  puedeEscribir={puedeEscribir}
                  ocupado={trabajando === p.id}
                  alAprobar={() => aprobar(p)}
                  alPedirCambios={() => abrirDialogo(p, 'PEDIR_CAMBIOS')}
                  alRechazar={() => abrirDialogo(p, 'RECHAZAR')}
                  alMasTarde={() => masTarde(p)}
                  alCopiarBrief={() => copiarBrief(p)}
                  alEnCurso={() => enCurso(p)}
                  alHecha={() => { setCerrando(p); setHoras(''); setErrorDialogo(''); }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {pestana === 'semanas' && (
        <div className="dash-pila">
          {informesViernes.length === 0 && informesLunes.length === 0 ? (
            <div className="admin-section"><SinDatos texto="Todavía no hay resúmenes. El primero llega el viernes a las 5 pm." /></div>
          ) : (
            [...informesViernes, ...informesLunes].map((i) => <TarjetaInforme key={i.id} informe={i} />)
          )}
        </div>
      )}

      {pestana === 'historial' && <Historial propuestas={panel.propuestas} />}

      {dialogo && (
        <FormModal
          title={dialogo.accion === 'RECHAZAR' ? 'Rechazar propuesta' : 'Pedir cambios al plan'}
          descripcion={dialogo.accion === 'RECHAZAR'
            ? `«${dialogo.propuesta.titulo}». El motivo queda en la memoria del agente para que no vuelva a proponerla.`
            : `«${dialogo.propuesta.titulo}». El agente reescribirá el plan con lo que escribas.`}
          onClose={() => setDialogo(null)}
          onSubmit={confirmarDialogo}
          submitLabel={dialogo.accion === 'RECHAZAR' ? 'Rechazar' : 'Pedir cambios'}
          saving={guardandoDialogo}
          error={errorDialogo}
        >
          <div className="form-group">
            <label htmlFor="mc-texto">{dialogo.accion === 'RECHAZAR' ? 'Motivo' : 'Qué debe cambiar'}</label>
            <textarea id="mc-texto" rows={4} value={textoDialogo} onChange={(e) => setTextoDialogo(e.target.value)} style={{ width: '100%' }} />
          </div>
        </FormModal>
      )}

      {cerrando && (
        <FormModal
          title="Marcar como hecha"
          descripcion={`«${cerrando.titulo}». Si ya sabes cuántas horas al mes se ahorran, anótalas: alimentan la cifra de Sistemas.`}
          onClose={() => setCerrando(null)}
          onSubmit={confirmarHecha}
          submitLabel="Marcar como hecha"
          saving={guardandoDialogo}
          error={errorDialogo}
        >
          <div className="form-group">
            <label htmlFor="mc-horas">Horas humanas ahorradas al mes (opcional)</label>
            <input id="mc-horas" type="text" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} placeholder={cerrando.horasAhorradasMes ? `Estimación del agente: ${cerrando.horasAhorradasMes}` : 'Ej.: 6'} style={{ width: '100%' }} />
          </div>
        </FormModal>
      )}

      {ayuda && (
        <div className="modal-overlay" onClick={() => setAyuda(false)}>
          <div className="modal modal-ventas-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Cómo funciona Mejora continua">
            <div className="modal-header"><h3>Cómo funciona Mejora continua</h3></div>
            <div className="modal-body" style={{ lineHeight: 1.55 }}>
              <ol style={{ paddingLeft: 20, margin: 0 }}>
                <li><strong>Lunes 9:00:</strong> el agente lee la documentación, tus decisiones anteriores y el uso real de la app, y deja de 3 a 5 propuestas: unas para automatizar lo que ya existe y otras ideas nuevas.</li>
                <li><strong>Tú decides:</strong> aprobar el plan, pedir cambios (el agente lo reescribe), rechazar con motivo o dejarlo para más tarde. Solo puede haber {resumen.cupo.limite} aprobadas o en curso a la vez.</li>
                <li><strong>Con el plan aprobado</strong> copias el brief y abres una sesión nueva en Claude para empezar los cambios. Nada se sube ni se despliega sin que tú pruebes y apruebes.</li>
                <li><strong>Viernes 17:00:</strong> resumen de lo mejorado, lo que faltó y lo rechazado, con las horas ahorradas estimadas.</li>
                <li><strong>Aprende:</strong> lo que rechazas (con tu motivo) y lo que apruebas queda en su memoria y guía las propuestas de la semana siguiente.</li>
              </ol>
            </div>
            <div className="modal-actions"><button className="auth-btn" onClick={() => setAyuda(false)}>Entendido</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Insignia({ texto, color }: { texto: string; color: string }) {
  return (
    <span style={{ fontSize: '0.76rem', fontWeight: 600, color, border: `1px solid ${color}`, borderRadius: 999, padding: '2px 11px', whiteSpace: 'nowrap', lineHeight: 1.5 }}>
      {texto}
    </span>
  );
}

function Bloque({ titulo, children, sinMargen }: { titulo: string; children: React.ReactNode; sinMargen?: boolean }) {
  return (
    <div style={{ marginTop: sinMargen ? 0 : 16 }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{titulo}</div>
      <div style={{ fontSize: '0.92rem', color: '#2d3748', lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

function Nota({ titulo, children, fondo, borde }: { titulo: string; children: React.ReactNode; fondo: string; borde: string }) {
  return (
    <div style={{ marginTop: 18, background: fondo, borderLeft: `4px solid ${borde}`, borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{titulo}</div>
      <div style={{ fontSize: '0.9rem', color: '#2d3748', lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

const nivel = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();

function TarjetaPropuesta({
  p, puedeEscribir, ocupado, alAprobar, alPedirCambios, alRechazar, alMasTarde, alCopiarBrief, alEnCurso, alHecha,
}: {
  p: Propuesta;
  puedeEscribir: boolean;
  ocupado: boolean;
  alAprobar: () => void;
  alPedirCambios: () => void;
  alRechazar: () => void;
  alMasTarde: () => void;
  alCopiarBrief: () => void;
  alEnCurso: () => void;
  alHecha: () => void;
}) {
  const [abierta, setAbierta] = useState(p.estado === 'PENDIENTE');
  const color = ESTADO_COLOR[p.estado];
  const decidible = p.estado === 'PENDIENTE' || p.estado === 'MAS_TARDE' || p.estado === 'CAMBIOS_PEDIDOS';
  const esIdea = p.tipo === 'IDEA_NUEVA';
  const hayDetalles = !!(p.porQueAhora || p.comoProbarBarato || p.dependeDe);
  const meta = [
    `Semana ${p.semana}`,
    p.revision > 1 ? `plan revisado ${p.revision - 1} ${p.revision - 1 === 1 ? 'vez' : 'veces'}` : '',
    p.horasAhorradasMes ? `ahorra ~${p.horasAhorradasMes} h al mes` : '',
  ].filter(Boolean).join(' · ');

  return (
    <article className="dash-card" data-tablas-vivas="off" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px 22px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 360px' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: esIdea ? '#6b46c1' : '#2a78d6' }}>
              {esIdea ? 'Idea nueva' : 'Automatizar lo actual'}
            </div>
            <h3 style={{ margin: '4px 0 0', fontSize: '1.18rem', lineHeight: 1.3, color: 'var(--azul-oscuro)' }}>{p.titulo}</h3>
            <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: 4 }}>{meta}</div>
          </div>
          <span className="status-badge" style={{ background: color.bg, color: color.fg, fontSize: '0.78rem', flex: '0 0 auto' }}>{ESTADO_TEXTO[p.estado]}</span>
        </header>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {p.impacto && <Insignia texto={`Impacto ${nivel(p.impacto)}`} color={NIVEL_COLOR[p.impacto] ?? '#4a5568'} />}
          {p.esfuerzo && <Insignia texto={`Esfuerzo ${nivel(p.esfuerzo)}`} color="#4a5568" />}
          {p.riesgo && <Insignia texto={`Riesgo ${nivel(p.riesgo)}`} color={p.riesgo === 'ALTO' ? '#c53030' : '#4a5568'} />}
          {p.lineaBlanca && <Insignia texto="Sirve para línea blanca" color="#1baf7a" />}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28, marginTop: 22, alignItems: 'start' }}>
          <div>
            {p.queSeAutomatiza && <Bloque sinMargen titulo="Qué se automatiza">{p.queSeAutomatiza}</Bloque>}
            {p.decisionHumana && <Bloque sinMargen={!p.queSeAutomatiza} titulo="Qué decisión humana desaparece">{p.decisionHumana}</Bloque>}
            {p.evidencia && (
              <Bloque sinMargen={!p.queSeAutomatiza && !p.decisionHumana} titulo="De dónde salió">
                <span style={{ color: '#4a5568' }}>{p.evidencia}</span>
              </Bloque>
            )}
          </div>
          <div style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Plan · pantalla → acción → resultado
            </div>
            <ol style={{ margin: '10px 0 0', paddingLeft: 22, fontSize: '0.92rem', color: '#2d3748', lineHeight: 1.5 }}>
              {p.plan.map((s, i) => <li key={i} style={{ marginBottom: 8 }}>{s}</li>)}
            </ol>
          </div>
        </div>

        {abierta && hayDetalles && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 28, marginTop: 22, paddingTop: 18, borderTop: '1px solid #edf2f7' }}>
            {p.porQueAhora && <Bloque sinMargen titulo="Por qué ahora">{p.porQueAhora}</Bloque>}
            {p.comoProbarBarato && <Bloque sinMargen titulo="Cómo probarlo barato primero">{p.comoProbarBarato}</Bloque>}
            {p.dependeDe && <Bloque sinMargen titulo="Depende de">{p.dependeDe}</Bloque>}
          </div>
        )}

        {p.estado === 'CAMBIOS_PEDIDOS' && p.comentarioCambios && (
          <Nota titulo="Cambios que pediste" fondo="#faf5ff" borde="#9f7aea">
            {p.comentarioCambios} <em style={{ color: '#718096' }}>(el agente los aplicará en su próxima corrida)</em>
          </Nota>
        )}
        {p.estado === 'RECHAZADA' && p.motivo && (
          <Nota titulo={`Motivo del rechazo${p.decididoEn ? ` · ${fechaCorta(p.decididoEn)}` : ''}`} fondo="#fff5f5" borde="#fc8181">
            {p.motivo}
          </Nota>
        )}
      </div>

      <footer style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', background: '#fafbfc', borderTop: '1px solid #edf2f7' }}>
        <div>
          {hayDetalles && (
            <button type="button" className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.82rem' }} onClick={() => setAbierta(!abierta)}>
              {abierta ? 'Ocultar detalles' : 'Ver más detalles'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {puedeEscribir && decidible && (
            <>
              <button type="button" className="btn-secondary" disabled={ocupado} onClick={alMasTarde}>Más tarde</button>
              <button type="button" className="btn-secondary" disabled={ocupado} onClick={alRechazar}>Rechazar</button>
              <button type="button" className="btn-secondary" disabled={ocupado} onClick={alPedirCambios}>Pedir cambios</button>
              {p.estado !== 'CAMBIOS_PEDIDOS' && (
                <button type="button" className="auth-btn" disabled={ocupado} onClick={alAprobar}>Aprobar plan</button>
              )}
            </>
          )}
          {puedeEscribir && p.estado === 'PLAN_APROBADO' && (
            <>
              <button type="button" className="btn-secondary" disabled={ocupado} onClick={alRechazar}>Rechazar</button>
              <button type="button" className="btn-secondary" disabled={ocupado} onClick={alEnCurso}>Marcar en curso</button>
              <button type="button" className="auth-btn" disabled={ocupado} onClick={alCopiarBrief}>Copiar brief para Claude</button>
            </>
          )}
          {puedeEscribir && p.estado === 'EN_CURSO' && (
            <>
              <button type="button" className="btn-secondary" disabled={ocupado} onClick={alCopiarBrief}>Copiar brief para Claude</button>
              <button type="button" className="auth-btn" disabled={ocupado} onClick={alHecha}>Marcar como hecha</button>
            </>
          )}
        </div>
      </footer>
    </article>
  );
}

function ListaCorta({ titulo, items, vacio }: { titulo: string; items: string[] | undefined; vacio?: string }) {
  if (!items || items.length === 0) {
    return vacio ? <Bloque titulo={titulo}><span style={{ color: '#718096' }}>{vacio}</span></Bloque> : null;
  }
  return (
    <Bloque titulo={titulo}>
      <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </Bloque>
  );
}

function TarjetaInforme({ informe }: { informe: InformeSemanal }) {
  const c = informe.contenido;
  const viernes = informe.tipo === 'VIERNES';
  return (
    <Tarjeta
      titulo={`${viernes ? 'Cierre de la semana' : 'Notas del lunes'} ${informe.semana}`}
      hint={`Generado el ${fechaCorta(informe.createdAt)}`}
    >
      {viernes ? (
        <>
          <ListaCorta titulo="Mejorado" items={c.mejorado} vacio="Nada terminado esta semana." />
          <ListaCorta titulo="Faltó" items={c.falto} vacio="Nada quedó pendiente." />
          <ListaCorta titulo="Rechazado" items={c.rechazado} vacio="Nada rechazado." />
          {c.aprendizaje && <Bloque titulo="Lo que aprendí">{c.aprendizaje}</Bloque>}
          {c.horasAhorradasEstimadas != null && <Bloque titulo="Horas humanas ahorradas (estimadas)">{c.horasAhorradasEstimadas}</Bloque>}
          {c.focoSugerido && <Bloque titulo="Foco sugerido para el lunes">{c.focoSugerido}</Bloque>}
        </>
      ) : (
        <>
          <ListaCorta titulo="Alertas de riesgo (aparte de las mejoras)" items={c.alertasRiesgo} vacio="Sin alertas." />
          <ListaCorta titulo="Documentos que parecen desactualizados" items={c.mdDesactualizados} />
          {c.aprendizaje && <Bloque titulo="Lo que aprendió de tus decisiones">{c.aprendizaje}</Bloque>}
        </>
      )}
      {c.modelosUsados && Object.keys(c.modelosUsados).length > 0 && (
        <Bloque titulo="Modelos usados">
          {Object.entries(c.modelosUsados).map(([etapa, modelo]) => `${etapa}: ${modelo}`).join(' · ')}
        </Bloque>
      )}
    </Tarjeta>
  );
}

const ACCION_TEXTO: Record<string, string> = {
  APROBAR: 'aprobó el plan',
  PEDIR_CAMBIOS: 'pidió cambios',
  RECHAZAR: 'rechazó',
  MAS_TARDE: 'lo dejó para más tarde',
  EN_CURSO: 'la marcó en curso',
  HECHA: 'la marcó como hecha',
  REESCRIBIO_PLAN: 'reescribió el plan',
};

function Historial({ propuestas }: { propuestas: Propuesta[] }) {
  const eventos = propuestas
    .flatMap((p) => (p.historial ?? []).map((h) => ({ ...h, titulo: p.titulo, id: p.id })))
    .sort((a, b) => b.en.localeCompare(a.en));
  return (
    <div className="admin-section">
      {eventos.length === 0 ? (
        <SinDatos texto="Aún no hay decisiones registradas." />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {eventos.map((e, i) => (
            <li key={`${e.id}-${i}`} style={{ borderBottom: '1px solid #edf2f7', paddingBottom: 8 }}>
              <div style={{ fontSize: '0.78rem', color: '#718096' }}>{fechaCorta(e.en)} · {e.por}</div>
              <div style={{ fontSize: '0.9rem' }}>
                <strong>{ACCION_TEXTO[e.accion] ?? e.accion}</strong>: «{e.titulo}»
              </div>
              {(e.motivo || e.comentario) && <div style={{ fontSize: '0.85rem', color: '#4a5568' }}>{e.motivo || e.comentario}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
