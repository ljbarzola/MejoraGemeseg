import { useMemo, useState } from 'react';
import FormModal from '../common/FormModal';
import DateInput from '../common/DateInput';
import { getNominaArchivo, type Pago } from '../../services/contabilidad.service';
import { descargarBlob, nombreSeguro } from '../../utils/archivos';

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const primeroDeMes = () => `${hoyIso().slice(0, 8)}01`;
// Los pagos traen la fecha como instante; el día que cuenta es el de Ecuador (UTC-5), igual que en el servidor.
const diaEcuador = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);

/** El servidor responde los errores del archivo como JSON, pero con `responseType: 'blob'` llegan como Blob. */
async function mensajeDeError(err: any): Promise<string> {
  try {
    const texto = await err?.response?.data?.text?.();
    const j = texto ? JSON.parse(texto) : null;
    if (typeof j?.message === 'string') return j.message;
  } catch { /* se usa el mensaje general */ }
  return 'No se pudo generar el archivo. Inténtalo de nuevo.';
}

type Documento = 'resumen' | 'persona' | 'detalle' | 'cronologica';

/**
 * Lo que se puede sacar (2026-11-16, quinta vuelta de Leidy: «el formato cambia cómo se ve y no me gusta»): primero se
 * elige QUÉ se necesita y después en qué archivo. Cada contenido tiene su descripción y un ejemplo de las columnas que
 * saldrán; el PDF y el Excel de un mismo contenido traen esas mismas columnas, en el mismo orden (el Excel suma hojas
 * extra con más detalle).
 */
const CONTENIDOS: {
  clave: Documento; titulo: string; descripcion: string; columnas: string[]; ejemplo: string[]; nota?: string;
}[] = [
  {
    clave: 'resumen', titulo: 'Matriz de todo el personal',
    descripcion: 'Una fila por persona con sus viajes, subtotal, ajustes y neto a pagar.',
    columnas: ['Persona', 'Viajes', 'Hacienda', 'Puerto', 'VIP', 'Subtotal', 'Ajustes', 'Neto'],
    ejemplo: ['Ana Pérez', '4', '$40.00', '$20.00', '$0.00', '$60.00', '+$10.00', '$70.00'],
  },
  {
    clave: 'persona', titulo: 'Rol de pago de una persona',
    descripcion: 'El detalle de sus viajes y sus extras o descuentos, listo para entregárselo.',
    columnas: ['Fecha', 'Guía', 'Rol', 'Tipo', 'Cliente', 'Placa', 'Monto'],
    ejemplo: ['16/11/2026', 'G-1042', 'Chofer', 'Puerto', 'Cliente S.A.', 'ABC-123', '$20.00'],
    nota: 'Al final: subtotal de viajes, cada extra o descuento y el total neto a pagar.',
  },
  {
    clave: 'detalle', titulo: 'Detalle de viajes',
    descripcion: 'Una fila por viaje y persona, de todo el personal.',
    columnas: ['Persona', 'Fecha', 'Guía', 'Rol', 'Tipo', 'Cliente', 'Placa', 'Monto'],
    ejemplo: ['Ana Pérez', '16/11/2026', 'G-1042', 'Chofer', 'Puerto', 'Cliente S.A.', 'ABC-123', '$20.00'],
  },
  {
    clave: 'cronologica', titulo: 'Matriz cronológica',
    descripcion: 'Viaje por viaje, ordenado por fecha, con una columna por persona y lo que cobra cada una.',
    columnas: ['Fecha', 'Guía', 'Ana Pérez', 'Luis Mora', 'Eva Cruz'],
    ejemplo: ['16/11/2026', 'G-1042', '$20.00', '$20.00', '$20.00'],
  },
];

