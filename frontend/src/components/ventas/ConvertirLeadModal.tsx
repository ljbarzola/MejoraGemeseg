import { useEffect, useState } from 'react';
import ErrorBanner from '../common/ErrorBanner';
import {
  convertirLeadEntrante,
  getLeadEntrante,
  type LeadEntrante,
  type SalesServicio,
} from '../../services/ventas.service';

interface Props {
  lead: LeadEntrante;
  servicios: SalesServicio[];
  onClose: () => void;
  onDone: (r: { clienteId: number; oportunidadId: number; sumadaAClienteExistente: boolean }) => void;
}

// Pasar un lead de servicio a oportunidad (la persona queda como prospecto en
// Oportunidades hasta que acepte; solo entonces es cliente). Si el contacto se
// parece a un cliente que ya existe (mismo correo, teléfono o RUC) se elige:
// sumarle la oportunidad a ese cliente (lo normal: ya es cliente y pide otro
// servicio) o confirmar que es otro. Un cliente nunca vuelve a ser lead.
export default function ConvertirLeadModal({ lead, servicios, onClose, onDone }: Props) {
  const [coincidencias, setCoincidencias] = useState<NonNullable<LeadEntrante['coincidencias']>>([]);
  const [cargando, setCargando] = useState(true);
  // 'nuevo' = crear otro cliente; número = sumar a ese cliente.
  const [destino, setDestino] = useState<'nuevo' | number>('nuevo');
  const [nombre, setNombre] = useState(lead.companyName || lead.name);
  const [email, setEmail] = useState(lead.email || '');
  const [telefono, setTelefono] = useState(lead.phone || '');
  const [ruc, setRuc] = useState('');
  const [titulo, setTitulo] = useState('');
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [sugeridos, setSugeridos] = useState<number[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getLeadEntrante(lead.id)
      .then((d) => {
        const c = d.coincidencias ?? [];
        setCoincidencias(c);
        if (c.length > 0) setDestino(c[0].id);
        // Preselección según lo que pidió en la landing: la persona la confirma o la cambia.
        const sug = d.serviciosSugeridos ?? lead.serviciosSugeridos ?? [];
        setSugeridos(sug);
        setServiceIds(sug);
      })
      .catch(() => setCoincidencias([]))
      .finally(() => setCargando(false));
  }, [lead.id]);

  const alternar = (id: number) =>
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const convertir = async () => {
    setError('');
    if (destino === 'nuevo' && !nombre.trim()) return setError('La cuenta necesita un nombre.');
    setGuardando(true);
    try {
      const r = await convertirLeadEntrante(lead.id, {
        ...(destino === 'nuevo'
          ? { confirmarNuevo: true, name: nombre.trim(), email: email.trim(), phone: telefono.trim(), ruc: ruc.trim() }
          : { salesClientId: destino }),
        serviceIds,
        title: titulo.trim() || undefined,
      });
      onDone(r);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError((Array.isArray(msg) ? msg[0] : msg) || 'No se pudo pasar el posible cliente a oportunidad. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Pasar a oportunidad — {lead.name}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          {lead.message && (
            <div style={{ background: '#f7fafc', border: '1px solid #edf2f7', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 14, whiteSpace: 'pre-wrap' }}>
              <strong style={{ display: 'block', fontSize: 11, color: '#a0aec0', textTransform: 'uppercase' }}>Lo que escribió</strong>
              {lead.message}
            </div>
          )}

          <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
            Al pasar a oportunidad se crea su cuenta como prospecto (la ves en Cuentas, estado «Prospecto») y la negociación en Oportunidades; solo será cliente cuando acepte la propuesta.
          </p>

          {cargando ? (
            <p style={{ color: '#888', fontSize: 13 }}>Comprobando si ya tiene una cuenta...</p>
          ) : (
            coincidencias.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #f6e05e', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>
                  Este posible cliente se parece a una cuenta que ya existe (mismo correo, teléfono o RUC).
                </p>
                {coincidencias.map((c) => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 400, cursor: 'pointer', marginBottom: 4 }}>
                    <input type="radio" name="destino" checked={destino === c.id} onChange={() => setDestino(c.id)} />
                    Sumar la oportunidad a la cuenta <strong>{c.name}</strong>
                  </label>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 400, cursor: 'pointer' }}>
                  <input type="radio" name="destino" checked={destino === 'nuevo'} onChange={() => setDestino('nuevo')} />
                  Es otra persona o empresa: crear una cuenta nueva
                </label>
              </div>
            )
          )}

          {destino === 'nuevo' && (
            <>
              <div className="form-group">
                <label>Nombre o razón social de la cuenta *</label>
                <input type="text" value={nombre} maxLength={150} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Correo</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Teléfono</label>
                  <input type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Cédula / RUC (opcional)</label>
                <input type="text" value={ruc} maxLength={50} onChange={(e) => setRuc(e.target.value)} />
              </div>
            </>
          )}

          <div className="form-group">
            <label>Título de la oportunidad (opcional)</label>
            <input type="text" value={titulo} maxLength={150} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Monitoreo de cámaras de la bodega" />
          </div>

          <div className="form-group">
            <label>Servicios que pidió</label>
            {sugeridos.length > 0 && (
              <p style={{ fontSize: 12, color: '#888', margin: '0 0 6px' }}>
                Sugeridos según lo que pidió en la landing: {servicios.filter((s) => sugeridos.includes(s.id)).map((s) => s.name).join(', ') || 'servicios del catálogo'}; confírmalos o cámbialos.
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 6 }}>
              {servicios.filter((s) => s.isActive).map((s) => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 400, cursor: 'pointer' }}>
                  <input type="checkbox" checked={serviceIds.includes(s.id)} onChange={() => alternar(s.id)} />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="auth-btn" onClick={convertir} disabled={guardando || cargando}>
            {guardando ? 'Guardando...' : destino === 'nuevo' ? 'Pasar a oportunidad' : 'Sumar la oportunidad'}
          </button>
        </div>
      </div>
    </div>
  );
}
