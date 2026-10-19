import { useState } from 'react';
import { Plus, Trash2, ShieldAlert, LogOut, X, Check } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../../contexts/ToastContext';
import {
  crearIncidenteContrato,
  borrarIncidenteContrato,
  type ContratoComercial,
  type IncidenteContrato,
  type TipoIncidenteContrato,
} from '../../services/ventas.service';
import { diaCorto } from '../../utils/contratoComercial';

interface Props {
  contrato: ContratoComercial;
  // El detalle recibe el contrato completo ya actualizado.
  onCambio: (c: ContratoComercial) => void;
}

const TIPOS: { value: TipoIncidenteContrato; label: string; icono: typeof ShieldAlert; color: string }[] = [
  { value: 'INCIDENTE_SERVICIO', label: 'Incidente del servicio', icono: ShieldAlert, color: '#c05621' },
  { value: 'CONVERSACION_SALIDA', label: 'Conversación de salida', icono: LogOut, color: '#6b46c1' },
];

const hoyLocal = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 2 } as const;
const inputStyle = {
  padding: '6px 8px', borderRadius: 4, border: '1px solid #ddd',
  fontSize: 13, boxSizing: 'border-box' as const, fontFamily: 'inherit',
};

// Registro de lo que pasó con UN contrato mientras estuvo vigente (incidentes del servicio) y de
// lo que dijo el cliente al terminar (conversación de salida). Antes se anotaba en el Historial
// del cliente; aquí queda atado al contrato concreto.
export default function IncidentesContrato({ contrato, onCambio }: Props) {
  const { showToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoIncidenteContrato>('INCIDENTE_SERVICIO');
  const [fecha, setFecha] = useState(hoyLocal());
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aBorrar, setABorrar] = useState<IncidenteContrato | null>(null);

  const producto = contrato.kind === 'PRODUCTO';
  const nombre = contrato.title || `Contrato #${contrato.id}`;
  const incidentes = contrato.incidentes || [];
  const terminado = contrato.estado === 'VENCIDO' || contrato.estado === 'CANCELADO' || contrato.estado === 'RENOVADO';
  const tipoActual = TIPOS.find((t) => t.value === tipo)!;

  const cerrar = () => { setAbierto(false); setTexto(''); setFecha(hoyLocal()); };

  const guardar = async () => {
    if (!texto.trim()) { showToast('Escribe qué pasó antes de guardar', 'error'); return; }
    setGuardando(true);
    try {
      const actualizado = await crearIncidenteContrato(contrato.id, { type: tipo, text: texto.trim(), date: fecha });
      onCambio(actualizado);
      showToast(`${tipoActual.label} guardado en «${nombre}» de ${contrato.salesClient.name}`, 'success');
      cerrar();
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo guardar el registro', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!aBorrar) return;
    const quitar = aBorrar;
    setABorrar(null);
    try {
      onCambio(await borrarIncidenteContrato(contrato.id, quitar.id));
      showToast('Registro borrado', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo borrar el registro', 'error');
    }
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div className="page-title-row" style={{ alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Incidentes y conversación de salida</h3>
        <div className="header-actions header-actions--ancho-movil">
          {!abierto && (
            <button className="btn-secondary" onClick={() => setAbierto(true)}
              title="Anota un problema del servicio o lo que dijo el cliente al terminar">
              <Plus size={15} /> Registrar
            </button>
          )}
        </div>
      </div>
      <p style={{ fontSize: 12, color: '#718096', margin: '0 0 12px' }}>
        Aquí se anota lo que pasó con {producto ? 'esta venta' : 'este contrato'} de {contrato.salesClient.name}: los incidentes del servicio mientras estuvo vigente (una falla, un guardia ausente, un reclamo) y, cuando termina, la conversación de salida, es decir lo que dijo el propio cliente sobre por qué se va o no renueva. Sirve para entender por qué se pierde un cliente más allá del precio.
      </p>

      {abierto && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 14, background: '#f7fafc' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <div>
              <label style={labelStyle}>Qué se registra</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoIncidenteContrato)} style={{ ...inputStyle, width: 'auto' }}>
                {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{tipo === 'CONVERSACION_SALIDA' ? 'Fecha de la conversación' : 'Fecha del incidente'}</label>
              <input type="date" value={fecha} max={hoyLocal()} onChange={(e) => setFecha(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <label style={labelStyle}>{tipo === 'CONVERSACION_SALIDA' ? '¿Qué dijo el cliente? *' : '¿Qué pasó? *'}</label>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={tipo === 'CONVERSACION_SALIDA'
              ? `Ej: ${contrato.salesClient.name} dice que no renueva porque cambió de proveedor tras la falla de diciembre.`
              : `Ej: El 12 de marzo el guardia del turno de noche no llegó a ${contrato.salesClient.name}; se cubrió con 2 horas de retraso.`}
            style={{ ...inputStyle, width: '100%', resize: 'vertical', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={cerrar} disabled={guardando} style={{ padding: '6px 14px', fontSize: 12.5 }}>
              <X size={13} /> Cancelar
            </button>
            <button type="button" className="auth-btn" onClick={guardar} disabled={guardando || !texto.trim()}
              style={{ padding: '6px 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Check size={13} /> {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {incidentes.length === 0 ? (
        <p style={{ color: '#a0aec0', fontSize: 13, margin: 0 }}>
          Todavía no hay incidentes ni conversación de salida registrados en {producto ? 'esta venta' : 'este contrato'}.
          {terminado && !producto && ' Como el contrato ya terminó, conviene anotar la conversación de salida con el cliente.'}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {incidentes.map((i) => {
            const t = TIPOS.find((x) => x.value === i.type) || TIPOS[0];
            const Icono = t.icono;
            return (
              <li key={i.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ flex: '0 0 auto', width: 26, height: 26, borderRadius: '50%', background: `${t.color}1a`, color: t.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icono size={14} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5 }}>
                    <strong>{t.label}</strong>
                    <span style={{ color: '#718096' }}> · {diaCorto(i.occurredAt)}{i.createdByName ? ` · registrado por ${i.createdByName}` : ''}</span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, marginTop: 2 }}>{i.text}</div>
                </div>
                <button type="button" className="icon-btn" title="Borrar este registro" aria-label="Borrar este registro" onClick={() => setABorrar(i)}>
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {aBorrar && (
        <ConfirmDialog
          title="Borrar registro"
          message={`¿Borrar este ${aBorrar.type === 'CONVERSACION_SALIDA' ? 'registro de conversación de salida' : 'incidente'} del ${diaCorto(aBorrar.occurredAt)} de «${nombre}»? No se puede deshacer.`}
          confirmLabel="Borrar"
          danger
          onConfirm={borrar}
          onCancel={() => setABorrar(null)}
        />
      )}
    </div>
  );
}
