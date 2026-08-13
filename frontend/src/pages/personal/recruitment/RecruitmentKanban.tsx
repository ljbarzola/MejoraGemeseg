import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getKanbanColumns, createKanbanColumn, deleteKanbanColumn, getCandidates, moveCandidate } from '../../../services/personal.service';

const COLUMN_COLORS = ['#2b6cb0', '#276749', '#6b46c1', '#b7791f', '#c53030', '#2c7a7b'];

export default function RecruitmentKanban() {
  const navigate = useNavigate();
  const [columns, setColumns] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewColumn, setShowNewColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnColor, setNewColumnColor] = useState(COLUMN_COLORS[0]);
  const [draggedCandidate, setDraggedCandidate] = useState<any>(null);

  const load = () => {
    setLoading(true);
    Promise.all([getKanbanColumns(), getCandidates()])
      .then(([cols, cands]) => { setColumns(cols); setCandidates(cands); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) return;
    await createKanbanColumn({ name: newColumnName, color: newColumnColor });
    setNewColumnName('');
    setShowNewColumn(false);
    load();
  };

  const handleDeleteColumn = async (id: number) => {
    if (!confirm('¿Eliminar esta columna? Los candidatos se moverán a "Sin columna".')) return;
    await deleteKanbanColumn(id);
    load();
  };

  const handleDragStart = (e: React.DragEvent, candidate: any) => {
    setDraggedCandidate(candidate);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent, columnId: number | null) => {
    e.preventDefault();
    if (!draggedCandidate) return;
    await moveCandidate(draggedCandidate.id, columnId);
    setDraggedCandidate(null);
    load();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const getCandidatesForColumn = (columnId: number | null) => {
    return candidates.filter(c => columnId === null ? !c.columnId : c.columnId === columnId);
  };

  if (loading) return <div className="loading-state">Cargando tablero...</div>;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="cacao-back-btn" onClick={() => navigate('/personal')}>← Volver</button>
          <div>
            <p className="page-eyebrow">PERSONAL</p>
            <h1>Tablero de Reclutamiento</h1>
          </div>
        </div>
        <button className="auth-btn" onClick={() => navigate('/personal/candidates/new')}>+ Nuevo Candidato</button>
      </div>

      <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '16px', alignItems: 'flex-start' }}>
        {columns.sort((a, b) => a.position - b.position).map((col) => (
          <div
            key={col.id}
            onDrop={(e) => handleDrop(e, col.id)}
            onDragOver={handleDragOver}
            style={{
              minWidth: '280px', maxWidth: '320px', flex: '1 0 280px',
              background: '#f7fafc', borderRadius: '12px', border: '1px solid #e2e8f0',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: `3px solid ${col.color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ color: 'var(--azul-oscuro)' }}>{col.name}</strong>
                <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#718096' }}>
                  ({getCandidatesForColumn(col.id).length})
                </span>
              </div>
              <button onClick={() => handleDeleteColumn(col.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e0', fontSize: '1.1rem' }} title="Eliminar">×</button>
            </div>
            <div style={{ padding: '8px', flex: 1, minHeight: '100px' }}>
              {getCandidatesForColumn(col.id).map((cand) => (
                <div
                  key={cand.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, cand)}
                  onClick={() => navigate(`/personal/candidates/${cand.id}`)}
                  style={{
                    background: 'white', borderRadius: '8px', padding: '12px', marginBottom: '8px',
                    border: '1px solid #e2e8f0', cursor: 'grab', transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>{cand.fullName}</div>
                  <div style={{ fontSize: '0.8rem', color: '#718096' }}>{cand.positionApplied}</div>
                  <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '4px' }}>CI: {cand.cedula}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ minWidth: '280px', flex: '0 0 280px' }}>
          {showNewColumn ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <input
                value={newColumnName}
                onChange={e => setNewColumnName(e.target.value)}
                placeholder="Nombre de columna"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '8px' }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                {COLUMN_COLORS.map(c => (
                  <div
                    key={c}
                    onClick={() => setNewColumnColor(c)}
                    style={{
                      width: '24px', height: '24px', borderRadius: '50%', background: c, cursor: 'pointer',
                      border: newColumnColor === c ? '2px solid #1a202c' : '2px solid transparent',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="auth-btn" onClick={handleAddColumn} style={{ flex: 1 }}>Crear</button>
                <button className="btn-secondary" onClick={() => setShowNewColumn(false)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewColumn(true)}
              style={{
                width: '100%', padding: '16px', background: 'white', border: '2px dashed #cbd5e0',
                borderRadius: '12px', cursor: 'pointer', color: '#718096', fontSize: '0.9rem', fontWeight: 600,
              }}
            >
              + Agregar Columna
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
