import { useEffect, useRef, useState } from 'react';
import { FileText, Trash2, Upload, ExternalLink } from 'lucide-react';
import {
  getSupplierDocuments, uploadSupplierDocument, downloadSupplierDocument, deleteSupplierDocument,
  type SupplierDocument,
} from '../../../services/cacao.service';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import ErrorBanner from '../../../components/common/ErrorBanner';
import SoloAdminDialog from '../../../components/common/SoloAdminDialog';
import { apiErrorMessage } from '../utils';

const MAX_MB = 10;

const tamano = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Documentos de un proveedor (cédula, RUT, certificados de origen...). Se ven y se abren desde aquí;
 * subir y borrar es del administrador (quien no puede ve los botones y se le explica a quién acudir).
 */
export default function SupplierDocumentsModal({
  supplierId, supplierName, puedeEditar, onClose, onChange,
}: {
  supplierId: number;
  supplierName: string;
  puedeEditar: boolean;
  onClose: () => void;
  /** Avisa a la lista que cambió la cantidad de documentos. */
  onChange: () => void;
}) {
  const [docs, setDocs] = useState<SupplierDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [borrando, setBorrando] = useState<SupplierDocument | null>(null);
  const [soloAdmin, setSoloAdmin] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const cargar = () => {
    setLoading(true);
    getSupplierDocuments(supplierId)
      .then(setDocs)
      .catch((err) => setError(apiErrorMessage(err, 'No se pudieron cargar los documentos.')))
      .finally(() => setLoading(false));
  };
  useEffect(() => { cargar(); }, [supplierId]);

  // El aviso queda arriba de la ventana: si la lista es larga y ya bajó, se trae a la vista.
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [error]);

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (archivo.size > MAX_MB * 1024 * 1024) { setError(`El archivo pesa ${tamano(archivo.size)} y el máximo es ${MAX_MB} MB.`); return; }
    setSubiendo(true);
    setError('');
    try {
      await uploadSupplierDocument(supplierId, archivo, nombre);
      setNombre('');
      cargar();
      onChange();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo subir el documento. Revisa que sea un PDF o una imagen de hasta 10 MB.'));
    } finally { setSubiendo(false); }
  }

  async function abrir(doc: SupplierDocument) {
    setError('');
    try {
      const blob = await downloadSupplierDocument(doc.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo abrir el documento.'));
    }
  }

  async function confirmarBorrar() {
    const doc = borrando;
    if (!doc) return;
    setBorrando(null);
    try {
      await deleteSupplierDocument(doc.id);
      cargar();
      onChange();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudo eliminar el documento.'));
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Documentos de {supplierName}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, color: '#718096', fontSize: '13px' }}>
            Cédula, RUT, certificados de origen u otros papeles del proveedor. PDF o imagen (JPG, PNG, WebP), hasta {MAX_MB} MB cada uno.
          </p>
          <div ref={errorRef}><ErrorBanner mensaje={error} /></div>

          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <div className="form-group">
              <label htmlFor="doc-nombre">Nombre del documento (opcional)</label>
              <input id="doc-nombre" type="text" maxLength={120} autoComplete="off" placeholder="Ej: Cédula, RUC, Certificado orgánico" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="form-group">
              <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={alElegirArchivo} style={{ display: 'none' }} />
              <button type="button" className="auth-btn" disabled={subiendo}
                onClick={() => (puedeEditar ? inputRef.current?.click() : setSoloAdmin('suba documentos'))}>
                <Upload size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />{subiendo ? 'Subiendo…' : 'Subir documento'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading-state">Cargando documentos...</div>
          ) : docs.length === 0 ? (
            <div className="empty-state">Este proveedor todavía no tiene documentos.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {docs.map((d) => (
                <li key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <FileText size={18} color="#718096" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="truncate" style={{ fontWeight: 600 }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: '#718096' }}>{tamano(d.size)} · {new Date(d.createdAt).toLocaleDateString('es-EC')}</div>
                  </div>
                  <button type="button" className="btn-secondary icon-btn" onClick={() => abrir(d)} title="Abrir" aria-label={`Abrir ${d.name}`}><ExternalLink size={14} /></button>
                  <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }}
                    onClick={() => (puedeEditar ? setBorrando(d) : setSoloAdmin('elimine documentos'))} title="Eliminar" aria-label={`Eliminar ${d.name}`}><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>

      {borrando && (
        <ConfirmDialog
          title="Eliminar documento"
          message={`¿Eliminar «${borrando.name}»? No se puede recuperar.`}
          confirmLabel="Sí, eliminar"
          danger
          onConfirm={confirmarBorrar}
          onCancel={() => setBorrando(null)}
        />
      )}
      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}
    </div>
  );
}