/** Cómo se verá el resultado: las columnas de verdad y una fila de ejemplo. Cambia al elegir otro contenido. */
function VistaPrevia({ contenido }: { contenido: typeof CONTENIDOS[number] }) {
  return (
    <div className="form-group">
      <label>Así saldrá <span style={{ fontWeight: 400, color: '#718096' }}>(ejemplo del formato)</span></label>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              {contenido.columnas.map((c) => (
                <th key={c} style={{ textAlign: 'left', padding: '6px 6px', fontWeight: 700, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {contenido.ejemplo.map((v, i) => (
                <td key={i} style={{ padding: '6px 6px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: '0.75rem', color: '#718096', margin: '6px 0 0' }}>
        {contenido.nota ? `${contenido.nota} ` : ''}El PDF y el Excel traen estas mismas columnas; el Excel suma, en hojas aparte, más detalle para filtrar y sumar.
      </p>
    </div>
  );
}

/** Documentos de nómina en PDF o Excel. Pide las fechas aquí, dentro de la ventana; el listado de Pagos se filtra por columna. */
export default function RolDePagoModal({ pagos, onClose }: { pagos: Pago[]; onClose: () => void }) {
  const [desde, setDesde] = useState(primeroDeMes());
  const [hasta, setHasta] = useState(hoyIso());
  const [documento, setDocumento] = useState<Documento>('resumen');
  const [formato, setFormato] = useState<'pdf' | 'excel'>('pdf');
  const [cedula, setCedula] = useState('');
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState('');
  const contenido = CONTENIDOS.find((c) => c.clave === documento)!;

  // Personas con pagos en el período (solo las que tienen cédula: el rol de pago se arma por cédula).
  const personas = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pagos) {
      if (!p.cedula) continue;
      const dia = diaEcuador(p.fecha);
      if ((desde && dia < desde) || (hasta && dia > hasta)) continue;
      if (!m.has(p.cedula)) m.set(p.cedula, p.persona);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [pagos, desde, hasta]);

  async function descargar() {
    setError('');
    if (!desde || !hasta) { setError('Indica desde y hasta qué día.'); return; }
    if (desde > hasta) { setError('La fecha de inicio no puede ser posterior a la de fin.'); return; }
    if (documento === 'persona' && !cedula) { setError('Elige la persona del rol de pago.'); return; }
    setBajando(true);
    try {
      const blob = await getNominaArchivo(formato, { fechaInicio: desde, fechaFin: hasta, documento, cedula: documento === 'persona' ? cedula : undefined });
      const ext = formato === 'excel' ? 'xlsx' : 'pdf';
      const base = documento === 'persona'
        ? `rol_pago_${nombreSeguro(personas.find(([c]) => c === cedula)?.[1] ?? cedula)}`
        : documento === 'resumen' ? 'matriz_personal' : documento === 'detalle' ? 'detalle_viajes' : 'matriz_cronologica';
      descargarBlob(blob, `${base}_${desde}_${hasta}.${ext}`);
      onClose();
    } catch (e) {
      setError(await mensajeDeError(e));
    } finally {
      setBajando(false);
    }
  }

  return (
    <FormModal
      title="Rol de pago y matriz"
      descripcion="Lo que se paga en un período. Elige qué necesitas, mira cómo saldrá y descárgalo en PDF o Excel. Solo cuentan los viajes que llegaron."
      onClose={onClose}
      onSubmit={descargar}
      submitLabel={formato === 'excel' ? 'Descargar Excel' : 'Descargar PDF'}
      saving={bajando}
      error={error}
      ancho={680}
    >
      <div className="form-group">
        <label>¿Qué necesitas? *</label>
        <div style={{ display: 'grid', gap: 8 }}>
          {CONTENIDOS.map((c) => (
            <label
              key={c.clave}
              style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 12px', cursor: 'pointer', margin: 0,
                border: `1px solid ${documento === c.clave ? '#100F31' : '#e2e8f0'}`, borderRadius: 10,
                background: documento === c.clave ? '#f8fafc' : '#fff',
              }}
            >
              <input type="radio" name="documento-nomina" checked={documento === c.clave} onChange={() => setDocumento(c.clave)} style={{ marginTop: 3, width: 'auto' }} />
              <span>
                <span style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem' }}>{c.titulo}</span>
                <span style={{ display: 'block', fontSize: '0.78rem', color: '#718096', fontWeight: 400 }}>{c.descripcion}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {documento === 'persona' && (
        <div className="form-group">
          <label>Persona *</label>
          <select value={cedula} onChange={(e) => setCedula(e.target.value)}>
            <option value="">— Elegir persona —</option>
            {personas.map(([c, nombre]) => <option key={c} value={c}>{nombre} ({c})</option>)}
          </select>
          {personas.length === 0 && (
            <p style={{ fontSize: '0.78rem', color: '#718096', margin: '4px 0 0' }}>No hay pagos con cédula en ese período.</p>
          )}
        </div>
      )}

      <div className="form-row">
        <div className="form-group">
          <label>Desde *</label>
          <DateInput value={desde} onChange={setDesde} required />
        </div>
        <div className="form-group">
          <label>Hasta *</label>
          <DateInput value={hasta} onChange={setHasta} required />
        </div>
      </div>

      <VistaPrevia contenido={contenido} />

      <div className="form-group">
        <label>Archivo *</label>
        <select value={formato} onChange={(e) => setFormato(e.target.value as 'pdf' | 'excel')}>
          <option value="pdf">PDF (para imprimir o firmar)</option>
          <option value="excel">Excel (para filtrar y sumar)</option>
        </select>
      </div>
    </FormModal>
  );
}
