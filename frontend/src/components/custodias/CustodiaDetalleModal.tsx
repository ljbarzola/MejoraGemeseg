import { getCustodiaPdfUrl } from '../../services/custodia.service';

const ESTADO_LABELS: Record<string, string> = {
  LISTO_PARA_CUSTODIAR: 'LISTO PARA CUSTODIAR',
  EN_CAMINO: 'EN CAMINO',
  LLEGO: 'LLEGÓ',
};

const ESTADO_COLORS: Record<string, string> = {
  LISTO_PARA_CUSTODIAR: '#eab308',
  EN_CAMINO: '#3b82f6',
  LLEGO: '#22c55e',
};

const TIPO_LABELS: Record<string, string> = {
  HACIENDA: 'Hacienda',
  PUERTO: 'Puerto',
  VIP: 'VIP',
};

const TARIFAS: Record<string, number> = { HACIENDA: 20, PUERTO: 10, VIP: 23 };

function formatFecha(date: string) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatFechaHora(date: string) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
}

interface Props {
  custodia: any;
  onClose: () => void;
}

export default function CustodiaDetalleModal({ custodia, onClose }: Props) {
  if (!custodia) return null;

  const tarifa = TARIFAS[custodia.tipoCustodia] || 0;
  const costoTotal = tarifa * 3;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '16px', maxWidth: '700px', width: '95%', maxHeight: '85vh', overflow: 'auto', padding: '28px' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#1e3a5f', fontSize: '1.2rem' }}>Orden de Custodia</h2>
            <p style={{ margin: '4px 0 0', color: '#718096', fontSize: '0.85rem' }}>{custodia.numeroGuia}</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <a href={getCustodiaPdfUrl(custodia.id)} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 14px', background: '#1e3a5f', color: '#fff', borderRadius: '8px', fontSize: '0.8rem', textDecoration: 'none' }}>
              PDF
            </a>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#718096' }}>X</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '18px' }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700 }}>TIPO</div>
            <span style={{ padding: '3px 10px', borderRadius: '12px', background: '#eab30820', color: '#1e3a5f', fontSize: '0.8rem', fontWeight: 600 }}>
              {TIPO_LABELS[custodia.tipoCustodia] || custodia.tipoCustodia}
            </span>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700 }}>ESTADO</div>
            <span style={{ padding: '3px 10px', borderRadius: '12px', background: `${ESTADO_COLORS[custodia.estado]}20`, color: ESTADO_COLORS[custodia.estado], fontSize: '0.8rem', fontWeight: 600 }}>
              {ESTADO_LABELS[custodia.estado] || custodia.estado}
            </span>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700 }}>CLIENTE</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{custodia.cliente || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700 }}>PLACA</div>
            <div style={{ fontSize: '0.9rem', fontFamily: 'monospace', fontWeight: 600 }}>{custodia.placa || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700 }}>TARIFA / PERSONA</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#22c55e' }}>${tarifa} USD</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700 }}>COSTO TOTAL (3 personas)</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e3a5f' }}>${costoTotal} USD</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
          <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700, marginBottom: '4px' }}>SALIDA</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{custodia.direccionSalida || '—'}</div>
            <div style={{ fontSize: '0.78rem', color: '#718096' }}>{formatFechaHora(custodia.fechaHoraSalida)}</div>
          </div>
          <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700, marginBottom: '4px' }}>LLEGADA</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{custodia.direccionLlegada || '—'}</div>
            <div style={{ fontSize: '0.78rem', color: '#718096' }}>{formatFechaHora(custodia.fechaHoraLlegada)}</div>
          </div>
        </div>

        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e3a5f', marginBottom: '8px' }}>PERSONAL ASIGNADO</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {[
              { label: 'Chofer', name: custodia.choferName, cedula: custodia.choferCedula },
              { label: 'Custodio 1', name: custodia.custodio1Name, cedula: custodia.custodio1Cedula },
              { label: 'Custodio 2', name: custodia.custodio2Name, cedula: custodia.custodio2Cedula },
            ].map(p => (
              <div key={p.label} style={{ padding: '10px', background: '#f8fafc', borderRadius: '8px', borderLeft: `3px solid ${p.label === 'Chofer' ? '#eab308' : '#3b82f6'}` }}>
                <div style={{ fontSize: '0.68rem', color: '#718096', fontWeight: 700 }}>{p.label}</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{p.name}</div>
                {p.cedula && <div style={{ fontSize: '0.72rem', color: '#718096' }}>{p.cedula}</div>}
              </div>
            ))}
          </div>
        </div>

        {custodia.tipoCustodia === 'HACIENDA' && custodia.nombreHacienda && (
          <div style={{ padding: '12px', background: '#fefce8', borderRadius: '10px', border: '1px solid #eab30840', marginBottom: '14px' }}>
            <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700 }}>DATOS HACIENDA</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{custodia.nombreHacienda} — {custodia.cantidadSacos} sacos</div>
          </div>
        )}

        {custodia.tipoCustodia === 'PUERTO' && custodia.contenedores?.length > 0 && (
          <div style={{ padding: '12px', background: '#eff6ff', borderRadius: '10px', border: '1px solid #3b82f640', marginBottom: '14px' }}>
            <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700 }}>CONTENEDORES</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{custodia.contenedores.join(', ')}</div>
          </div>
        )}

        {custodia.observaciones && (
          <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', marginBottom: '14px' }}>
            <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700 }}>OBSERVACIONES</div>
            <div style={{ fontSize: '0.85rem' }}>{custodia.observaciones}</div>
          </div>
        )}

        <div style={{ fontSize: '0.72rem', color: '#718096', textAlign: 'right' }}>
          Registrado: {formatFecha(custodia.createdAt)}
        </div>
      </div>
    </div>
  );
}
