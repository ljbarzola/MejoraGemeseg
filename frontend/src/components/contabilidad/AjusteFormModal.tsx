import { useMemo, useState } from 'react';
import FormModal from '../common/FormModal';
import DateInput from '../common/DateInput';
import { actualizarAjuste, crearAjuste, type Ajuste, type Pago } from '../../services/contabilidad.service';

const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const diaEcuador = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const fechaCorta = (dia: string) => dia.split('-').reverse().join('/');

/** Una persona se reconoce por su cédula; sin ella, por su nombre (igual que en el servidor). */
export const clavePersona = (cedula: string, nombre: string) => (cedula || '').trim() || (nombre || '').trim().toLowerCase();

export interface PersonaOpcion { clave: string; nombre: string; cedula: string }

/** Las personas a las que se puede ajustar: las que ya cobraron por un viaje y las que ya tienen algún ajuste. */
export function personasDe(pagos: Pago[], ajustes: Ajuste[] = []): PersonaOpcion[] {
  const m = new Map<string, PersonaOpcion>();
  for (const p of pagos) {
    const clave = clavePersona(p.cedula, p.persona);
    if (clave && !m.has(clave)) m.set(clave, { clave, nombre: p.persona, cedula: p.cedula });
  }
  for (const a of ajustes) {
    const clave = clavePersona(a.cedula, a.persona);
    if (clave && !m.has(clave)) m.set(clave, { clave, nombre: a.persona, cedula: a.cedula });
  }
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function mensajeDe(err: any): string {
  const m = err?.response?.data?.message;
  return typeof m === 'string' ? m : Array.isArray(m) ? m.join(' ') : 'No se pudo guardar el ajuste. Inténtalo de nuevo.';
}

/**
 * Extra o descuento a una persona al liquidar (2026-11-16): por ejemplo pagarle un poco más a un chofer por una espera,
 * o descontarle algo del mes. Puede ir ligado a un viaje (cuenta en el día de ese viaje) o ir suelto en una fecha.
 * `ajuste` = editar; `inicial` = crear con la persona y el viaje ya elegidos (desde una fila de Pagos).
 */
export default function AjusteFormModal({
  ajuste,
  inicial,
  pagos,
  ajustes = [],
  onClose,
  onGuardado,
}: {
  ajuste?: Ajuste;
  inicial?: { cedula: string; persona: string; custodiaId: number };
  pagos: Pago[];
  ajustes?: Ajuste[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const editando = !!ajuste;
  const personas = useMemo(() => personasDe(pagos, ajustes), [pagos, ajustes]);
  const base = ajuste ?? inicial;
  const [tipo, setTipo] = useState<string>(ajuste?.tipo ?? 'EXTRA');
  const [persona, setPersona] = useState<string>(base ? clavePersona(base.cedula, base.persona) : '');
  const [custodiaId, setCustodiaId] = useState<string>(base?.custodiaId ? String(base.custodiaId) : '');
  const [fecha, setFecha] = useState<string>(ajuste?.fecha ?? hoyIso());
  const [monto, setMonto] = useState<string>(ajuste ? String(ajuste.monto) : '');
  const [concepto, setConcepto] = useState<string>(ajuste?.concepto ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Viajes en los que participó la persona elegida (para ligar el ajuste a uno).
  const viajes = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of pagos) {
      if (clavePersona(p.cedula, p.persona) === persona && !m.has(p.custodiaId)) {
        m.set(p.custodiaId, `${p.numeroGuia} · ${fechaCorta(diaEcuador(p.fecha))}`);
      }
    }
    // Un ajuste ya ligado a un viaje que ya no está entre los pagos (volvió al inicio) se sigue mostrando.
    if (ajuste?.custodiaId && !m.has(ajuste.custodiaId)) m.set(ajuste.custodiaId, ajuste.numeroGuia ?? `Viaje ${ajuste.custodiaId}`);
    return [...m.entries()];
  }, [pagos, persona, ajuste]);

  const elegida = personas.find((p) => p.clave === persona);
  const ligado = !!custodiaId;

  function cambiarPersona(clave: string) {
    setPersona(clave);
    setCustodiaId(''); // los viajes dependen de la persona
  }

  async function guardar() {
    setError('');
    if (!elegida) { setError('Elige a quién se le aplica el ajuste.'); return; }
    const num = Number(monto.replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) { setError('Escribe un monto mayor a 0.'); return; }
    if (!concepto.trim()) { setError('Escribe el motivo del ajuste.'); return; }
    if (!ligado && !fecha) { setError('Indica la fecha del ajuste.'); return; }
    setGuardando(true);
    try {
      const datos = {
        tipo,
        persona: elegida.nombre,
        cedula: elegida.cedula,
        fecha: ligado ? undefined : fecha,
        monto: num,
        concepto: concepto.trim(),
        custodiaId: ligado ? Number(custodiaId) : null,
      };
      if (ajuste) await actualizarAjuste(ajuste.id, datos);
      else await crearAjuste(datos);
      onGuardado();
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <FormModal
      title={editando ? 'Editar ajuste' : 'Nuevo ajuste'}
      descripcion="Un extra suma a lo que se le paga a la persona; un descuento lo resta. Sale en su rol de pago y en los totales."
      onClose={onClose}
      onSubmit={guardar}
      submitLabel={editando ? 'Guardar cambios' : 'Guardar ajuste'}
      saving={guardando}
      error={error}
      ancho={560}
    >
      <div className="form-row">
        <div className="form-group">
          <label>Tipo *</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="EXTRA">Extra (se le paga más)</option>
            <option value="DESCUENTO">Descuento (se le resta)</option>
          </select>
        </div>
        <div className="form-group">
          <label>Monto (USD) *</label>
          <input type="text" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Ej: 5" />
        </div>
      </div>

      <div className="form-group">
        <label>Persona *</label>
        <select value={persona} onChange={(e) => cambiarPersona(e.target.value)}>
          <option value="">— Elegir persona —</option>
          {personas.map((p) => (
            <option key={p.clave} value={p.clave}>{p.nombre}{p.cedula ? ` (${p.cedula})` : ''}</option>
          ))}
        </select>
        {personas.length === 0 && (
          <p style={{ fontSize: '0.78rem', color: '#718096', margin: '4px 0 0' }}>
            Todavía no hay personas: aparecen cuando un viaje llega a su destino.
          </p>
        )}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Viaje (opcional)</label>
          <select value={custodiaId} onChange={(e) => setCustodiaId(e.target.value)} disabled={!persona}>
            <option value="">Ninguno: ajuste del período</option>
            {viajes.map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Fecha {ligado ? '' : '*'}</label>
          {ligado
            ? <input value="El día de ese viaje" disabled readOnly />
            : <DateInput value={fecha} onChange={setFecha} required />}
        </div>
      </div>

      <div className="form-group">
        <label>Motivo *</label>
        <input value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={200}
          placeholder={tipo === 'EXTRA' ? 'Ej: Espera adicional en el puerto' : 'Ej: Uniforme perdido'} />
      </div>
    </FormModal>
  );
}
