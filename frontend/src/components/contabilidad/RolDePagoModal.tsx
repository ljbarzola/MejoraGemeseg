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

/**
 * Documentos de nómina en PDF o Excel (2026-11-16): la matriz cronológica de un período y el rol de pago de una persona.
 * Pide las fechas aquí, dentro de la ventana; el listado de Pagos, en cambio, se filtra por columna.
 */
export default function RolDePagoModal({ pagos, onClose }: { pagos: Pago[]; onClose: () => void }) {
  const [desde, setDesde] = useState(primeroDeMes());
  const [hasta, setHasta] = useState(hoyIso());
  const [documento, setDocumento] = useState<'matriz' | 'persona'>('matriz');
  const [formato, setFormato] = useState<'pdf' | 'excel'>('pdf');
  const [cedula, setCedula] = useState('');
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState('');

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
      const blob = await getNominaArchivo(formato, { fechaInicio: desde, fechaFin: hasta, cedula: documento === 'persona' ? cedula : undefined });
      const ext = formato === 'excel' ? 'xlsx' : 'pdf';
      const nombre = documento === 'persona'
        ? `rol_pago_${nombreSeguro(personas.find(([c]) => c === cedula)?.[1] ?? cedula)}_${desde}_${hasta}.${ext}`
        : `${formato === 'excel' ? 'nomina' : 'matriz_nomina'}_${desde}_${hasta}.${ext}`;
      descargarBlob(blob, nombre);
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
      descripcion="Lo que se paga en un período: la matriz de todos los viajes o el rol de pago de una persona, en PDF o en Excel. Solo cuentan los viajes que llegaron."
      onClose={onClose}
      onSubmit={descargar}
      submitLabel={formato === 'excel' ? 'Descargar Excel' : 'Descargar PDF'}
      saving={bajando}
      error={error}
      ancho={520}
    >
      <div className="form-group">
        <label>Documento *</label>
        <select value={documento} onChange={(e) => setDocumento(e.target.value as 'matriz' | 'persona')}>
          <option value="matriz">Matriz cronológica (todos los viajes del período)</option>
          <option value="persona">Rol de pago de una persona</option>
        </select>
      </div>
      <div className="form-group">
        <label>Formato *</label>
        <select value={formato} onChange={(e) => setFormato(e.target.value as 'pdf' | 'excel')}>
          <option value="pdf">PDF (para imprimir o firmar)</option>
          <option value="excel">Excel (resumen, detalle y ajustes en hojas)</option>
        </select>
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
    </FormModal>
  );
}
