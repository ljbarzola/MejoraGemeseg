import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import ErrorAviso from '../../components/marketing/ErrorAviso';
import MarketingAyuda from '../../components/marketing/MarketingAyuda';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import { listarBiblioteca, type PiezaBiblioteca } from '../../services/marketing.service';
import '../../styles/marketing.css';

export default function MarketingBibliotecaPage() {
  const navigate = useNavigate();
  const [piezas, setPiezas] = useState<PiezaBiblioteca[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ayuda, setAyuda] = useState(false);

  const tablaRef = useResizableColumns('marketing-biblioteca');
  const cf = useColumnFilters<PiezaBiblioteca>(piezas, [
    { key: 'campania', etiqueta: 'Campaña', tipo: 'texto', getValue: (p) => p.campania },
    { key: 'tipo', etiqueta: 'Tipo', tipo: 'texto', getValue: (p) => p.tipo },
    { key: 'canal', etiqueta: 'Canal', tipo: 'texto', getValue: (p) => p.canal || 'general' },
    { key: 'estado', etiqueta: 'Estado', tipo: 'texto', getValue: (p) => p.estado },
    { key: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', getValue: (p) => p.createdAt },
  ]);
  const { filas, thProps, ordenDe } = useSortableTable(
    cf.filas,
    {
      campania: (p) => p.campania,
      tipo: (p) => p.tipo,
      canal: (p) => p.canal || '',
      estado: (p) => p.estado,
      fecha: (p) => new Date(p.createdAt).getTime(),
    },
    'fecha',
    'desc',
  );

  useEffect(() => {
    listarBiblioteca()
      .then(setPiezas)
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar la biblioteca.'))
      .finally(() => setLoading(false));
  }, []);

  const copiar = async (valor: string) => {
    try {
      await navigator.clipboard.writeText(valor);
    } catch {
      setError('El navegador no permitió copiar. Selecciona el texto y cópialo a mano.');
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Marketing"
        title="Biblioteca"
        description="Las piezas aprobadas de todas las campañas, listas para copiar o exportar."
        actions={
          <button className="btn-secondary" onClick={() => setAyuda(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <HelpCircle size={16} /> Cómo funciona
          </button>
        }
      />
      <ErrorAviso mensaje={error} />

      {loading ? (
        <div className="loading-state">Cargando biblioteca...</div>
      ) : piezas.length === 0 ? (
        <div className="admin-section">
          <div className="empty-state">Todavía no hay piezas aprobadas. Aprueba una campaña para verlas aquí.</div>
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
                    <th {...thProps('campania')}>Campaña <ColumnFilter cf={cf} col="campania" orden={ordenDe('campania')} /></th>
                    <th {...thProps('tipo')}>Tipo <ColumnFilter cf={cf} col="tipo" orden={ordenDe('tipo')} /></th>
                    <th {...thProps('canal')}>Canal <ColumnFilter cf={cf} col="canal" orden={ordenDe('canal')} /></th>
                    <th {...thProps('estado')}>Estado <ColumnFilter cf={cf} col="estado" orden={ordenDe('estado')} /></th>
                    <th {...thProps('fecha')}>Fecha <ColumnFilter cf={cf} col="fecha" orden={ordenDe('fecha')} /></th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.length === 0 && (
                    <FilaSinResultados columnas={6} mensaje="No hay piezas que coincidan con los filtros." onLimpiar={cf.limpiar} />
                  )}
                  {filas.map((p) => (
                    <tr key={p.id}>
                      <td>{p.campania}</td>
                      <td>{p.tipo}</td>
                      <td>{p.canal || 'general'}</td>
                      <td>{p.estado.toLowerCase()}</td>
                      <td>{new Date(p.createdAt).toLocaleString('es-EC')}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          <button className="btn-secondary" onClick={() => copiar(p.contenido)}>Copiar</button>
                          <button className="btn-secondary" onClick={() => navigate(`/marketing/campanias/${p.campaignId}`)}>Ver plan</button>
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
      {ayuda && <MarketingAyuda onClose={() => setAyuda(false)} />}
    </div>
  );
}
