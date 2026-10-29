import { useEffect, useState } from 'react';
import ErrorBanner from '../common/ErrorBanner';
import ConfirmDialog from '../common/ConfirmDialog';
import ClearFiltersButton from '../common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../common/ColumnFilter';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import {
  cambiarActivacion,
  getActivaciones,
  mensajeErrorBitacora,
  type ActivacionPersona,
} from '../../services/bitacora.service';
import { instanteLegible } from '../../utils/bitacoraFechas';
import '../../styles/bitacora.css';

const CAMPOS_ORDEN = {
  nombre: (p: ActivacionPersona) => p.nombre,
  estado: (p: ActivacionPersona) => (p.activa ? 0 : 1),
  desde: (p: ActivacionPersona) => p.desde,
  cambiadaPor: (p: ActivacionPersona) => p.cambiadaPor,
};

/**
 * Pestaña «Hojas del día» de Configuración: administradores y gerentes deciden a
 * quién se le registra la hoja. Por defecto nadie la tiene activada. Al activar se
 * le avisa a la persona y se empieza a registrar desde ese momento; al desactivar
 * solo se deja de registrar y lo anterior se conserva.
 */
export default function ActivacionHojasPanel() {
  const [personas, setPersonas] = useState<ActivacionPersona[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [pendiente, setPendiente] = useState<{ persona: ActivacionPersona; activar: boolean } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const tablaRef = useResizableColumns('bitacora-activacion');
  // Filtros en la cabecera de cada columna (la lista de personas ya viene completa del servidor).
  const cf = useColumnFilters<ActivacionPersona>(personas, [
    { key: 'nombre', etiqueta: 'Persona', tipo: 'texto', getValue: (p) => [p.nombre, p.cargo, p.email].filter(Boolean).join(' ') },
    {
      key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ['activa', 'no'],
      getValues: (p) => (p.activa ? { valor: 'activa', etiqueta: 'Activa' } : { valor: 'no', etiqueta: 'No activa' }),
    },
    { key: 'desde', etiqueta: 'Registrando desde', tipo: 'fecha', getValue: (p) => (p.activa ? p.desde : null) },
    { key: 'cambiadaPor', etiqueta: 'Último cambio por', tipo: 'valores', vacio: 'Nadie', getValues: (p) => p.cambiadaPor },
  ]);
  const { filas, thProps, ordenDe } = useSortableTable(cf.filas, CAMPOS_ORDEN, 'nombre');

  useEffect(() => {
    let vigente = true;
    getActivaciones()
      .then((r) => vigente && setPersonas(r))
      .catch((err) => vigente && setError(mensajeErrorBitacora(err)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, []);

  const confirmar = async () => {
    if (!pendiente) return;
    setGuardando(true);
    setError('');
    try {
      const nueva = await cambiarActivacion(pendiente.persona.userId, pendiente.activar);
      setPersonas((lista) => lista.map((p) => (p.userId === nueva.userId ? nueva : p)));
      setPendiente(null);
    } catch (err) {
      setPendiente(null);
      setError(mensajeErrorBitacora(err));
    } finally {
      setGuardando(false);
    }
  };

  const activas = personas.filter((p) => p.activa).length;

  return (
    <>
      <ErrorBanner mensaje={error} />

      <p className="bit-nota" style={{ marginTop: 0 }}>
        Por defecto nadie tiene la hoja activada. Al activarla se empieza a registrar la actividad de esa persona en
        app.gemeseg y en su cuenta de Google, solo desde ese momento, y se le avisa. Puede ver su propia hoja en todo
        momento. Al desactivarla se deja de registrar y lo anterior se conserva.
      </p>

      {cargando ? (
        <p className="bit-vacio">Cargando...</p>
      ) : personas.length === 0 ? (
        <p className="bit-vacio">No hay personas activas en tu empresa.</p>
      ) : (
        <>
          <p className="bit-nota" style={{ marginBottom: 12 }}>
            {activas === 0
              ? 'Ninguna persona tiene la hoja activada.'
              : `${activas} de ${personas.length} ${activas === 1 ? 'persona tiene' : 'personas tienen'} la hoja activada.`}
          </p>
          <div className="filter-bar">
            <div className="filter-bar-actions">
              <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
            </div>
          </div>
          <ChipsFiltros cf={cf} />
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th {...thProps('nombre')}>Persona <ColumnFilter cf={cf} col="nombre" orden={ordenDe('nombre')} /></th>
                  <th {...thProps('estado')}>Estado <ColumnFilter cf={cf} col="estado" orden={ordenDe('estado')} /></th>
                  <th {...thProps('desde')}>Registrando desde <ColumnFilter cf={cf} col="desde" orden={ordenDe('desde')} /></th>
                  <th {...thProps('cambiadaPor')}>Último cambio por <ColumnFilter cf={cf} col="cambiadaPor" orden={ordenDe('cambiadaPor')} /></th>
                  <th className="col-acciones col-acciones--ancha">
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={5} mensaje="No hay personas que coincidan con los filtros." onLimpiar={cf.limpiar} />
                )}
                {filas.map((p) => (
                  <tr key={p.userId} className="tasks-table-row">
                    <td className="tasks-table-title">
                      {p.nombre}
                      <span className="bit-kpi-detalle">{p.cargo ?? p.email}</span>
                    </td>
                    <td>
                      <span className={`bit-fuente ${p.activa ? 'bit-fuente-app' : 'bit-fuente-inactiva'}`}>
                        {p.activa ? 'Activa' : 'No activa'}
                      </span>
                    </td>
                    <td>{p.activa && p.desde ? instanteLegible(p.desde) : '—'}</td>
                    <td>{p.cambiadaPor ?? '—'}</td>
                    <td className="col-acciones col-acciones--ancha">
                      <button
                        type="button"
                        className={p.activa ? 'btn-secondary' : 'auth-btn'}
                        onClick={() => setPendiente({ persona: p, activar: !p.activa })}
                      >
                        {p.activa ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pendiente && (
        <ConfirmDialog
          title={pendiente.activar ? 'Activar hoja del día' : 'Desactivar hoja del día'}
          message={
            pendiente.activar
              ? `Se empezará a registrar la actividad de ${pendiente.persona.nombre} en app.gemeseg y en su cuenta de Google, desde ahora. Se le avisará y podrá ver su hoja.`
              : `Se dejará de registrar la actividad de ${pendiente.persona.nombre}. Lo registrado hasta ahora se conserva, y se le avisará.`
          }
          confirmLabel={guardando ? 'Guardando...' : pendiente.activar ? 'Activar' : 'Desactivar'}
          onConfirm={confirmar}
          onCancel={() => !guardando && setPendiente(null)}
        />
      )}
    </>
  );
}
