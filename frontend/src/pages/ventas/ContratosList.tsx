import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getContracts, deleteContract, SalesContract } from '../../services/ventas.service';

export default function ContratosList() {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => { loadContracts(); }, []);

  const loadContracts = async () => {
    try {
      const data = await getContracts(filter ? { status: filter } : undefined);
      setContracts(data);
    } catch { /* */ }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este contrato?')) return;
    try { await deleteContract(id); loadContracts(); } catch { /* */ }
  };

  const statusColors: Record<string, string> = {
    DRAFT: '#f59e0b', GENERATING: '#3b82f6', READY: '#10b981',
    SENT: '#8b5cf6', SIGNED: '#059669', CANCELLED: '#ef4444',
  };

  const statusLabels: Record<string, string> = {
    DRAFT: 'Borrador', GENERATING: 'Generando', READY: 'Listo',
    SENT: 'Enviado', SIGNED: 'Firmado', CANCELLED: 'Cancelado',
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Contratos</h2>
        <button onClick={() => navigate('/ventas/contratos/nuevo')}
          style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          + Nuevo Contrato
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['', 'DRAFT', 'READY', 'SENT', 'SIGNED'].map(s => (
          <button key={s} onClick={() => { setFilter(s); }}
            style={{ padding: '4px 12px', borderRadius: 12, border: filter === s ? '2px solid #1a1a2e' : '1px solid #ddd', background: filter === s ? '#f0f0f8' : '#fff', cursor: 'pointer', fontSize: 11, fontWeight: filter === s ? 700 : 400 }}>
            {s ? statusLabels[s] : 'Todos'}
          </button>
        ))}
      </div>

      {/* List */}
      {contracts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#888', background: '#fff', borderRadius: 8 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
          <div>No hay contratos aún</div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {contracts.map(c => (
            <div key={c.id} onClick={() => navigate(`/ventas/contratos/${c.id}`)}
              style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>#{c.id} — {c.clientName}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{c.clientEmail} · {c.template?.name}</div>
              </div>
              <span style={{ padding: '3px 10px', borderRadius: 12, background: statusColors[c.status] || '#888', color: '#fff', fontSize: 10, fontWeight: 600 }}>
                {statusLabels[c.status] || c.status}
              </span>
              <span style={{ fontSize: 11, color: '#aaa' }}>{new Date(c.createdAt).toLocaleDateString('es-EC')}</span>
              <button onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #e55', background: '#fff', color: '#c33', cursor: 'pointer', fontSize: 11 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
