import { useState, useEffect, useRef, Fragment } from 'react';
import { Check, Plus } from 'lucide-react';
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

// Los nombres de RRHH vienen en mayúsculas ("HIDALGO ZAMBRANO EITHER SMITH"): se leen mejor como nombre propio.
function nombrePropio(nombre: string): string {
  return nombre.toLowerCase().replace(/(^|\s)(\S)/g, (_m, sp: string, c: string) => sp + c.toUpperCase());
}

function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  return ((palabras[0]?.[0] ?? '') + (palabras[1]?.[0] ?? '')).toUpperCase();
}

const sinTildes = (t: string) => t.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();

/** Marca en el texto lo que la persona escribió (sin distinguir mayúsculas ni tildes). */
function Resaltado({ texto, termino }: { texto: string; termino: string }) {
  const t = termino.trim();
  if (!t) return <>{texto}</>;
  const i = sinTildes(texto).indexOf(sinTildes(t));
  if (i < 0) return <>{texto}</>;
  return (
    <Fragment>
      {texto.slice(0, i)}
      <mark style={{ background: '#fde68a', color: 'inherit', borderRadius: 3, padding: '0 1px' }}>{texto.slice(i, i + t.length)}</mark>
      {texto.slice(i + t.length)}
    </Fragment>
  );
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
  const listaRef = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState(0);
  const [navegado, setNavegado] = useState(false);

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
    const term = sinTildes(search.trim());
    return sinTildes(e.name).includes(term) || (cedulaMostrable(e.cedula) !== '' && e.cedula.toLowerCase().includes(term));
  });

  // La fila resaltada vuelve a la primera cuando cambia lo escrito, y se mantiene a la vista al moverse con el teclado.
  useEffect(() => { setActivo(0); setNavegado(false); }, [search, open]);
  useEffect(() => {
    listaRef.current?.querySelector('[data-activo="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activo]);

  function alTeclear(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!open) { setOpen(true); return; }
      setNavegado(true);
      setActivo((i) => Math.max(0, Math.min(filtered.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1))));
    } else if (ev.key === 'Enter' && open && filtered[activo] && (permitirCrear || navegado)) {
      ev.preventDefault();
      select(filtered[activo]);
    } else if (ev.key === 'Escape' && open) {
      // Cierra solo la lista, no la ventana del formulario.
      ev.stopPropagation();
      ev.nativeEvent.stopImmediatePropagation();
      setOpen(false);
      if (permitirCrear) setSearch(value.nombre || '');
    }
  }

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
          onKeyDown={alTeclear}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
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
            borderRadius: '12px',
            boxShadow: '0 12px 28px rgba(15,23,42,0.16)',
            zIndex: 100,
            marginTop: '6px',
            overflow: 'hidden',
          }}
        >
          {filtered.length > 0 && (
            <div style={{ padding: '6px 14px', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#94a3b8', background: '#f8fafc', borderBottom: '1px solid #eef2f7' }}>
              {filtered.length} {filtered.length === 1 ? 'persona' : 'personas'}
            </div>
          )}
          <div ref={listaRef} role="listbox" style={{ maxHeight: '248px', overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '16px 12px', fontSize: '0.82rem', color: '#718096', textAlign: 'center' }}>
                {loading
                  ? 'Cargando lista de guardias...'
                  : permitirCrear
                    ? 'No se encontró a nadie con ese nombre o cédula.'
                    : 'No se encontraron guardias. Puedes escribir un nombre manualmente.'}
              </div>
            ) : (
              filtered.map((e, idx) => {
                const documento = cedulaMostrable(e.cedula);
                const elegido = !!value.nombre && value.nombre.trim().toLowerCase() === e.name.trim().toLowerCase();
                const resaltada = idx === activo;
                return (
                  <div
                    key={`${e.cedula}|${e.name}`}
                    role="option"
                    aria-selected={elegido}
                    data-activo={resaltada ? 'true' : undefined}
                    onClick={() => select(e)}
                    onMouseEnter={() => setActivo(idx)}
                    style={{
                      padding: '8px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      background: resaltada ? '#eff4fb' : '#fff',
                      borderLeft: `3px solid ${resaltada ? '#1e3a5f' : 'transparent'}`,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ flex: '0 0 30px', height: '30px', borderRadius: '50%', background: elegido ? '#1e3a5f' : '#e2e8f0', color: elegido ? '#fff' : '#475569', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      {iniciales(e.name)}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div title={nombrePropio(e.name)} style={{ fontWeight: 600, fontSize: '0.86rem', color: '#100F31', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <Resaltado texto={nombrePropio(e.name)} termino={isExactSelection ? '' : search} />
                      </div>
                      <div style={{ fontSize: '0.72rem', color: documento ? '#64748b' : '#a0aec0', fontStyle: documento ? 'normal' : 'italic' }}>
                        {documento ? <>Cédula <Resaltado texto={documento} termino={isExactSelection ? '' : search} /></> : 'Sin cédula'}
                      </div>
                    </div>
                    {elegido && <Check size={16} color="#1e3a5f" aria-label="Elegido" />}
                    {!permitirCrear && e.status && (
                      <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '8px', background: '#e2e8f0', color: '#2d3748', fontWeight: 600 }}>
                        {e.status}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {permitirCrear && (
            <button
              type="button"
              className="enlace-tabla"
              onClick={() => { setOpen(false); setCreando(true); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#f8fafc', border: 'none', borderTop: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: '#1e3a5f', padding: '10px 12px' }}
            >
              <Plus size={14} /> ¿No existe? Créalo aquí
            </button>
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
