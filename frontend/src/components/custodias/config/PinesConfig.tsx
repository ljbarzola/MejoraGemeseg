import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import { darPinCustodio, getPinesCustodia, quitarPinCustodio } from '../../../services/custodia.service';
import type { PinCreado, PinCustodio } from '../../../types/custodiaCampo';
import ConfirmDialog from '../../common/ConfirmDialog';
import ErrorBanner from '../../common/ErrorBanner';
import FormModal from '../../common/FormModal';
import ClearFiltersButton from '../../common/ClearFiltersButton';
import CajaBuscar, { coincideBusqueda } from './CajaBuscar';
import ColumnPickerMenu from '../../common/ColumnPickerMenu';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../common/ColumnFilter';
import RowActionsMenu, { type RowAction } from '../../common/RowActionsMenu';
import EmpleadoSelect from '../EmpleadoSelect';
import { mensajeDeError } from '../ClienteSelect';
import { useColumnFilters } from '../../../hooks/useColumnFilters';
import { useColumnPreferences } from '../../../hooks/useColumnPreferences';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { cedulaMostrable } from '../../../utils/postulacionValidacion';
import { fechaHoraEC } from '../../../utils/formatoCampo';

const COLUMNAS: { key: string; label: string }[] = [
  { key: 'cedula', label: 'Cédula' },
  { key: 'creado', label: 'PIN creado' },
  { key: 'actualizado', label: 'Actualizado' },
];
const COLUMNAS_POR_DEFECTO = COLUMNAS.map((c) => c.key);
const ANCHO: Record<string, number> = { cedula: 140, creado: 160, actualizado: 160 };

const SIN_CEDULA = 'Esta persona no tiene cédula registrada; agrégala en Personal antes de darle un PIN';

/** Muestra el PIN recién creado UNA sola vez: el servidor solo guarda su huella y no puede volver a decirlo. */
function PinMostrado({ pin, onClose }: { pin: PinCreado; onClose: () => void }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose]);
  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal modal-ventas-sm" role="dialog" aria-modal="true" aria-label="PIN creado" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>PIN de {pin.nombre}</h3></div>
        <div className="modal-body" style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'monospace', fontSize: '3rem', fontWeight: 800, letterSpacing: '0.3em', color: '#1e3a5f', paddingLeft: '0.3em' }}>{pin.pin}</div>
          <p style={{ margin: '8px 0 0', fontSize: '0.88rem', color: '#4a5568', lineHeight: 1.5 }}>
            Anótalo y entrégaselo; no se vuelve a mostrar. Si lo olvida, crea uno nuevo desde la lista.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '0.88rem', color: '#4a5568', lineHeight: 1.5 }}>
            El custodio lo usa con su cédula en el celular del viaje, después de que el celular esté vinculado.
          </p>
        </div>
        <div className="modal-actions">
          <button type="button" className="auth-btn" onClick={onClose}>Ya lo anoté</button>
        </div>
      </div>
    </div>
  );
}

