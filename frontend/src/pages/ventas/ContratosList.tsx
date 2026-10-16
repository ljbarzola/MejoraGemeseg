import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, FolderOpen, HelpCircle, Link2 } from 'lucide-react';
import { getContracts, deleteContract, getVentasDriveConfig, vincularDocumentosSinCliente, SalesContract } from '../../services/ventas.service';
import { buildDriveFolderLink } from '../../utils/driveLink';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import TemplateHelpModal from '../../components/ventas/TemplateHelpModal';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useSortableTable } from '../../hooks/useSortableTable';
import { useToast } from '../../contexts/ToastContext';

// Columnas elegibles de la tabla (además de Número y Acciones, que son fijas).
const COLUMNAS_DOCS = [
  { key: 'clientName', label: 'Cuenta' },
  { key: 'template', label: 'Plantilla' },
  { key: 'status', label: 'Estado' },
  { key: 'createdAt', label: 'Fecha' },
  { key: 'sentAt', label: 'Enviado' },
  { key: 'signedAt', label: 'Firmado' },
];
const COLUMNAS_DOCS_POR_DEFECTO = ['clientName', 'template', 'status', 'createdAt'];

// "Documentos y firma" (antes "Documentación" y, antes, "Contratos"): los
// documentos que se generan desde una plantilla y se firman. Cada documento es de un cliente y
// puede colgar de un contrato comercial (pantalla "Contratos").
export default function ContratosList() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [filter, setFilter] = useState('');
  const [soloSinCliente, setSoloSinCliente] = useState(false);
  const [confirmarVincular, setConfirmarVincular] = useState(false);
  const [search, setSearch] = useState('');
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  // Columnas que cada persona elige ver (preferencia en su cuenta). «Número» y
  // las acciones van siempre.
  const columnPrefs = useColumnPreferences('ventas-documentacion', COLUMNAS_DOCS_POR_DEFECTO);
  const tablaRef = useResizableColumns('ventas-contratos', ['contractNumber', ...columnPrefs.visible, 'acciones']);

  useEffect(() => { loadContracts(); }, [filter, soloSinCliente]);

  useEffect(() => {
    getVentasDriveConfig()
      .then((c) => {
        if (c?.driveFolderId) {
          setDriveFolderUrl(c.driveFolderLink || buildDriveFolderLink(c.driveFolderId));
        }
      })
      .catch((err: any) => {
        showToast(err?.response?.data?.message || 'No se pudo cargar la carpeta de Drive de documentos', 'error');
      });
  }, []);

  const loadContracts = async () => {
    try {
      const data = await getContracts({ ...(filter ? { status: filter } : {}), ...(soloSinCliente ? { sinCliente: true } : {}) });
      setContracts(data);
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudieron cargar los documentos', 'error');
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
      showToast(err?.response?.data?.message || 'No se pudo eliminar el documento', 'error');
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
      sentAt: (c) => c.sentAt,
      signedAt: (c) => c.signedAt,
    },
    'createdAt',
    'desc',
  );

  const celdaDoc = (key: string, c: SalesContract): ReactNode => {
    switch (key) {
      case 'clientName':
        return (
          <>
            <div>{c.salesClient?.name || c.clientName}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{c.clientEmail}</div>
            {!c.salesClientId && <div style={{ fontSize: 11, color: '#b45309' }}>Sin cuenta asignada</div>}
          </>
        );
      case 'template':
        return c.template?.name || '—';
      case 'status':
        return (
          <span style={{ padding: '3px 10px', borderRadius: 12, background: statusColors[c.status] || '#888', color: '#fff', fontSize: 10, fontWeight: 600 }}>
            {statusLabels[c.status] || c.status}
          </span>
        );
      case 'createdAt':
        return new Date(c.createdAt).toLocaleDateString('es-EC');
      case 'sentAt':
        return c.sentAt ? new Date(c.sentAt).toLocaleDateString('es-EC') : '—';
      case 'signedAt':
        return c.signedAt ? new Date(c.signedAt).toLocaleDateString('es-EC') : '—';
      default:
        return null;
    }
  };
  const columnasVisibles = columnPrefs.visible.filter((k) => COLUMNAS_DOCS.some((c) => c.key === k));

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <p className="page-eyebrow">Ventas y CRM</p>
          <h1>Documentos y firma</h1>
        </div>
        <div className="header-actions">
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            title="Cómo funciona Documentos y firma"
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
              title="Abrir la carpeta de documentos en Google Drive"
              aria-label="Ver carpeta en Google Drive"
              style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 10px' }}
            >
              <FolderOpen size={16} />
            </a>
          )}
          <button className="btn-secondary" onClick={() => navigate('/ventas/documentacion/plantillas')}>
            <FileText size={16} /> Plantillas
          </button>
          <button className="auth-btn" onClick={() => navigate('/ventas/documentacion/nuevo')}>
            <Plus size={16} /> Nuevo documento
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-fields filter-bar-fields--una-linea">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número, cuenta, email o plantilla..."
            style={{ flex: '1 1 200px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
          <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todos los estados</option>
            {(['DRAFT', 'READY', 'SENT', 'SIGNED'] as const).map((s) => (
              <option key={s} value={s}>{statusLabels[s]}</option>
            ))}
          </select>
          <select className="filter-select" value={soloSinCliente ? 'sin' : ''} onChange={(e) => setSoloSinCliente(e.target.value === 'sin')}>
            <option value="">Todas las cuentas</option>
            <option value="sin">Sin cuenta asignada</option>
          </select>
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={COLUMNAS_DOCS}
            visible={columnPrefs.visible}
            fixedLabel="Número"
            onApply={async (keys) => {
              const guardado = await columnPrefs.set(keys);
              if (!guardado) showToast('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.', 'error');
            }}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setConfirmarVincular(true)}
            title="Enlaza solos los documentos sin cuenta cuyo correo o nombre coincide con una cuenta"
          >
            <Link2 size={16} /> Vincular cuentas
          </button>
          <ClearFiltersButton onClear={() => { setSearch(''); setFilter(''); setSoloSinCliente(false); }} disabled={!search && !filter && !soloSinCliente} />
        </div>
      </div>

      <div className="admin-section">
        {contracts.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
            <div>No hay documentos aún</div>
          </div>
        ) : filasOrdenadas.length === 0 ? (
          <p style={{ color: '#888', fontSize: 13 }}>No hay documentos que coincidan con la búsqueda.</p>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th {...thProps('contractNumber')}>Número <SortIcon campo="contractNumber" /></th>
                  {columnasVisibles.map((k) => {
                    const col = COLUMNAS_DOCS.find((c) => c.key === k)!;
                    return (
                      <th key={k} {...thProps(k)}>
                        {col.label} <SortIcon campo={k} />
                      </th>
                    );
                  })}
                  <th className="col-acciones" title="Acciones"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/ventas/documentacion/${c.id}`)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 600 }}>{c.contractNumber || `#${c.id}`}</td>
                    {columnasVisibles.map((k) => (
                      <td key={k}>{celdaDoc(k, c)}</td>
                    ))}
                    <td className="col-acciones">
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
          title="Eliminar documento"
          message="¿Eliminar este documento? Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}

      {confirmarVincular && (
        <ConfirmDialog
          title="Vincular documentos a cuentas"
          message="Se revisan los documentos que no tienen cuenta y se enlazan solos cuando su correo (o, si no, su nombre exacto) coincide con UNA sola cuenta. Los que no coinciden, o coinciden con varias, no se tocan: quedan en «Sin cuenta asignada» para revisarlos a mano."
          confirmLabel="Vincular"
          onConfirm={async () => {
            setConfirmarVincular(false);
            try {
              const r = await vincularDocumentosSinCliente();
              const resto = r.ambiguos + r.sinCoincidencia;
              showToast(
                r.revisados === 0
                  ? 'Todos los documentos ya tienen cuenta.'
                  : `${r.vinculados} documento(s) vinculados${resto ? `; ${resto} quedan sin cuenta para revisar a mano` : ''}.`,
                'success',
              );
              loadContracts();
            } catch (err: any) {
              showToast(err?.response?.data?.message || 'No se pudieron vincular los documentos', 'error');
            }
          }}
          onCancel={() => setConfirmarVincular(false)}
        />
      )}

      {showHelp && <TemplateHelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
