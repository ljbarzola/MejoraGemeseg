import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import ExportTableButton from '../../components/common/ExportTableButton';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import ErrorAviso from '../../components/marketing/ErrorAviso';
import MarketingAyuda from '../../components/marketing/MarketingAyuda';
import {
  etiquetaCanal,
  etiquetaTipo,
  fechaMarketing,
} from '../../components/marketing/marketingEtiquetas';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import { listarBiblioteca, type PiezaBiblioteca } from '../../services/marketing.service';
import '../../styles/marketing.css';

// «Pieza» es la columna fija; las demás las elige cada persona con «Columnas».
const COLUMNAS = [
  { key: 'campania', label: 'Campaña' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'canal', label: 'Canal' },
  { key: 'fecha', label: 'Aprobada' },
];
const COLUMNAS_POR_DEFECTO = COLUMNAS.map((c) => c.key);
const COLUMNAS_EXPORTAR = [{ key: 'pieza', label: 'Pieza' }, { key: 'contenido', label: 'Contenido' }, ...COLUMNAS];

export default function MarketingBibliotecaPage() {
  const navigate = useNavigate();
  const [piezas, setPiezas] = useState<PiezaBiblioteca[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ayuda, setAyuda] = useState(false);
  const [copiada, setCopiada] = useState<number | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tablaRef = useResizableColumns('marketing-biblioteca');
  const columnPrefs = useColumnPreferences('marketing-biblioteca', COLUMNAS_POR_DEFECTO);
  const visibles = columnPrefs.visible.filter((k) => COLUMNAS.some((c) => c.key === k));
  const cf = useColumnFilters<PiezaBiblioteca>(piezas, [
    { key: 'pieza', etiqueta: 'Pieza', tipo: 'texto', getValue: (p) => `${p.titulo || etiquetaTipo(p.tipo)} ${p.contenido}` },
    { key: 'campania', etiqueta: 'Campaña', tipo: 'texto', getValue: (p) => p.campania },
    { key: 'tipo', etiqueta: 'Tipo', tipo: 'texto', getValue: (p) => etiquetaTipo(p.tipo) },
    { key: 'canal', etiqueta: 'Canal', tipo: 'texto', getValue: (p) => etiquetaCanal(p.canal) },
    { key: 'fecha', etiqueta: 'Aprobada', tipo: 'fecha', getValue: (p) => p.aprobadoEn || p.createdAt },
  ]);
  const { filas, thProps, ordenDe } = useSortableTable(
    cf.filas,
    {
      pieza: (p) => p.titulo || etiquetaTipo(p.tipo),
      campania: (p) => p.campania,
      tipo: (p) => etiquetaTipo(p.tipo),
      canal: (p) => etiquetaCanal(p.canal),
      fecha: (p) => new Date(p.aprobadoEn || p.createdAt).getTime(),
    },
    'fecha',
    'desc',
  );

  useEffect(() => {
    // Solo las aprobadas: es lo que dice la pantalla y lo que sirve para copiar o exportar.
    listarBiblioteca('APROBADO')
      .then(setPiezas)
      .catch((err: any) => setError(err.response?.data?.message || 'No se pudo cargar la biblioteca.'))
      .finally(() => setLoading(false));
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  const copiar = async (pieza: PiezaBiblioteca) => {
    try {
      await navigator.clipboard.writeText(pieza.contenido);
      setCopiada(pieza.id);
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => setCopiada(null), 2000);
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
          <button
            type="button"
            className="btn-secondary btn-icon-toolbar"
            onClick={() => setAyuda(true)}
            title="Cómo funciona la Biblioteca"
            aria-label="Cómo funciona la Biblioteca"
          >
            <HelpCircle size={18} />
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
              <ColumnPickerMenu
                columns={COLUMNAS}
                visible={columnPrefs.visible}
                pinned={columnPrefs.pinned}
                maxPinned={columnPrefs.maxPinned}
                fixedLabel="Pieza"
                onApply={(keys, fijas) => columnPrefs.set(keys, fijas)}
              />
              <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
              <ExportTableButton
                titulo="Biblioteca de marketing"
                columns={COLUMNAS_EXPORTAR}
                defaultKeys={['pieza', ...visibles]}
                rows={filas}
                getValue={(p, key) => {
                  switch (key) {
                    case 'pieza': return p.titulo || etiquetaTipo(p.tipo);
                    case 'contenido': return p.contenido;
                    case 'campania': return p.campania;
                    case 'tipo': return etiquetaTipo(p.tipo);
                    case 'canal': return etiquetaCanal(p.canal);
                    default: return fechaMarketing(p.aprobadoEn || p.createdAt);
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
                    <th {...thProps('pieza')}>Pieza <ColumnFilter cf={cf} col="pieza" orden={ordenDe('pieza')} /></th>
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
                    <FilaSinResultados columnas={2 + visibles.length} mensaje="No hay piezas que coincidan con los filtros." onLimpiar={cf.limpiar} />
                  )}
                  {filas.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.titulo || etiquetaTipo(p.tipo)}</strong>
                        <span className="truncate marketing-extracto" title={p.contenido}>{p.contenido}</span>
                      </td>
                      {visibles.map((k) => (
                        <td key={k}>
                          {k === 'campania' ? p.campania
                            : k === 'tipo' ? etiquetaTipo(p.tipo)
                            : k === 'canal' ? etiquetaCanal(p.canal)
                            : fechaMarketing(p.aprobadoEn || p.createdAt)}
                        </td>
                      ))}
                      <td className="col-acciones col-acciones--ancha">
                        <div className="acciones-iconos" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn-secondary marketing-fila-boton" onClick={() => copiar(p)}>
                            {copiada === p.id ? 'Copiado' : 'Copiar'}
                          </button>
                          <RowActionsMenu
                            actions={[
                              {
                                label: 'Ver plan',
                                hint: 'Abre la campaña a la que pertenece esta pieza.',
                                onClick: () => navigate(`/marketing/campanias/${p.campaignId}`),
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
      {ayuda && <MarketingAyuda onClose={() => setAyuda(false)} />}
    </div>
  );
}
