import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, FolderOpen, HelpCircle } from 'lucide-react';
import { getContracts, deleteContract, getVentasDriveConfig, SalesContract } from '../../services/ventas.service';
import { buildDriveFolderLink } from '../../utils/driveLink';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import TemplateHelpModal from '../../components/ventas/TemplateHelpModal';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useToast } from '../../contexts/ToastContext';

export default function ContratosList() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const tablaRef = useResizableColumns('ventas-contratos');

  useEffect(() => { loadContracts(); }, [filter]);

  useEffect(() => {
    getVentasDriveConfig()
      .then((c) => {
        if (c?.driveFolderId) {
          setDriveFolderUrl(c.driveFolderLink || buildDriveFolderLink(c.driveFolderId));
        }
      })
      .catch((err: any) => {
        showToast(err?.response?.data?.message || 'No se pudo cargar la carpeta de Drive de contratos', 'error');
      });
  }, []);

  const loadContracts = async () => {
    try {
      const data = await getContracts(filter ? { status: filter } : undefined);
      setContracts(data);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudieron cargar los contratos', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (id == null) return;
    try {
      await deleteContract(id);
      loadContracts();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo eliminar el contrato', 'error');
    }
  };

  const statusColors: Record<string, string> = {
    DRAFT: '#f59e0b', GENERATING: '#3b82f6', READY: '#10b981',
    SENT: '#8b5cf6', SIGNED: '#059669', CANCELLED: '#ef4444',
  };

  const statusLabels: Record<string, string> = {
    DRAFT: 'Borrador', GENERATING: 'Generando', READY: 'Listo',
    SENT: 'Enviado', SIGNED: 'Firmado', CANCELLED: 'Cancelado',
  };

  const filteredContracts = contracts.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (c.contractNumber || '').toLowerCase().includes(q) ||
      c.clientName?.toLowerCase().includes(q) ||
      c.clientEmail?.toLowerCase().includes(q) ||
      (c.template?.name || '').toLowerCase().includes(q)
    );
  });

  const { filas: filasOrdenadas, thProps, SortIcon } = useSortableTable(
    filteredContracts,
    {
      contractNumber: (c) => c.contractNumber || `#${c.id}`,
      clientName: (c) => c.clientName,
      template: (c) => c.template?.name,
      status: (c) => statusLabels[c.status] || c.status,
      createdAt: (c) => c.createdAt,
    },
    'createdAt',
    'desc',
  );

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">Ventas y CRM</p>
          <h1>Contratos</h1>
        </div>
        <div className="header-actions">
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            title="Cómo funciona Contratos"
            aria-label="Ayuda"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, border: 'none', background: 'var(--naranja)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            <HelpCircle size={18} /> Ayuda
          </button>
          {driveFolderUrl && (
            <a
              className="btn-secondary"
              href={driveFolderUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir la carpeta de contratos en Google Drive"
              aria-label="Ver carpeta en Google Drive"
              style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 10px' }}
            >
              <FolderOpen size={16} />
            </a>
          )}
          <button className="btn-secondary" onClick={() => navigate('/ventas/contratos/plantillas')}>
            <FileText size={16} /> Plantillas
          </button>
          <button className="auth-btn" onClick={() => navigate('/ventas/contratos/nuevo')}>
            <Plus size={16} /> Nuevo contrato
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-fields">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número, cliente, email o plantilla..."
            style={{ flex: '1 1 280px', minWidth: 0, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
          <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todos los estados</option>
            {(['DRAFT', 'READY', 'SENT', 'SIGNED'] as const).map((s) => (
              <option key={s} value={s}>{statusLabels[s]}</option>
            ))}
          </select>
        </div>
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={() => { setSearch(''); setFilter(''); }} disabled={!search && !filter} />
        </div>
      </div>

      <div className="admin-section">
        {contracts.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
            <div>No hay contratos aún</div>
          </div>
        ) : filasOrdenadas.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>No hay contratos que coincidan con la búsqueda.</p>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th {...thProps('contractNumber')}>Número <SortIcon campo="contractNumber" /></th>
                  <th {...thProps('clientName')}>Cliente <SortIcon campo="clientName" /></th>
                  <th {...thProps('template')}>Plantilla <SortIcon campo="template" /></th>
                  <th {...thProps('status')}>Estado <SortIcon campo="status" /></th>
                  <th {...thProps('createdAt')}>Fecha <SortIcon campo="createdAt" /></th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/ventas/contratos/${c.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}>{c.contractNumber || `#${c.id}`}</td>
                    <td>
                      <div>{c.clientName}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{c.clientEmail}</div>
                    </td>
                    <td>{c.template?.name || '—'}</td>
                    <td>
                      <span style={{ padding: '3px 10px', borderRadius: 12, background: statusColors[c.status] || '#888', color: '#fff', fontSize: 10, fontWeight: 600 }}>
                        {statusLabels[c.status] || c.status}
                      </span>
                    </td>
                    <td>{new Date(c.createdAt).toLocaleDateString('es-EC')}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button onClick={e => { e.stopPropagation(); setPendingDeleteId(c.id); }}
                        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #e55', background: '#fff', color: '#c33', cursor: 'pointer', fontSize: 11 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pendingDeleteId != null && (
        <ConfirmDialog
          title="Eliminar contrato"
          message="¿Eliminar este contrato? Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}

      {showHelp && <TemplateHelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
