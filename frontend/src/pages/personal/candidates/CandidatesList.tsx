import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCandidates, getKanbanColumns, moveCandidate } from '../../../services/personal.service';

export default function CandidatesList() {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [movingId, setMovingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([getCandidates(), getKanbanColumns()])
      .then(([cands, cols]) => {
        setCandidates(cands);
        setColumns(cols);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleColumnChange = async (candidateId: number, columnIdStr: string) => {
    const columnId = columnIdStr ? Number(columnIdStr) : null;
    setMovingId(candidateId);
    try {
      await moveCandidate(candidateId, columnId);
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? { ...c, columnId } : c)),
      );
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error al cambiar de columna');
    } finally {
      setMovingId(null);
    }
  };

  const filtered = candidates.filter(c =>
    c.fullName.toLowerCase().includes(search.toLowerCase()) ||
    c.cedula.includes(search) ||
    c.positionApplied.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/personal')}>← Volver</button>
          <div>
            <p className="page-eyebrow">PERSONAL</p>
            <h1>Candidatos</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => navigate('/personal/candidates/new')}>+ Nuevo Candidato</button>
      </div>

      <div className="admin-section">
        <div className="filter-bar" style={{ marginBottom: '16px' }}>
          <input
            type="text"
            placeholder="Buscar por nombre, cédula o puesto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.9rem', width: '300px' }}
          />
        </div>

        {loading ? (
          <div className="loading-state">Cargando candidatos...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No hay candidatos registrados.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Cédula</th>
                  <th>Puesto Aspirado</th>
                  <th>Teléfono</th>
                  <th>Estado</th>
                  <th className="no-print"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.fullName}</td>
                    <td style={{ fontFamily: 'monospace' }}>{c.cedula}</td>
                    <td>{c.positionApplied}</td>
                    <td>{c.phone || '—'}</td>
                    <td>
                      <select
                        value={c.columnId || ''}
                        disabled={movingId === c.id}
                        onChange={(e) => handleColumnChange(c.id, e.target.value)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e0',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          background: '#f7fafc',
                        }}
                      >
                        <option value="">Sin columna</option>
                        {columns.map((col) => (
                          <option key={col.id} value={col.id}>
                            {col.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="no-print">
                      <button className="btn-sm-edit" onClick={() => navigate(`/personal/candidates/${c.id}`)}>Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