/** «Dar PIN»: se elige a una persona (con cédula) y el servidor genera su PIN de 4 dígitos. */
function DarPinModal({ onClose, onCreado }: { onClose: () => void; onCreado: (p: PinCreado) => void }) {
  const [persona, setPersona] = useState({ nombre: '', cedula: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function guardar() {
    setError('');
    if (!persona.nombre.trim()) { setError('Elige a la persona.'); return; }
    if (!cedulaMostrable(persona.cedula)) { setError(`${SIN_CEDULA}.`); return; }
    setSaving(true);
    try {
      onCreado(await darPinCustodio({ cedula: persona.cedula.trim(), nombre: persona.nombre.trim() }));
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo crear el PIN. Inténtalo de nuevo.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title="Dar PIN"
      descripcion="Con su cédula y este PIN de 4 dígitos, la persona entra en el celular del viaje. Todo lo que haga queda a su nombre."
      onClose={onClose}
      onSubmit={guardar}
      submitLabel="Crear PIN"
      saving={saving}
      error={error}
      ancho={520}
    >
      <EmpleadoSelect label="Persona" value={persona} onChange={setPersona} permitirCrear required />
      {persona.nombre && !cedulaMostrable(persona.cedula) && (
        <span style={{ fontSize: '0.78rem', color: '#c05621' }}>{SIN_CEDULA}.</span>
      )}
    </FormModal>
  );
}

/** Pestaña «Custodios con PIN» de la Configuración de Custodias. */
export default function PinesConfig({ soloLectura, solicitudNueva, botones }: { soloLectura: boolean; solicitudNueva: number; botones?: ReactNode }) {
  const [busca, setBusca] = useState('');
  const [pines, setPines] = useState<PinCustodio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [dando, setDando] = useState(false);
  const [mostrado, setMostrado] = useState<PinCreado | null>(null);
  const [renovando, setRenovando] = useState<PinCustodio | null>(null);
  const [quitando, setQuitando] = useState<PinCustodio | null>(null);

  const cargar = useCallback(() => {
    getPinesCustodia()
      .then((l) => { setPines(l); setError(''); })
      .catch(() => setError('No se pudieron cargar los PIN. Inténtalo de nuevo.'))
      .finally(() => setCargando(false));
  }, []);
  useEffect(cargar, [cargar]);
  useEffect(() => { if (solicitudNueva > 0 && !soloLectura) setDando(true); }, [solicitudNueva, soloLectura]);

  const columnPrefs = useColumnPreferences('custodias-config-pines', COLUMNAS_POR_DEFECTO);
  const visibles = columnPrefs.visible.filter((k) => COLUMNAS.some((c) => c.key === k));
  const tablaRef = useResizableColumns('custodias-config-pines', ['nombre', ...visibles, 'acciones']);

  const cf = useColumnFilters<PinCustodio>(pines, [
    { key: 'nombre', etiqueta: 'Nombre', tipo: 'texto', getValue: (p) => p.nombre },
    { key: 'cedula', etiqueta: 'Cédula', tipo: 'texto', getValue: (p) => p.cedula },
    { key: 'creado', etiqueta: 'PIN creado', tipo: 'fecha', getValue: (p) => p.creadoEn },
    { key: 'actualizado', etiqueta: 'Actualizado', tipo: 'fecha', getValue: (p) => p.actualizadoEn },
  ]);
  const filas = cf.filas.filter((x) => coincideBusqueda(busca, x.nombre, x.cedula));
  const hayFiltros = cf.hayFiltros || busca.trim() !== '';
  const limpiar = () => { cf.limpiar(); setBusca(''); };


  async function nuevoPin(p: PinCustodio) {
    setError('');
    try {
      setMostrado(await darPinCustodio({ cedula: p.cedula, nombre: p.nombre }));
      cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo crear el PIN. Inténtalo de nuevo.'));
    }
  }

  async function quitar(p: PinCustodio) {
    setError('');
    try {
      await quitarPinCustodio(p.cedula);
      cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo quitar el PIN. Inténtalo de nuevo.'));
    }
  }

  const acciones = (p: PinCustodio): RowAction[] => [
    { label: 'Nuevo PIN', icon: <KeyRound size={14} />, hint: 'El PIN actual deja de servir', onClick: () => setRenovando(p) },
    { label: 'Quitar PIN', icon: <Trash2 size={14} />, danger: true, onClick: () => setQuitando(p) },
  ];

  const celda = (k: string, p: PinCustodio) => {
    switch (k) {
      case 'cedula': return <span style={{ fontFamily: 'monospace' }}>{p.cedula}</span>;
      case 'creado': return fechaHoraEC(p.creadoEn);
      case 'actualizado': return fechaHoraEC(p.actualizadoEn);
      default: return null;
    }
  };

  return (
    <>
      <ErrorBanner mensaje={error} />
      <div className="filter-bar">
        <div className="filter-bar-fields">
          <CajaBuscar value={busca} onChange={setBusca} placeholder="Buscar custodio…" />
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={COLUMNAS}
            visible={columnPrefs.visible}
            pinned={columnPrefs.pinned}
            maxPinned={columnPrefs.maxPinned}
            fixedLabel="Nombre"
            onApply={(keys, fijas) => columnPrefs.set(keys, fijas)}
          />
          <ClearFiltersButton onClear={limpiar} disabled={!hayFiltros} />
          {botones}
        </div>
      </div>
      <ChipsFiltros cf={cf} />
      <div className="admin-section">
        {cargando && pines.length === 0 ? (
          <div className="loading-state">Cargando PIN...</div>
        ) : pines.length === 0 ? (
          <div className="empty-state"><div>Todavía nadie tiene PIN.{!soloLectura ? ' Usa «Dar PIN» para crear el primero.' : ''}</div></div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
              <thead>
                <tr>
                  <th style={{ width: 260 }}>Nombre <ColumnFilter cf={cf} col="nombre" orden={cf.ordenDe('nombre')} /></th>
                  {visibles.map((k) => (
                    <th key={k} style={{ width: ANCHO[k] }}>{COLUMNAS.find((c) => c.key === k)!.label} <ColumnFilter cf={cf} col={k} orden={cf.ordenDe(k)} /></th>
                  ))}
                  {!soloLectura && <th className="col-acciones"><span className="visually-hidden">Acciones</span></th>}
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={visibles.length + (soloLectura ? 1 : 2)} mensaje="Nadie coincide con la búsqueda o los filtros." onLimpiar={limpiar} />
                )}
                {filas.map((p) => (
                  <tr key={p.cedula}>
                    <td><span className="truncate" style={{ fontWeight: 600 }}>{p.nombre}</span></td>
                    {visibles.map((k) => <td key={k}>{celda(k, p)}</td>)}
                    {!soloLectura && <td className="col-acciones"><RowActionsMenu actions={acciones(p)} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dando && <DarPinModal onClose={() => setDando(false)} onCreado={(p) => { setDando(false); setMostrado(p); cargar(); }} />}
      {mostrado && <PinMostrado pin={mostrado} onClose={() => setMostrado(null)} />}
      {renovando && (
        <ConfirmDialog
          title="Crear un PIN nuevo"
          message={`Se creará un PIN nuevo para ${renovando.nombre}. El anterior deja de servir y tendrás que entregarle el nuevo.`}
          confirmLabel="Crear PIN nuevo"
          onConfirm={() => { const p = renovando; setRenovando(null); nuevoPin(p); }}
          onCancel={() => setRenovando(null)}
        />
      )}
      {quitando && (
        <ConfirmDialog
          title="Quitar PIN"
          message={`${quitando.nombre} ya no podrá entrar al celular del viaje hasta que le des un PIN nuevo. Lo que ya registró en los viajes se conserva.`}
          confirmLabel="Quitar PIN"
          danger
          onConfirm={() => { const p = quitando; setQuitando(null); quitar(p); }}
          onCancel={() => setQuitando(null)}
        />
      )}
    </>
  );
}
