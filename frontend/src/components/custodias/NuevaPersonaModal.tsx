import { useEffect, useState } from 'react';
import { crearPersonaCustodia } from '../../services/custodia.service';
import FormModal from '../common/FormModal';

const subtitulo: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 700, color: '#1e3a5f', textTransform: 'uppercase', margin: '14px 0 8px',
};

/**
 * «No existe, créalo aquí» (2026-11-17): Operaciones registra en un momento a un chofer o custodio que RRHH aún
 * no tiene, sin salir del formulario del viaje. Solo el nombre es obligatorio (la cédula o documento también es
 * opcional: RRHH aún no tiene el de sus guardias); lo demás es opcional
 * y va a la ficha personal de RRHH. La persona entra a la misma lista de Guardias y RRHH recibe un aviso para
 * crear su carpeta en Drive (aquí no se crea nada en Drive).
 */
export default function NuevaPersonaModal({
  nombreInicial = '',
  onClose,
  onCreada,
}: {
  nombreInicial?: string;
  onClose: () => void;
  onCreada: (persona: { name: string; cedula: string; sinCedula: boolean }) => void;
}) {
  const [form, setForm] = useState({
    nombre: nombreInicial,
    cedula: '',
    telefono: '',
    email: '',
    direccion: '',
    contactoEmergenciaNombre: '',
    contactoEmergenciaTelefono: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Esta ventana se abre sobre el formulario del viaje: Escape debe cerrar solo ésta, no también el viaje (que perdería lo escrito).
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      if (!saving) onClose();
    };
    window.addEventListener('keydown', alTeclear, true);
    return () => window.removeEventListener('keydown', alTeclear, true);
  }, [onClose, saving]);

  function cambiar(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    // El documento puede ser una cédula, un pasaporte u otro de cualquier país: letras, números y guion.
    setForm((f) => ({ ...f, [name]: name === 'cedula' ? value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 20).toUpperCase() : value }));
  }

  async function guardar() {
    setError('');
    if (form.nombre.trim().length < 3) { setError('Escribe los apellidos y nombres.'); return; }
    // La cédula es opcional; si se escribe, debe ser un documento posible.
    if (form.cedula && form.cedula.length < 5) { setError('El documento debe tener al menos 5 caracteres, o déjalo vacío.'); return; }
    if (/^(ID|TEMP)-/i.test(form.cedula)) { setError('El documento no puede empezar con «ID-» ni «TEMP-»: son claves internas.'); return; }
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) { setError('El correo no parece válido.'); return; }
    setSaving(true);
    try {
      // Solo se mandan los datos opcionales que se llenaron.
      const datos: Record<string, string> = { nombre: form.nombre.trim() };
      for (const k of ['cedula', 'telefono', 'email', 'direccion', 'contactoEmergenciaNombre', 'contactoEmergenciaTelefono'] as const) {
        if (form[k].trim()) datos[k] = form[k].trim();
      }
      const persona = await crearPersonaCustodia(datos as any);
      onCreada({ name: persona.name, cedula: persona.cedula, sinCedula: persona.sinCedula });
    } catch (err: any) {
      const m = err.response?.data?.message;
      setError(typeof m === 'string' ? m : Array.isArray(m) ? m.join(' ') : 'No se pudo crear a la persona. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title="Crear persona"
      descripcion="Se agrega a los Guardias de RRHH y queda lista para elegirla en el viaje. RRHH recibirá un aviso para crear su carpeta."
      onClose={onClose}
      onSubmit={guardar}
      submitLabel="Crear y elegir"
      saving={saving}
      error={error}
      ancho={560}
    >
      <div className="form-group">
        <label>Apellidos y nombres *</label>
        <input name="nombre" value={form.nombre} onChange={cambiar} placeholder="Ej: Pérez Gómez Juan Carlos" maxLength={120} />
      </div>
      <div className="form-group">
        <label>Cédula o documento de identidad</label>
        <input name="cedula" value={form.cedula} onChange={cambiar} placeholder="Cédula, pasaporte u otro documento (opcional)" maxLength={20} />
        <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>Si no la tienes a la mano, déjala vacía: RRHH la completa después en su ficha.</span>
      </div>

      <h3 style={subtitulo}>Datos opcionales</h3>
      <div className="form-row">
        <div className="form-group">
          <label>Teléfono</label>
          <input name="telefono" value={form.telefono} onChange={cambiar} maxLength={30} />
        </div>
        <div className="form-group">
          <label>Correo</label>
          <input name="email" value={form.email} onChange={cambiar} maxLength={120} />
        </div>
      </div>
      <div className="form-group">
        <label>Dirección</label>
        <input name="direccion" value={form.direccion} onChange={cambiar} maxLength={200} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Contacto de emergencia</label>
          <input name="contactoEmergenciaNombre" value={form.contactoEmergenciaNombre} onChange={cambiar} placeholder="Nombre" maxLength={120} />
        </div>
        <div className="form-group">
          <label>Teléfono del contacto</label>
          <input name="contactoEmergenciaTelefono" value={form.contactoEmergenciaTelefono} onChange={cambiar} maxLength={30} />
        </div>
      </div>
    </FormModal>
  );
}
