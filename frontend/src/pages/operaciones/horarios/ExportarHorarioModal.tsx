import { useState } from 'react';
import { FileSpreadsheet, FileText, X } from 'lucide-react';

type Formato = 'excel' | 'pdf';

const OPCIONES: { valor: Formato; titulo: string; detalle: string; icono: typeof FileText }[] = [
  { valor: 'excel', titulo: 'Excel', detalle: 'Para editarlo o compartirlo como hoja de cálculo.', icono: FileSpreadsheet },
  { valor: 'pdf', titulo: 'PDF', detalle: 'Para imprimirlo o enviarlo tal cual.', icono: FileText },
];

/**
 * Un solo botón «Exportar» en el horario (2026-11-16): antes había «Exportar PDF» y «Exportar Excel» sueltos.
 * Se elige el formato aquí y se descarga.
 */
export default function ExportarHorarioModal({
  onExportar,
  onClose,
}: {
  onExportar: (formato: Formato) => Promise<void>;
  onClose: () => void;
}) {
  const [formato, setFormato] = useState<Formato>('excel');
  const [exportando, setExportando] = useState(false);

  const exportar = async () => {
    setExportando(true);
    try {
      await onExportar(formato);
      onClose();
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Exportar horario</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div role="radiogroup" aria-label="Formato" style={{ display: 'grid', gap: 10 }}>
            {OPCIONES.map(({ valor, titulo, detalle, icono: Icono }) => {
              const activo = formato === valor;
              return (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  aria-label={`${titulo}: ${detalle}`}
                  onClick={() => setFormato(valor)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '12px 14px', borderRadius: 10,
                    border: `2px solid ${activo ? 'var(--primary-color, #2b6cb0)' : '#e2e8f0'}`,
                    background: activo ? '#ebf8ff' : '#fff', cursor: 'pointer',
                  }}
                >
                  <Icono size={22} aria-hidden="true" style={{ flex: 'none', color: activo ? 'var(--primary-color, #2b6cb0)' : '#718096' }} />
                  <span>
                    <strong style={{ display: 'block', fontSize: '0.9rem' }}>{titulo}</strong>
                    <span style={{ fontSize: '0.78rem', color: '#718096' }}>{detalle}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="button" className="auth-btn" onClick={exportar} disabled={exportando}>
              {exportando ? 'Preparando…' : 'Exportar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
