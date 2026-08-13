import { useState, useEffect, useRef } from 'react';
import { getAvailableCustodios } from '../../services/custodia.service';

interface Empleado {
  name: string;
  cedula: string;
  status: string;
}

interface Props {
  label: string;
  value: { nombre: string; cedula: string };
  onChange: (val: { nombre: string; cedula: string }) => void;
  excludeCedulas?: string[];
  required?: boolean;
}

export default function EmpleadoSelect({ label, value, onChange, excludeCedulas = [], required }: Props) {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [search, setSearch] = useState(value.nombre || '');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value.nombre || '');
  }, [value.nombre]);

  useEffect(() => {
    setLoading(true);
    getAvailableCustodios()
      .then((data) => {
        if (Array.isArray(data)) {
          setEmpleados(data);
        } else if (data && Array.isArray(data.value)) {
          setEmpleados(data.value);
        }
      })
      .catch(() => setEmpleados([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // If search matches current selection exactly, show all non-excluded employees on focus
  const isExactSelection = value.nombre && search.trim().toLowerCase() === value.nombre.trim().toLowerCase();
  
  const filtered = empleados.filter((e) => {
    if (excludeCedulas.includes(e.cedula)) return false;
    if (!search.trim() || isExactSelection) return true;
    const term = search.trim().toLowerCase();
    return e.name.toLowerCase().includes(term) || (e.cedula && e.cedula.includes(term));
  });

  function select(emp: Empleado) {
    onChange({ nombre: emp.name, cedula: emp.cedula });
    setSearch(emp.name);
    setOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setSearch(v);
    setOpen(true);
    onChange({ nombre: v, cedula: '' });
  }

  function handleClear() {
    setSearch('');
    onChange({ nombre: '', cedula: '' });
    setOpen(true);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
        {label} {required && '*'}
      </label>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          placeholder={loading ? 'Cargando guardias...' : `-- Seleccionar ${label.toLowerCase()} --`}
          style={{
            width: '100%',
            padding: '10px 32px 10px 12px',
            border: '2px solid #e2e8f0',
            borderRadius: '10px',
            fontSize: '0.88rem',
            background: search ? '#f8fafc' : '#fff',
            fontWeight: search ? 600 : 400,
          }}
        />

        {search ? (
          <button
            type="button"
            onClick={handleClear}
            style={{
              position: 'absolute',
              right: '10px',
              background: 'none',
              border: 'none',
              color: '#a0aec0',
              cursor: 'pointer',
              fontSize: '1rem',
              lineHeight: 1,
            }}
            title="Limpiar selección"
          >
            ✕
          </button>
        ) : (
          <span
            onClick={() => setOpen(!open)}
            style={{
              position: 'absolute',
              right: '12px',
              fontSize: '0.65rem',
              color: '#a0aec0',
              cursor: 'pointer',
              pointerEvents: 'none',
            }}
          >
            ▼
          </span>
        )}
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
            maxHeight: '220px',
            overflowY: 'auto',
            zIndex: 100,
            marginTop: '4px',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '12px', fontSize: '0.82rem', color: '#718096', textAlign: 'center' }}>
              {loading ? 'Cargando lista de guardias...' : 'No se encontraron guardias. Puedes escribir un nombre manualmente.'}
            </div>
          ) : (
            filtered.map((e) => (
              <div
                key={e.cedula || e.name}
                onClick={() => select(e)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onMouseEnter={(ev) => (ev.currentTarget.style.background = '#f1f5f9')}
                onMouseLeave={(ev) => (ev.currentTarget.style.background = '#fff')}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#100F31' }}>{e.name}</div>
                  <div style={{ fontSize: '0.72rem', color: '#718096' }}>Cédula: {e.cedula || '—'}</div>
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    borderRadius: '8px',
                    background: '#e2e8f0',
                    color: '#2d3748',
                    fontWeight: 600,
                  }}
                >
                  {e.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
