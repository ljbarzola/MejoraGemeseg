import { useState } from 'react';
import { REVIEW_COLORS } from './reviewStatus';

interface Props {
  entries: any[];
  loading?: boolean;
}

export default function DocumentReviewHistory({ entries, loading }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: '20px' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontSize: '0.95rem', fontWeight: 600, color: 'var(--azul-oscuro)',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}
      >
        {open ? '▾' : '▸'} 📜 Historial de revisiones ({entries.length})
      </button>

      {open && (
        <div style={{ marginTop: '12px' }}>
          {loading ? (
            <div className="loading-state">Cargando historial...</div>
          ) : entries.length === 0 ? (
            <div className="empty-state">Aún no hay revisiones registradas para este empleado.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#718096' }}>
                    <th style={{ padding: '8px 6px' }}>Fecha</th>
                    <th style={{ padding: '8px 6px' }}>Documento</th>
                    <th style={{ padding: '8px 6px' }}>Acción</th>
                    <th style={{ padding: '8px 6px' }}>Motivo</th>
                    <th style={{ padding: '8px 6px' }}>Revisado por</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e: any) => {
                    const color = REVIEW_COLORS[e.toStatus] || REVIEW_COLORS.PENDIENTE;
                    return (
                      <tr key={e.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                        <td style={{ padding: '8px 6px', color: '#718096', whiteSpace: 'nowrap' }}>
                          {new Date(e.createdAt).toLocaleString('es-EC')}
                        </td>
                        <td style={{ padding: '8px 6px', color: 'var(--azul-oscuro)' }}>{e.documentTypeName}</td>
                        <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                          {e.fromStatus && (
                            <span style={{ color: '#a0aec0', fontSize: '0.78rem' }}>{e.fromStatus} → </span>
                          )}
                          <span style={{
                            padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600,
                            background: color.bg, color: color.fg,
                          }}>
                            {e.toStatus}
                          </span>
                        </td>
                        <td style={{ padding: '8px 6px', color: '#4a5568' }}>{e.reason || '—'}</td>
                        <td style={{ padding: '8px 6px', color: '#4a5568' }}>{e.performer?.fullName || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
