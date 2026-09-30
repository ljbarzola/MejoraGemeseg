import { useState, useEffect, useRef } from 'react';
import { X, UserPlus } from 'lucide-react';
import { crearPersonalAdministrativo } from '../../services/personal.service';

interface Props {
  onClose: () => void;
  /** Se llama con el nombre de la persona creada, para refrescar el listado. */
  onCreated: (employeeName: string) => void;
}

// Alta manual de una persona de Personal Administrativo. Crea su carpeta en
// Drive ("Apellidos Nombres"), su fila en el listado y su ficha con el puesto.
export default function NuevoPersonalAdministrativoModal({ onClose, onCreated }: Props) {
  const [apellidos, setApellidos] = useState('');
  const [nombres, setNombres] = useState('');
  const [cedula, setCedula] = useState('');
  const [puesto, setPuesto] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const handleSave = async () => {
    if (!apellidos.trim() || !nombres.trim()) {
      setError('Escribe los apellidos y los nombres.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const creado = await crearPersonalAdministrativo({
        apellidos: apellidos.trim(),
        nombres: nombres.trim(),
        cedula: cedula.trim() || undefined,
        puesto: puesto.trim() || undefined,
      });
      onCreated(creado.employeeName);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo crear a la persona. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="modal" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={17} /> Nueva persona administrativa
          </h3>
          <button className="modal-close" onClick={onClose} disabled={saving}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.82rem', color: '#718096', marginTop: 0 }}>
            Se crea su carpeta en Google Drive con el nombre "Apellidos Nombres" y queda en el listado. Podrás completar el resto de sus datos desde su ficha.
          </p>

          {error && <div className="form-error" ref={errorRef} style={{ marginBottom: '12px' }}>{error}</div>}

          <div className="form-group">
            <label>Apellidos *</label>
            <input type="text" value={apellidos} onChange={(e) => setApellidos(e.target.value)} placeholder="Ej. Torres Vega" autoFocus />
          </div>
          <div className="form-group">
            <label>Nombres *</label>
            <input type="text" value={nombres} onChange={(e) => setNombres(e.target.value)} placeholder="Ej. María José" />
          </div>
          <div className="form-group">
            <label>Cédula</label>
            <input
              type="text"
              inputMode="numeric"
              value={cedula}
              onChange={(e) => setCedula(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10 dígitos (opcional)"
            />
            <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>Si no la tienes a la mano, puedes agregarla después en su ficha.</span>
          </div>
          <div className="form-group">
            <label>Puesto</label>
            <input type="text" value={puesto} onChange={(e) => setPuesto(e.target.value)} placeholder="Ej. Asistente contable (opcional)" />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="auth-btn" onClick={handleSave} disabled={saving}>
            {saving ? 'Creando...' : 'Crear persona'}
          </button>
        </div>
      </div>
    </div>
  );
}
