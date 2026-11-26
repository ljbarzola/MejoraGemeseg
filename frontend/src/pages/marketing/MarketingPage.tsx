import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import ExportTableButton from '../../components/common/ExportTableButton';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import ErrorAviso from '../../components/marketing/ErrorAviso';
import EstadoMarketing from '../../components/marketing/EstadoMarketing';
import MarketingAyuda from '../../components/marketing/MarketingAyuda';
import NuevaCampaniaModal from '../../components/marketing/NuevaCampaniaModal';
import { estadoMarketing, fechaMarketing } from '../../components/marketing/marketingEtiquetas';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import { aprobarCampania, eliminarCampania, listarCampanias } from '../../services/marketing.service';
import type { MarketingCampaniaResumen } from '../../types/marketing';
import '../../styles/marketing.css';

// «Campaña» es la columna fija; las demás las elige cada persona con «Columnas».
const COLUMNAS = [
  { key: 'estado', label: 'Estado' },
  { key: 'piezas', label: 'Piezas aprobadas' },
  { key: 'fecha', label: 'Creada' },
];
const COLUMNAS_POR_DEFECTO = COLUMNAS.map((c) => c.key);
const COLUMNAS_EXPORTAR = [{ key: 'nombre', label: 'Campaña' }, { key: 'idea', label: 'Lo que se pidió' }, { key: 'objetivo', label: 'Objetivo' }, ...COLUMNAS];

// El nombre corto lo pone la IA; las campañas viejas sin nombre muestran la idea.
const nombreDe = (c: MarketingCampaniaResumen) => c.nombre || c.idea;

