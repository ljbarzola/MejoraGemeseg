import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, HelpCircle } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import ErrorAviso from '../../components/marketing/ErrorAviso';
import MarketingAyuda from '../../components/marketing/MarketingAyuda';
import MarketingProgreso from '../../components/marketing/MarketingProgreso';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import {
  aprobarCampania,
  crearCampania,
  listarCampanias,
} from '../../services/marketing.service';
import type { MarketingCampaniaDetalle, MarketingCampaniaResumen } from '../../types/marketing';
import '../../styles/marketing.css';

const OBJETIVOS = [
  'Dar a conocer un servicio',
  'Generar contactos',
  'Reactivar clientes',
  'Promocionar una oferta',
];

export default function MarketingPage() {
  const navigate = useNavigate();
  const [campanias, setCampanias] = useState<MarketingCampaniaResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nueva, setNueva] = useState<{ idea: string; objetivo: string } | null>(null);
  const [ayuda, setAyuda] = useState(false);

  const tablaRef = useResizableColumns('marketing-campanias');
  const cf = useColumnFilters<MarketingCampaniaResumen>(campanias, [
    { key: 'idea', etiqueta: 'Campaña', tipo: 'texto', getValue: (c) => `${c.idea} ${c.objetivo || ''}` },
    { key: 'estado', etiqueta: 'Estado', tipo: 'texto', getValue: (c) => c.estado },
    { key: 'piezas', etiqueta: 'Piezas', tipo: 'numero', getValue: (c) => c.piezas, formato: (n) => String(n) },
    { key: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', getValue: (c) => c.createdAt },
  ]);
  const { filas, thProps, ordenDe } = useSortableTable(
    cf.filas,
    {
      idea: (c) => c.idea,
      estado: (c) => c.estado,
      piezas: (c) => c.piezas,
      fecha: (c) => new Date(c.createdAt).getTime(),
    },
    'fecha',
    'desc',
  );

  const load = () => {
    setLoading(true);
    listarCampanias()
      .then(setCampanias)
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudieron cargar las campañas.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Marketing"
        title="Campañas"
        description="Escribe una idea y el agente arma el plan completo. Todo queda en borradores hasta que una persona apruebe."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setAyuda(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <HelpCircle size={16} /> Cómo funciona
            </button>
            <button
              className="auth-btn"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setNueva({ idea: '', objetivo: '' })}
            >
              <Plus size={16} /> + Nueva campaña
            </button>
          </>
        }
      />
      <ErrorAviso mensaje={error} />

      {loading ? (
        <div className="loading-state">Cargando campañas...</div>
      ) : campanias.length === 0 ? (
        <div className="admin-section">
          <div className="empty-state">Todavía no hay campañas. Empieza con una idea.</div>
        </div>
      ) : (
        <>
          <div className="filter-bar">
            <div className="filter-bar-fields" />
            <div className="filter-bar-actions">
              <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
            </div>
          </div>
          <ChipsFiltros cf={cf} />
          <div className="admin-section">
            <div className="tasks-table-wrapper">
              <table className="tasks-table resizable-table" ref={tablaRef}>
                <thead>
                  <tr>
                    <th {...thProps('idea')}>Campaña <ColumnFilter cf={cf} col="idea" orden={ordenDe('idea')} /></th>
                    <th {...thProps('estado')}>Estado <ColumnFilter cf={cf} col="estado" orden={ordenDe('estado')} /></th>
                    <th {...thProps('piezas')}>Piezas <ColumnFilter cf={cf} col="piezas" orden={ordenDe('piezas')} /></th>
                    <th {...thProps('fecha')}>Fecha <ColumnFilter cf={cf} col="fecha" orden={ordenDe('fecha')} /></th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.length === 0 && (
                    <FilaSinResultados columnas={5} mensaje="No hay campañas que coincidan con los filtros." onLimpiar={cf.limpiar} />
                  )}
                  {filas.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.idea}</strong>
                        {c.objetivo && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{c.objetivo}</div>}
                      </td>
                      <td>{c.estado === 'APROBADA' ? 'Aprobada' : 'En borrador'}</td>
                      <td>{c.aprobadas}/{c.piezas}</td>
                      <td>{new Date(c.createdAt).toLocaleString('es-EC')}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button className="btn-secondary" onClick={() => navigate(`/marketing/campanias/${c.id}`)}>Ver plan</button>
                          <RowActionsMenu
                            actions={[
                              {
                                label: 'Duplicar idea',
                                hint: 'Armar otra campaña con la misma idea.',
                                onClick: () => setNueva({ idea: c.idea, objetivo: c.objetivo || '' }),
                              },
                              {
                                label: 'Aprobar todo',
                                hint: 'Aprueba las piezas que no estén descartadas.',
                                disabled: c.estado === 'APROBADA',
                                onClick: () => {
                                  aprobarCampania(c.id).then(load).catch((err: any) => {
                                    setError(err.response?.data?.message || 'No se pudo aprobar la campaña.');
                                  });
                                },
                              },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {nueva && (
        <NuevaCampaniaModal
          inicial={nueva}
          onClose={() => setNueva(null)}
          onCreada={(detalle) => {
            setNueva(null);
            load();
            navigate(`/marketing/campanias/${detalle.id}`);
          }}
        />
      )}
      {ayuda && <MarketingAyuda onClose={() => setAyuda(false)} />}
    </div>
  );
}

function NuevaCampaniaModal({
  inicial,
  onClose,
  onCreada,
}: {
  inicial: { idea: string; objetivo: string };
  onClose: () => void;
  onCreada: (detalle: MarketingCampaniaDetalle) => void;
}) {
  const [idea, setIdea] = useState(inicial.idea);
  const [objetivo, setObjetivo] = useState(inicial.objetivo);
  const [generando, setGenerando] = useState(false);
  const [pasoGeneracion, setPasoGeneracion] = useState(0);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!generando) {
      setPasoGeneracion(0);
      return;
    }
    const temporizador = setInterval(() => {
      setPasoGeneracion((paso) => Math.min(paso + 1, 3));
    }, 9000);
    return () => clearInterval(temporizador);
  }, [generando]);

  const pedirArmar = () => {
    if (idea.trim().length < 4) {
      setError('Escribe la idea con al menos 4 caracteres.');
      return;
    }
    setError('');
    setConfirmando(true);
  };

  const armar = async () => {
    setGenerando(true);
    setError('');
    try {
      const detalle = await crearCampania(idea.trim(), objetivo.trim() || undefined);
      onCreada(detalle);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo armar el plan.');
    } finally {
      setGenerando(false);
    }
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '620px' }}>
          <div className="modal-header">
            <h3>Nueva campaña</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <ErrorAviso mensaje={error} />
          {generando && <MarketingProgreso paso={pasoGeneracion} />}
          <label style={{ display: 'block', marginBottom: '12px', fontSize: '0.85rem', fontWeight: 600 }}>
            ¿Qué quieres promocionar?
            <textarea
              rows={3}
              value={idea}
              maxLength={1000}
              disabled={generando}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Ej. Promocionar nuestros servicios de monitoreo"
              style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', boxSizing: 'border-box', resize: 'vertical' }}
            />
          </label>
          <div style={{ marginBottom: '14px' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>Objetivo (opcional)</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {OBJETIVOS.map((o) => (
                <button
                  key={o}
                  className={objetivo === o ? 'auth-btn' : 'btn-secondary'}
                  disabled={generando}
                  onClick={() => setObjetivo(objetivo === o ? '' : o)}
                  style={{ padding: '7px 10px', fontSize: '0.8rem' }}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={pedirArmar} disabled={generando}>
            {generando ? 'Armando plan...' : 'Armar plan'}
          </button>
        </div>
      </div>
    </div>
    {confirmando && (
      <ConfirmDialog
          title="Crear plan de Marketing"
          confirmLabel="Crear plan"
          message={
            <>
              <div></div>
              <div></div>
            </>
          }
          onConfirm={() => {
            setConfirmando(false);
            armar();
          }}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </>
  );
}
