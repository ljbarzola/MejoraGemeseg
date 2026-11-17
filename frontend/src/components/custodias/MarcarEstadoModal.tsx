import { useState } from 'react';
import FormModal from '../common/FormModal';
import DateInput from '../common/DateInput';
import { updateCustodiaEstado } from '../../services/custodia.service';

const dos = (n: number) => String(n).padStart(2, '0');
const ahora = () => {
  const d = new Date();
  return { fecha: `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`, hora: `${dos(d.getHours())}:${dos(d.getMinutes())}` };
};
// Las horas del viaje se escriben en hora de Ecuador (UTC-5), igual que en el formulario del viaje.
const aInstante = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-05:00`);
const aCampos = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString();
  return { fecha: d.slice(0, 10), hora: d.slice(11, 16) };
};

/**
 * «Salió» / «Llegó» con la hora REAL (2026-11-16, pedido de Leidy): no siempre se alcanza a marcar a tiempo, así que
 * la ventana propone «ahora» y se puede cambiar el día y la hora. Esa hora decide a qué día y mes cuenta el viaje.
 */
export default function MarcarEstadoModal({
  custodia,
  estado,
  onClose,
  onHecho,
}: {
  custodia: any;
  estado: 'EN_CAMINO' | 'LLEGO';
  onClose: () => void;
  onHecho: () => void;
}) {
  const salio = estado === 'EN_CAMINO';
  const inicial = ahora();
  const [fecha, setFecha] = useState(inicial.fecha);
  const [hora, setHora] = useState(inicial.hora);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function guardar() {
    setError('');
    if (!fecha || !hora) { setError('Indica el día y la hora.'); return; }
    const momento = aInstante(fecha, hora);
    if (Number.isNaN(momento.getTime())) { setError('El día o la hora no son válidos.'); return; }
    if (momento.getTime() > Date.now() + 5 * 60 * 1000) { setError('La hora no puede ser futura.'); return; }
    const salida = aCampos(custodia.fechaHoraSalida);
    if (!salio && custodia.fechaHoraSalida && momento < new Date(custodia.fechaHoraSalida)) {
      setError(`La llegada no puede ser antes de la salida (${salida?.fecha.split('-').reverse().join('/')} ${salida?.hora}).`);
      return;
    }
    setGuardando(true);
    try {
      await updateCustodiaEstado(custodia.id, estado, momento.toISOString());
      onHecho();
    } catch (err: any) {
      const m = err?.response?.data?.message;
      setError(typeof m === 'string' ? m : 'No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <FormModal
      title={salio ? `¿Cuándo salió ${custodia.numeroGuia}?` : `¿Cuándo llegó ${custodia.numeroGuia}?`}
      descripcion={salio
        ? 'Propone la hora de ahora; cámbiala si el viaje salió antes.'
        : 'Propone la hora de ahora; cámbiala si el viaje llegó antes. Con «Llegó» el viaje pasa a Pagos en Contabilidad.'}
      onClose={onClose}
      onSubmit={guardar}
      submitLabel={salio ? 'Marcar salida' : 'Marcar llegada'}
      saving={guardando}
      error={error}
      ancho={460}
    >
      <div className="form-row">
        <div className="form-group">
          <label>{salio ? 'Día de salida' : 'Día de llegada'} *</label>
          <DateInput value={fecha} onChange={setFecha} required />
        </div>
        <div className="form-group">
          <label>{salio ? 'Hora de salida' : 'Hora de llegada'} *</label>
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </div>
      </div>
    </FormModal>
  );
}
