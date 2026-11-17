import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getAvailableCustodios } from '../../services/custodia.service';
import { getGuardias } from '../../services/entidades.service';
import NuevaPersonaModal from './NuevaPersonaModal';
import { cedulaMostrable } from '../../utils/postulacionValidacion';

interface Empleado {
  name: string;
  cedula: string;
  status?: string;
  /** Aún no tiene cédula o documento cargado en RRHH (la cédula llega vacía). */
  sinCedula?: boolean;
}

// Cada selector carga su propia lista al abrirse, así que una persona creada en uno no la vería el de al lado
// (Chofer, Custodio 1 y Custodio 2 comparten el mismo formulario). Al crearla se avisa a todos con este evento.
const EVENTO_PERSONA_CREADA = 'empleado-select:persona-creada';

function unirPersona(lista: Empleado[], p: Empleado): Empleado[] {
  return lista.some((x) => x.name === p.name && x.cedula === p.cedula) ? lista : [...lista, p];
}

interface Props {
  label: string;
  value: { nombre: string; cedula: string };
  onChange: (val: { nombre: string; cedula: string }) => void;
  excludeCedulas?: string[];
  /** Nombres ya elegidos en otros campos: sirve para no repetir a quien aún no tiene cédula (no se puede excluir por ella). */
  excludeNombres?: string[];
  required?: boolean;
  /**
   * De qué módulo se pide el padrón de guardias. Es la MISMA lista, pero cada
   * endpoint está detrás de la sección de su módulo: una pantalla de RRHH que
   * pida la de Custodias falla con "No tienes acceso a CUSTODIAS" en empresas
   * que no tienen ese módulo contratado, y viceversa. Por eso cada pantalla
   * declara de dónde viene.
   */
  source?: 'CUSTODIAS' | 'RRHH';
  /**
   * Modo del formulario del viaje (2026-11-17): solo se puede ELEGIR de la lista (escribir únicamente la filtra,
   * nunca guarda un nombre suelto sin cédula) o CREAR a la persona con el botón «No existe, créalo aquí».
   * Sin esto el selector funciona como siempre: acepta el texto escrito.
   */
  permitirCrear?: boolean;
}

export default function EmpleadoSelect({ label, value, onChange, excludeCedulas = [], excludeNombres = [], required, source = 'CUSTODIAS', permitirCrear = false }: Props) {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [search, setSearch] = useState(value.nombre || '');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creando, setCreando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value.nombre || '');
  }, [value.nombre]);

  useEffect(() => {
    setLoading(true);
    const cargar = source === 'RRHH' ? getGuardias() : getAvailableCustodios();
    cargar
      .then((data: any) => {
        if (Array.isArray(data)) {
          setEmpleados(data);
        } else if (data && Array.isArray(data.value)) {
          setEmpleados(data.value);
        }
      })
      .catch(() => setEmpleados([]))
      .finally(() => setLoading(false));
  }, [source]);

  useEffect(() => {
    const alCrearOtro = (ev: Event) => {
      const p = (ev as CustomEvent<Empleado>).detail;
      if (p) setEmpleados((prev) => unirPersona(prev, p));
    };
    window.addEventListener(EVENTO_PERSONA_CREADA, alCrearOtro);
    return () => window.removeEventListener(EVENTO_PERSONA_CREADA, alCrearOtro);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        // Escribir solo filtra: si no se eligió a nadie, el cuadro vuelve a mostrar a quien estaba elegido.
        if (permitirCrear) setSearch(value.nombre || '');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [permitirCrear, value.nombre]);

  // If search matches current selection exactly, show all non-excluded employees on focus
  const isExactSelection = value.nombre && search.trim().toLowerCase() === value.nombre.trim().toLowerCase();
  
  const filtered = empleados.filter((e) => {
    if (e.cedula && excludeCedulas.includes(e.cedula)) return false;
    if (excludeNombres.some((n) => n && n.trim().toLowerCase() === e.name.trim().toLowerCase())) return false;
    if (!search.trim() || isExactSelection) return true;
    const term = search.trim().toLowerCase();
    return e.name.toLowerCase().includes(term) || (cedulaMostrable(e.cedula) !== '' && e.cedula.toLowerCase().includes(term));
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
    if (!permitirCrear) onChange({ nombre: v, cedula: '' });
  }

  // La persona recién creada entra a la lista local y queda elegida.
  function alCrear(p: { name: string; cedula: string; sinCedula?: boolean }) {
    const nueva: Empleado = { name: p.name, cedula: p.cedula, sinCedula: p.sinCedula, status: 'Inscrito' };
    setEmpleados((prev) => unirPersona(prev, nueva));
    window.dispatchEvent(new CustomEvent(EVENTO_PERSONA_CREADA, { detail: nueva }));
    setCreando(false);
    select({ name: p.name, cedula: p.cedula });
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
          placeholder={loading ? 'Cargando guardias...' : permitirCrear ? `Escribe para buscar ${label.toLowerCase()}…` : `-- Seleccionar ${label.toLowerCase()} --`}
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
              {loading
                ? 'Cargando lista de guardias...'
                : permitirCrear
                  ? 'No se encontró a nadie con ese nombre o cédula.'
                  : 'No se encontraron guardias. Puedes escribir un nombre manualmente.'}
            </div>
          ) : (
            filtered.map((e) => (
              <div
                key={`${e.cedula}|${e.name}`}
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
                  <div style={{ fontSize: '0.72rem', color: '#718096' }}>{cedulaMostrable(e.cedula) ? `Cédula: ${cedulaMostrable(e.cedula)}` : 'Sin cédula'}</div>
                </div>
                {e.status && (
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
                )}
              </div>
            ))
          )}
          {permitirCrear && (
            <div style={{ position: 'sticky', bottom: 0, background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '8px 12px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: '#718096' }}>¿No existe? </span>
              <button
                type="button"
                className="enlace-tabla"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: '#1e3a5f', padding: 0 }}
                onClick={() => { setOpen(false); setCreando(true); }}
              >
                Créalo aquí
              </button>
            </div>
          )}
        </div>
      )}

      {creando && createPortal(
        // Los eventos de React suben por el árbol aunque la ventana se pinte en <body>: sin esto, Enter dentro de «Crear
        // persona» también enviaba el formulario del viaje que está debajo.
        <div onSubmit={(e) => e.stopPropagation()}>
          <NuevaPersonaModal
            nombreInicial={isExactSelection ? '' : search.trim()}
            onClose={() => setCreando(false)}
            onCreada={alCrear}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