export default function MarketingPage() {
  const navigate = useNavigate();
  const [campanias, setCampanias] = useState<MarketingCampaniaResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nueva, setNueva] = useState<{ idea: string; objetivo: string } | null>(null);
  const [eliminando, setEliminando] = useState<MarketingCampaniaResumen | null>(null);
  const [ayuda, setAyuda] = useState(false);
  const [params, setParams] = useSearchParams();

  // Otras pantallas (radar, calendario) abren el asistente con «?nueva=1&idea=...».
  useEffect(() => {
    if (params.get('nueva') !== '1') return;
    setNueva({ idea: params.get('idea') || '', objetivo: '' });
    setParams({}, { replace: true });
  }, [params, setParams]);

  const tablaRef = useResizableColumns('marketing-campanias');
  const columnPrefs = useColumnPreferences('marketing-campanias', COLUMNAS_POR_DEFECTO);
  const visibles = columnPrefs.visible.filter((k) => COLUMNAS.some((c) => c.key === k));
  const cf = useColumnFilters<MarketingCampaniaResumen>(campanias, [
    { key: 'nombre', etiqueta: 'Campaña', tipo: 'texto', getValue: (c) => `${nombreDe(c)} ${c.idea} ${c.objetivo || ''}` },
    { key: 'estado', etiqueta: 'Estado', tipo: 'texto', getValue: (c) => estadoMarketing(c.estado).texto },
    { key: 'piezas', etiqueta: 'Piezas aprobadas', tipo: 'numero', getValue: (c) => c.aprobadas, formato: (n) => String(n) },
    { key: 'fecha', etiqueta: 'Creada', tipo: 'fecha', getValue: (c) => c.createdAt },
  ]);
  const { filas, thProps, ordenDe } = useSortableTable(
    cf.filas,
    {
      nombre: (c) => nombreDe(c),
      estado: (c) => estadoMarketing(c.estado).texto,
      piezas: (c) => c.aprobadas,
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
        description="Cada campaña tiene su plan, sus piezas para cada canal, su calendario y su publicación. Todo queda en borrador hasta que una persona apruebe."
        actions={
          <>
            <button
              type="button"
              className="btn-secondary btn-icon-toolbar"
              onClick={() => setAyuda(true)}
              title="Cómo funciona Marketing"
              aria-label="Cómo funciona Marketing"
            >
              <HelpCircle size={18} />
            </button>
            <button className="auth-btn" onClick={() => setNueva({ idea: '', objetivo: '' })}>
              + Nueva campaña
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
              <ColumnPickerMenu
                columns={COLUMNAS}
                visible={columnPrefs.visible}
                pinned={columnPrefs.pinned}
                maxPinned={columnPrefs.maxPinned}
                fixedLabel="Campaña"
                onApply={(keys, fijas) => columnPrefs.set(keys, fijas)}
              />
              <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
              <ExportTableButton
                titulo="Campañas de marketing"
                columns={COLUMNAS_EXPORTAR}
                defaultKeys={['nombre', ...visibles]}
                rows={filas}
                getValue={(c, key) => {
                  switch (key) {
                    case 'nombre': return nombreDe(c);
                    case 'idea': return c.idea;
                    case 'objetivo': return c.objetivo || '';
                    case 'estado': return estadoMarketing(c.estado).texto;
                    case 'piezas': return `${c.aprobadas} de ${c.piezas}`;
                    default: return fechaMarketing(c.createdAt);
                  }
                }}
              />
            </div>
          </div>
          <ChipsFiltros cf={cf} />
          <div className="admin-section">
            <div className="tasks-table-wrapper">
              <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
                <thead>
                  <tr>
                    <th {...thProps('nombre')}>Campaña <ColumnFilter cf={cf} col="nombre" orden={ordenDe('nombre')} /></th>
                    {visibles.map((k) => (
                      <th key={k} {...thProps(k)}>
                        {COLUMNAS.find((c) => c.key === k)!.label} <ColumnFilter cf={cf} col={k} orden={ordenDe(k)} />
                      </th>
                    ))}
                    <th className="col-acciones col-acciones--ancha"><span className="visually-hidden">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filas.length === 0 && (
                    <FilaSinResultados columnas={2 + visibles.length} mensaje="No hay campañas que coincidan con los filtros." onLimpiar={cf.limpiar} />
                  )}
                  {filas.map((c) => (
                    <tr key={c.id}>
                      <td title={c.idea}>
                        <strong>{nombreDe(c)}</strong>
                        {c.objetivo && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{c.objetivo}</div>}
                      </td>
                      {visibles.map((k) => (
                        <td key={k}>
                          {k === 'estado' ? <EstadoMarketing estado={c.estado} />
                            : k === 'piezas' ? `${c.aprobadas} de ${c.piezas}`
                            : fechaMarketing(c.createdAt)}
                        </td>
                      ))}
                      <td className="col-acciones col-acciones--ancha">
                        <div className="acciones-iconos" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn-secondary marketing-fila-boton" onClick={() => navigate(`/marketing/campanias/${c.id}`)}>Ver plan</button>
                          <RowActionsMenu
                            actions={[
                              {
                                label: 'Duplicar idea',
                                hint: 'Armar otra campaña con la misma idea.',
                                onClick: () => setNueva({ idea: c.idea, objetivo: c.objetivo || '' }),
                              },
                              {
                                label: 'Eliminar campaña',
                                hint: 'Borra la campaña, sus piezas y los archivos generados.',
                                danger: true,
                                onClick: () => setEliminando(c),
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

      {eliminando && (
        <ConfirmDialog
          title="Eliminar campaña"
          confirmLabel="Eliminar"
          danger
          message={
            <ul className="marketing-confirmar">
              <li>Se borra «{nombreDe(eliminando)}» con su plan, sus piezas y las imágenes o videos generados.</li>
              <li>No se puede deshacer.</li>
            </ul>
          }
          onConfirm={() => {
            const c = eliminando;
            setEliminando(null);
            eliminarCampania(c.id).then(load).catch((err: any) => {
              setError(err.response?.data?.message || 'No se pudo eliminar la campaña.');
            });
          }}
          onCancel={() => setEliminando(null)}
        />
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

