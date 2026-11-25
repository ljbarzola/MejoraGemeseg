import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, HelpCircle, X } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import PageTabs from '../../components/common/PageTabs';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import MarketingProgreso from '../../components/marketing/MarketingProgreso';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import ErrorAviso from '../../components/marketing/ErrorAviso';
import MarketingAyuda from '../../components/marketing/MarketingAyuda';
import {
  aprobarCampania,
  crearCampania,
  descartarPieza,
  editarPieza,
  getCampania,
  regenerarCampania,
  desaprobarCampania,
  generarImagenPieza,
  descargarImagenPieza,
  listarEnviosDeCampana,
  prepararEnvios,
  omitirEnvio,
} from '../../services/marketing.service';
import type { MarketingCampaniaDetalle, MarketingEnvio, MarketingPieza } from '../../types/marketing';
import '../../styles/marketing.css';

type TabKey = 'resumen' | 'piezas' | 'calendario' | 'medicion' | 'envios';

export default function MarketingCampaniaPage() {
  const { id } = useParams();
  const campaniaId = Number(id);
  const navigate = useNavigate();
  const [detalle, setDetalle] = useState<MarketingCampaniaDetalle | null>(null);
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [tab, setTab] = useState<TabKey>('resumen');
  const [editando, setEditando] = useState<Record<number, string>>({});
  const [ayuda, setAyuda] = useState(false);
  const [envios, setEnvios] = useState<MarketingEnvio[]>([]);
  const [confirmandoAprobar, setConfirmandoAprobar] = useState(false);
  const [confirmandoDesaprobar, setConfirmandoDesaprobar] = useState(false);
  const [confirmandoMensajes, setConfirmandoMensajes] = useState(false);
  const [confirmandoImagen, setConfirmandoImagen] = useState<MarketingPieza | null>(null);
  const [confirmandoDuplicar, setConfirmandoDuplicar] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [guardados, setGuardados] = useState<Record<number, boolean>>({});
  const [accionTexto, setAccionTexto] = useState('');

  useEffect(() => {
    getCampania(campaniaId)
      .then(setDetalle)
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar la campaña.'));
  }, [campaniaId]);

  useEffect(() => {
    if (tab !== 'envios') return;
    listarEnviosDeCampana(campaniaId)
      .then(setEnvios)
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar la cola de envíos.'));
  }, [tab, campaniaId]);

  const accion = async (
    fn: () => Promise<MarketingCampaniaDetalle>,
    mensaje: string,
    texto = 'Guardando cambios...',
  ) => {
    setProcesando(true);
    setAccionTexto(texto);
    setError('');
    try {
      setDetalle(await fn());
    } catch (err: any) {
      setError(err.response?.data?.message || mensaje);
    } finally {
      setProcesando(false);
      setAccionTexto('');
    }
  };

  const guardarPieza = async (pieza: MarketingPieza) => {
    setProcesando(true);
    setAccionTexto('Guardando el texto de la pieza...');
    setError('');
    try {
      setDetalle(await editarPieza(pieza.id, editando[pieza.id] ?? pieza.contenido, pieza.titulo || undefined));
      setEditando((prev) => {
        const copia = { ...prev };
        delete copia[pieza.id];
        return copia;
      });
      setGuardados((prev) => ({ ...prev, [pieza.id]: true }));
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo guardar la pieza.');
    } finally {
      setProcesando(false);
      setAccionTexto('');
    }
  };

  const copiar = async (valor: string) => {
    try {
      await navigator.clipboard.writeText(valor);
    } catch {
      setError('El navegador no permitió copiar. Selecciona el texto y cópialo a mano.');
    }
  };

  const duplicar = async () => {
    if (!detalle) return;
    await accion(
      () => crearCampania(detalle.idea, detalle.objetivo || undefined),
      'No se pudo duplicar la campaña.',
    );
  };

  const aprobar = () => accion(() => aprobarCampania(campaniaId), 'No se pudo aprobar la campaña.', 'Aprobando y guardando el plan...');

  const desaprobar = () => accion(
    () => desaprobarCampania(campaniaId),
    'No se pudo quitar la aprobación.',
    'Quitando la aprobación...',
  );
  const regenerar = async (mensaje?: string) => {
    setRegenerando(false);
    setProcesando(true);
    setAccionTexto('Regenerando el plan: rearmando la estrategia y las piezas...');
    setError('');
    try {
      setDetalle(await regenerarCampania(campaniaId, mensaje));
      setTab('resumen');
      setGuardados({});
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo regenerar el plan.');
    } finally {
      setProcesando(false);
      setAccionTexto('');
    }
  };

  const generarImagen = (pieza: MarketingPieza) =>
    accion(() => generarImagenPieza(pieza.id), 'No se pudo generar la imagen.', 'Generando la imagen con IA...');

  const verImagen = async (pieza: MarketingPieza) => {
    try {
      const url = await descargarImagenPieza(pieza.id);
      window.open(url, '_blank');
    } catch {
      setError('No se pudo abrir la imagen.');
    }
  };

  const preparar = async () => {
    setProcesando(true);
    setAccionTexto('Preparando la cola de envíos...');
    setError('');
    try {
      setEnvios(await prepararEnvios(campaniaId));
      setTab('envios');
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo preparar la cola de envíos.');
    } finally {
      setProcesando(false);
      setAccionTexto('');
    }
  };

  const omitir = async (envioId: number) => {
    setProcesando(true);
    setAccionTexto('Actualizando la cola de envíos...');
    try {
      setEnvios(await omitirEnvio(envioId));
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo omitir el envío.');
    } finally {
      setProcesando(false);
      setAccionTexto('');
    }
  };

  const secciones: Array<[string, string | null]> = [
    ['Resumen', detalle?.plan?.resumen ?? null],
    ['Público', detalle?.plan?.publico ?? null],
    ['Mercado', detalle?.plan?.mercado ?? null],
    ['Canales', detalle?.plan?.canales ?? null],
    ['Presupuesto', detalle?.plan?.presupuesto ?? null],
    ['Avisos', detalle?.plan?.advertencias ?? null],
  ];

  return (
    <div className="page-container">
      <div className="page-header-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <button
          className="cacao-back-btn"
          onClick={() => navigate('/marketing')}
          style={{ alignSelf: 'flex-start' }}
        >
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver
        </button>
        <PageHeader
          eyebrow="Marketing"
          title={detalle?.idea || 'Campaña'}
          description={
            <>
              {detalle?.objetivo ? `Objetivo: ${detalle.objetivo}` : 'Plan generado a partir de una idea.'}
              {detalle?.estado === 'APROBADA' && <strong> · Aprobada</strong>}
            </>
          }
          actions={
            <>
              <button className="btn-secondary" onClick={() => setAyuda(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <HelpCircle size={16} /> Cómo funciona
              </button>
              {detalle?.estado === 'APROBADA' && (
                <>
                  <button
                    className="btn-secondary"
                    onClick={() => setConfirmandoMensajes(true)}
                    disabled={procesando}
                    title="Deja los textos listos para copiar. No envía nada a clientes."
                  >
                    Generar mensajes (sin envío)
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => setConfirmandoDesaprobar(true)}
                    disabled={procesando}
                  >
                    Quitar aprobación
                  </button>
                </>
              )}
              <RowActionsMenu
                boton={{ texto: 'Más acciones', className: 'btn-secondary' }}
                actions={[
                  { label: 'Duplicar idea', hint: 'Armar otra campaña con la misma idea.', onClick: () => setConfirmandoDuplicar(true), disabled: !detalle || procesando },
                  { label: 'Regenerar plan', hint: 'Vuelve a generar el plan y las piezas; puedes pedir cambios.', onClick: () => setRegenerando(true), disabled: !detalle || procesando || detalle.estado === 'APROBADA' },
                ]}
              />
              <button
                className="auth-btn"
                onClick={() => setConfirmandoAprobar(true)}
                disabled={procesando || !detalle || detalle.estado === 'APROBADA'}
              >
                Aprobar todo
              </button>
            </>
          }
        />
      </div>

      <PageTabs<TabKey>
        label="Partes del plan"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'resumen', label: 'Resumen' },
          { key: 'piezas', label: `Piezas (${detalle?.piezas.length ?? 0})` },
          { key: 'calendario', label: 'Calendario' },
          { key: 'medicion', label: 'Medición' },
          { key: 'envios', label: `Envíos (${envios.length})` },
        ]}
      />
      <ErrorAviso mensaje={error} />
      {accionTexto && <MarketingProgreso texto={accionTexto} />}

      {!detalle ? (
        <div className="loading-state">Cargando plan...</div>
      ) : tab === 'resumen' ? (
        <div className="admin-section" style={{ padding: '18px' }}>
          {secciones.map(([titulo, valor]) => valor && (
            <section className="marketing-plan-section" key={titulo}>
              <h4>{titulo}</h4>
              <p>{valor}</p>
            </section>
          ))}
          {!detalle.plan && <p style={{ color: '#64748b' }}>Esta campaña todavía no tiene plan guardado.</p>}
        </div>
      ) : tab === 'piezas' ? (
        <div className="admin-section" style={{ padding: '18px' }}>
          {detalle.piezas.length === 0 && <p style={{ color: '#64748b' }}>No se generaron piezas.</p>}
          {detalle.piezas.map((p: MarketingPieza) => {
            const clase = p.estado === 'APROBADO'
              ? 'marketing-pieza marketing-pieza-aprobada'
              : p.estado === 'DESCARTADO'
                ? 'marketing-pieza marketing-pieza-descartada'
                : 'marketing-pieza';
            const hayCambios = editando[p.id] !== undefined && editando[p.id] !== p.contenido;
            return (
              <section className={clase} key={p.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.86rem' }}>{p.titulo || p.tipo} · {p.canal || 'general'}</strong>
                  <span style={{ fontSize: '0.74rem', color: '#64748b' }}>{p.estado.toLowerCase()}</span>
                </div>
                <textarea
                  rows={4}
                  value={editando[p.id] ?? p.contenido}
                  disabled={p.estado === 'DESCARTADO' || procesando}
                  onChange={(e) => {
                    setEditando((prev) => ({ ...prev, [p.id]: e.target.value }));
                    setGuardados((prev) => ({ ...prev, [p.id]: false }));
                  }}
                  style={{ width: '100%', marginTop: '8px', padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', boxSizing: 'border-box', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                  <button
                    className="btn-secondary"
                    disabled={procesando || p.estado === 'DESCARTADO' || !hayCambios}
                    title="Guarda el texto editado en esta pieza. No aprueba ni envía nada."
                    onClick={() => guardarPieza(p)}
                  >
                    Guardar cambios
                  </button>
                  {guardados[p.id] && !hayCambios && (
                    <span style={{ fontSize: '0.76rem', color: '#2f855a', alignSelf: 'center' }}>Guardado</span>
                  )}
                  <button className="btn-secondary" disabled={procesando} onClick={() => copiar(editando[p.id] ?? p.contenido)}>
                    Copiar
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={procesando || p.estado === 'DESCARTADO'}
                    onClick={() => accion(() => descartarPieza(p.id), 'No se pudo descartar la pieza.')}
                  >
                    Descartar
                  </button>
                  {p.tipo === 'imagen' && (
                    p.archivoUrl ? (
                      <button className="btn-secondary" disabled={procesando} onClick={() => verImagen(p)}>
                        Ver imagen
                      </button>
                    ) : (
                      <button
                        className="btn-secondary"
                        disabled={procesando || p.estado === 'DESCARTADO'}
                        onClick={() => setConfirmandoImagen(p)}
                      >
                        Generar imagen
                      </button>
                    )
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : tab === 'calendario' ? (
        <div className="admin-section" style={{ padding: '18px' }}>
          {detalle.plan?.calendario ? (
            <section className="marketing-plan-section">
              <h4>Calendario propuesto</h4>
              <p>{detalle.plan.calendario}</p>
            </section>
          ) : (
            <p style={{ color: '#64748b' }}>El plan no trajo un calendario.</p>
          )}
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '14px' }}>
            Es el calendario que propuso el agente. Las fechas de publicación se confirmarán cuando el módulo pueda publicar.
          </p>
        </div>
      ) : tab === 'medicion' ? (
        <div className="admin-section" style={{ padding: '18px' }}>
          {detalle.plan?.kpis ? (
            <section className="marketing-plan-section">
              <h4>Qué medir</h4>
              <p>{detalle.plan.kpis}</p>
            </section>
          ) : (
            <p style={{ color: '#64748b' }}>El plan no trajo KPIs.</p>
          )}
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '14px' }}>
            Todavía no hay resultados: esta parte mostrará contactos, cotizaciones y conversiones cuando los envíos estén activos.
          </p>
        </div>
      ) : (
        <div className="admin-section" style={{ padding: '18px' }}>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '14px' }}>
            Cola de envíos preparada a partir de las piezas aprobadas. Nada se ha enviado: falta la decisión legal y la verificación de Meta.
          </p>
          {envios.length === 0 ? (
            <p style={{ color: '#64748b' }}>Todavía no hay mensajes. Aprueba la campaña y pulsa «Generar mensajes (sin envío)».</p>
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Pieza</th>
                    <th>Canal</th>
                    <th>Estado</th>
                    <th>Motivo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {envios.map((e) => (
                    <tr key={e.id}>
                      <td>{e.pieza || `Pieza ${e.pieceId}`}</td>
                      <td>{e.canal}</td>
                      <td>{e.estado.toLowerCase()}</td>
                      <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{e.motivo}</td>
                      <td>
                        <button
                          className="btn-secondary"
                          disabled={procesando || e.estado === 'OMITIDO'}
                          onClick={() => omitir(e.id)}
                        >
                          Omitir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {confirmandoAprobar && (
        <ConfirmDialog
          title="Aprobar campaña"
          confirmLabel="Aprobar y guardar"
          message={
            <>
              <div></div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                <li>Las piezas que no descartaste quedarán marcadas como aprobadas.</li>
                <li>Se guardará el plan y se creará una tarea y una notificación para ti.</li>
                <li>Si la empresa tiene carpeta de Marketing en Drive, se subirá el kit del plan.</li>
              </ul>
              <div></div>
            </>
          }
          onConfirm={() => {
            setConfirmandoAprobar(false);
            aprobar();
          }}
          onCancel={() => setConfirmandoAprobar(false)}
        />
      )}
      {confirmandoDesaprobar && (
        <ConfirmDialog
          title="Quitar aprobación"
          confirmLabel="Quitar aprobación"
          message={
            <>
              <div></div>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                <li>Las piezas aprobadas vuelven a borrador.</li>
                <li>Se borra la cola de mensajes que hubieras preparado.</li>
                <li>Podrás editar, regenerar y volver a aprobar cuando quieras.</li>
              </ul>
            </>
          }
          onConfirm={() => {
            setConfirmandoDesaprobar(false);
            desaprobar();
          }}
          onCancel={() => setConfirmandoDesaprobar(false)}
        />
      )}
      {confirmandoMensajes && (
        <ConfirmDialog
          title="Generar mensajes"
          confirmLabel="Generar mensajes"
          message={
            <>
              <div></div>
              <div></div>
            </>
          }
          onConfirm={() => {
            setConfirmandoMensajes(false);
            preparar();
          }}
          onCancel={() => setConfirmandoMensajes(false)}
        />
      )}
      {confirmandoImagen && (
        <ConfirmDialog
          title="Generar imagen con IA"
          confirmLabel="Generar imagen"
          message={
            <>
              <div></div>
              <div></div>
            </>
          }
          onConfirm={() => {
            const pieza = confirmandoImagen;
            setConfirmandoImagen(null);
            if (pieza) generarImagen(pieza);
          }}
          onCancel={() => setConfirmandoImagen(null)}
        />
      )}
      {confirmandoDuplicar && (
        <ConfirmDialog
          title="Duplicar campaña"
          confirmLabel="Crear campaña"
          message={
            <>
              <div></div>
              <div></div>
            </>
          }
          onConfirm={() => {
            setConfirmandoDuplicar(false);
            duplicar();
          }}
          onCancel={() => setConfirmandoDuplicar(false)}
        />
      )}
      {regenerando && (
        <RegenerarModal
          onClose={() => setRegenerando(false)}
          onRegenerar={(mensaje) => regenerar(mensaje)}
        />
      )}
      {ayuda && <MarketingAyuda onClose={() => setAyuda(false)} />}
    </div>
  );
}

const EJEMPLOS_FEEDBACK = [
  'Enfócate en empresas industriales',
  'Menos texto y más foco en imágenes',
  'Usa solo WhatsApp y correo',
  'Tono más formal',
  'Añade un llamado a agendar una visita',
];

function RegenerarModal({
  onClose,
  onRegenerar,
}: {
  onClose: () => void;
  onRegenerar: (feedback: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px' }}>
          <div className="modal-header">
            <h3>Regenerar plan</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.88rem', color: '#475569', marginBottom: 12 }}>
            Cuéntale qué quieres cambiar. Es opcional: si lo dejas vacío, el agente vuelve a armar el plan desde cero con la misma idea.
          </p>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Ejemplos de qué pedir</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {EJEMPLOS_FEEDBACK.map((ejemplo) => (
              <button
                key={ejemplo}
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.78rem', padding: '6px 9px' }}
                onClick={() => setTexto((prev) => (prev ? `${prev}\n${ejemplo}` : ejemplo))}
              >
                {ejemplo}
              </button>
            ))}
          </div>
          <textarea
            rows={4}
            value={texto}
            maxLength={1000}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ej. Enfócate en clientes industriales y quita la parte de redes sociales."
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={() => setConfirmando(true)}>
            Regenerar plan
          </button>
        </div>
      </div>
      </div>
      {confirmando && (
        <ConfirmDialog
          title="Regenerar plan"
          confirmLabel="Regenerar plan"
          message={
            <>
              <div></div>
              <div></div>
            </>
          }
          onConfirm={() => {
            setConfirmando(false);
            onRegenerar(texto.trim());
          }}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </>
  );
}
