import { useEffect, useState } from 'react';
import {
  getSalesClients,
  getContratosComerciales,
  subirDocumentoHecho,
  SalesClient,
  ContratoComercial,
  SalesContract,
} from '../../services/ventas.service';
import { useToast } from '../../contexts/ToastContext';
import ErrorBanner from '../common/ErrorBanner';

interface Props {
  onClose: () => void;
  onSubido: (documento: SalesContract) => void;
  // Si se abre desde un contrato, el cliente y el contrato llegan elegidos.
  clienteId?: number;
  contratoId?: number;
}

const nombreContrato = (c: ContratoComercial) => c.title || `Contrato #${c.id}`;

// Sube un documento que ya está hecho (por ejemplo, el contrato firmado en PDF) sin pasar por
// una plantilla ni por la firma electrónica. Queda como documento del cliente y, si se elige,
// asociado a uno de sus contratos.
export default function SubirDocumentoModal({ onClose, onSubido, clienteId, contratoId }: Props) {
  const { showToast } = useToast();
  const [clientes, setClientes] = useState<SalesClient[]>([]);
  const [contratos, setContratos] = useState<ContratoComercial[]>([]);
  const [cliente, setCliente] = useState<number | ''>(clienteId ?? '');
  const [contrato, setContrato] = useState<number | ''>(contratoId ?? '');
  const [titulo, setTitulo] = useState('');
  const [firmado, setFirmado] = useState(true);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSalesClients()
      .then(setClientes)
      .catch((err: any) => setError(err?.response?.data?.message || 'No se pudieron cargar los clientes.'));
  }, []);

  useEffect(() => {
    if (!cliente) { setContratos([]); return; }
    getContratosComerciales({ clienteId: Number(cliente) })
      .then((cs) => setContratos(cs.filter((c) => c.estado !== 'CANCELADO')))
      .catch(() => setContratos([]));
  }, [cliente]);

  const clienteElegido = clientes.find((c) => c.id === cliente);
  const contratoElegido = contratos.find((c) => c.id === contrato);

  const subir = async () => {
    setError('');
    if (!cliente) { setError('Elige el cliente al que pertenece el documento.'); return; }
    if (!archivo) { setError('Elige el archivo PDF que quieres subir.'); return; }
    setSubiendo(true);
    try {
      const doc = await subirDocumentoHecho(archivo, {
        salesClientId: Number(cliente),
        agreementId: contrato ? Number(contrato) : undefined,
        titulo,
        firmado,
      });
      showToast(
        `Documento de ${clienteElegido?.name || doc.clientName} subido${contratoElegido ? ` y asociado a «${nombreContrato(contratoElegido)}»` : ''}.`,
        'success',
      );
      onSubido(doc);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo subir el documento.');
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Subir un documento que ya tienes</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
            Para un documento que ya fue hecho fuera del sistema, por ejemplo un contrato firmado en PDF. Queda guardado en Documentación,
            a nombre del cliente, y puedes asociarlo a uno de sus contratos.
          </p>

          <div className="form-group">
            <label>Cliente *</label>
            <select
              value={cliente}
              disabled={!!clienteId}
              onChange={(e) => { setCliente(e.target.value ? Number(e.target.value) : ''); setContrato(''); }}
            >
              <option value="">Seleccionar cliente...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Contrato (opcional)</label>
            <select value={contrato} disabled={!cliente || !!contratoId} onChange={(e) => setContrato(e.target.value ? Number(e.target.value) : '')}>
              <option value="">{cliente ? (contratos.length ? 'No asociar a ningún contrato' : 'Este cliente aún no tiene contratos') : 'Primero elige el cliente'}</option>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>{nombreContrato(c)}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Nombre del documento (opcional)</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej.: Contrato firmado con el cliente"
              maxLength={120}
            />
          </div>

          <div className="form-group">
            <label>Archivo PDF *</label>
            <input type="file" accept="application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>Solo PDF, hasta 10 MB.</p>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={firmado} onChange={(e) => setFirmado(e.target.checked)} />
            Este documento ya está firmado
          </label>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={subir} disabled={subiendo}>
            {subiendo ? 'Subiendo...' : 'Subir documento'}
          </button>
        </div>
      </div>
    </div>
  );
}
