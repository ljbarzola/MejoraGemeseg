import { useState } from 'react';
import { X, Download, GripVertical } from 'lucide-react';
import { exportGuardiasPdf } from '../../services/entidades.service';

interface Column {
  key: string;
  label: string;
}

interface Props {
  columns: Column[];
  rows: Record<string, string | number | null>[];
  onClose: () => void;
}

const DEFAULT_SELECTED = ['name', 'cedula', 'entidad', 'tipo', 'estado'];

// Columnas cuyo valor debe conservarse tal cual en Excel (con ceros a la
// izquierda incluidos) — Excel reinterpreta un CSV con comillas como número
// si "parece" uno, y se come los ceros iniciales de una cédula. El truco
// `="valor"` fuerza a Excel a tratarlo como texto literal.
const PRESERVE_AS_TEXT = new Set(['cedula']);

function toCsvValue(key: string, value: unknown): string {
  const str = String(value ?? '');
  const escaped = str.replace(/"/g, '""');
  if (PRESERVE_AS_TEXT.has(key)) return `"=""${escaped}"""`;
  return `"${escaped}"`;
}

// Exporta el listado de guardias ya filtrado en la vista, respetando las
// columnas que el usuario elija Y EL ORDEN en el que las arrastre. CSV se
// genera 100% en el navegador (mismo patrón sin dependencias que
// VentasReportes.tsx); PDF se genera en el backend con html-pdf-node porque
// necesita un motor de render real para quedar bien paginado.
export default function GuardiasExportModal({ columns, rows, onClose }: Props) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>(
    DEFAULT_SELECTED.filter((k) => columns.some((c) => c.key === k)),
  );
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const columnByKey = new Map(columns.map((c) => [c.key, c]));
  const activeColumns = selectedKeys.map((k) => columnByKey.get(k)!).filter(Boolean);
  const availableColumns = columns.filter((c) => !selectedKeys.includes(c.key));

  const addColumn = (key: string) => setSelectedKeys((prev) => [...prev, key]);
  const removeColumn = (key: string) => setSelectedKeys((prev) => prev.filter((k) => k !== key));

  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setSelectedKeys((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(null);
  };

  const handleExportCsv = () => {
    const headers = activeColumns.map((c) => toCsvValue('_header', c.label));
    const csvRows = rows.map((r) => activeColumns.map((c) => toCsvValue(c.key, r[c.key])).join(','));
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...csvRows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Listado_Guardias_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPdf = async () => {
    const blob = await exportGuardiasPdf(activeColumns, rows);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Listado_Guardias_${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (activeColumns.length === 0) { setError('Selecciona al menos una columna.'); return; }
    setError('');
    setExporting(true);
    try {
      if (format === 'csv') handleExportCsv();
      else await handleExportPdf();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo generar el archivo.');
    } finally {
      setExporting(false);
    }
  };

  const previewRows = rows.slice(0, 5);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" style={{ maxWidth: '820px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Download size={17} /> Exportar Listado de Guardias
          </h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: '#718096' }}>
            Se exportarán los <strong>{rows.length}</strong> guardia(s) que están visibles con los filtros aplicados en la vista, con las columnas y el orden que definas aquí.
          </p>

          {error && <div className="form-error" style={{ marginBottom: '12px' }}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
            <div>
              <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>Disponibles</p>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', minHeight: '160px', maxHeight: '220px', overflowY: 'auto', padding: '6px' }}>
                {availableColumns.length === 0 ? (
                  <p style={{ fontSize: '0.78rem', color: '#a0aec0', padding: '8px' }}>Ya agregaste todas las columnas.</p>
                ) : (
                  availableColumns.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => addColumn(c.key)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', marginBottom: '2px',
                        background: 'none', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--azul-oscuro)',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f7fafc'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                    >
                      + {c.label}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div>
              <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>
                Seleccionadas <span style={{ fontWeight: 400, color: '#a0aec0' }}>(arrastra para ordenar)</span>
              </p>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', minHeight: '160px', maxHeight: '220px', overflowY: 'auto', padding: '6px' }}>
                {activeColumns.length === 0 ? (
                  <p style={{ fontSize: '0.78rem', color: '#a0aec0', padding: '8px' }}>Agrega columnas desde la izquierda.</p>
                ) : (
                  activeColumns.map((c, index) => (
                    <div
                      key={c.key}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', marginBottom: '2px',
                        background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'grab', fontSize: '0.82rem',
                      }}
                    >
                      <GripVertical size={13} color="#cbd5e0" style={{ flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{c.label}</span>
                      <button
                        type="button"
                        onClick={() => removeColumn(c.key)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e0', fontSize: '0.9rem', padding: 0 }}
                        title="Quitar"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>Formato</p>
            <div style={{ display: 'flex', gap: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="radio" name="format" checked={format === 'csv'} onChange={() => setFormat('csv')} /> CSV
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="radio" name="format" checked={format === 'pdf'} onChange={() => setFormat('pdf')} /> PDF
              </label>
            </div>
          </div>

          <div>
            <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>
              Vista previa {rows.length > 5 && <span style={{ fontWeight: 400, color: '#a0aec0' }}>(primeras 5 filas de {rows.length})</span>}
            </p>
            {activeColumns.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: '#a0aec0' }}>Selecciona al menos una columna para ver la vista previa.</p>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead>
                    <tr style={{ background: '#f7fafc' }}>
                      {activeColumns.map((c) => (
                        <th key={c.key} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i}>
                        {activeColumns.map((c) => (
                          <td key={c.key} style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{String(r[c.key] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={handleExport} disabled={exporting || activeColumns.length === 0}>
            {exporting ? 'Generando...' : `Exportar ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
