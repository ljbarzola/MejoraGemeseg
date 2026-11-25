import { useEffect, useState, type ReactNode } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { quitarFirmaCliente, setFirmaCliente, updateConfigCustodias } from '../../../services/custodia.service';
import { MOMENTOS_FIRMA, etiquetaMomento, type ConfigCustodias, type FirmaPorCliente, type MomentoFirma } from '../../../types/custodiaGuia';
import ConfirmDialog from '../../common/ConfirmDialog';
import ErrorBanner from '../../common/ErrorBanner';
import FormModal from '../../common/FormModal';
import ClearFiltersButton from '../../common/ClearFiltersButton';
import CajaBuscar, { coincideBusqueda } from './CajaBuscar';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../common/ColumnFilter';
import RowActionsMenu, { type RowAction } from '../../common/RowActionsMenu';
import ClienteSelect, { mensajeDeError } from '../ClienteSelect';
import { useColumnFilters } from '../../../hooks/useColumnFilters';
import { useResizableColumns } from '../../../hooks/useResizableColumns';

/** Ventana para dar de alta o cambiar el momento de firma de UN cliente. */
function FirmaClienteModal({
  existente, onClose, onGuardada,
}: {
  existente: FirmaPorCliente | null;
  onClose: () => void;
  onGuardada: () => void;
}) {
  const [cliente, setCliente] = useState<{ id: number | null; nombre: string }>(
    existente ? { id: existente.salesClientId, nombre: existente.cliente } : { id: null, nombre: '' },
  );
  const [momento, setMomento] = useState<MomentoFirma>(existente?.firmaMomento ?? 'LLEGADA');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function guardar() {
    setError('');
    if (!cliente.id) { setError('Elige un cliente del Directorio.'); return; }
    setSaving(true);
    try {
      await setFirmaCliente(cliente.id, momento);
      onGuardada();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el cambio. Inténtalo de nuevo.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title={existente ? 'Cambiar momento de firma' : 'Agregar cliente'}
      descripcion="Para este cliente, la firma se pide en el momento que elijas en lugar del general."
      onClose={onClose}
      onSubmit={guardar}
      submitLabel="Guardar"
      saving={saving}
      error={error}
      ancho={520}
    >
      <div className="form-group">
        <label>Cliente</label>
        {existente
          ? <div style={{ fontWeight: 600 }}>{existente.cliente}</div>
          : <ClienteSelect value={cliente} permitirCrear={false} onChange={(c) => setCliente({ id: c?.id ?? null, nombre: c?.name ?? '' })} />}
      </div>
      <div className="form-group">
        <label>Momento de la firma</label>
        <select value={momento} onChange={(e) => setMomento(e.target.value as MomentoFirma)}>
          {MOMENTOS_FIRMA.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
        </select>
      </div>
    </FormModal>
  );
}

/**
 * Pestaña «Firmas» de la Configuración de Custodias: en qué momento firma el cliente (al salir, al llegar o en los
 * dos), si la firma es obligatoria para marcar la salida o la llegada, y los clientes que tienen su propio acuerdo.
 */
export default function FirmasConfig({
  config, soloLectura, onConfig, onRecargar, ayuda,
}: {
  /** Botón «?» de la página: va arriba a la derecha, en el encabezado del primer bloque. */
  ayuda?: ReactNode;
  config: ConfigCustodias;
  soloLectura: boolean;
  /** Entrega la configuración ya guardada. */
  onConfig: (c: ConfigCustodias) => void;
  /** Vuelve a pedir la configuración (cuando cambia la lista de clientes). */
  onRecargar: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [momento, setMomento] = useState<MomentoFirma>(config.firmaMomento);
  const [obligatoria, setObligatoria] = useState(config.firmaObligatoria);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [modal, setModal] = useState<{ existente: FirmaPorCliente | null } | null>(null);
  const [quitando, setQuitando] = useState<FirmaPorCliente | null>(null);

  useEffect(() => { setMomento(config.firmaMomento); setObligatoria(config.firmaObligatoria); }, [config.firmaMomento, config.firmaObligatoria]);
  const cambio = momento !== config.firmaMomento || obligatoria !== config.firmaObligatoria;

  async function guardar() {
    setError('');
    setAviso('');
    setGuardando(true);
    try {
      onConfig(await updateConfigCustodias({ firmaMomento: momento, firmaObligatoria: obligatoria }));
      setAviso('Cambios guardados.');
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron guardar los cambios. Inténtalo de nuevo.'));
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarQuitar() {
    if (!quitando) return;
    const f = quitando;
    setQuitando(null);
    setError('');
    try {
      await quitarFirmaCliente(f.salesClientId);
      onRecargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo quitar el cambio. Inténtalo de nuevo.'));
    }
  }

  const filasBase = config.firmasPorCliente;
  const cf = useColumnFilters<FirmaPorCliente>(filasBase, [
    { key: 'cliente', etiqueta: 'Cliente', tipo: 'texto', getValue: (f) => f.cliente },
    { key: 'momento', etiqueta: 'Momento', tipo: 'valores', orden: MOMENTOS_FIRMA.map((m) => m.valor), getValues: (f) => ({ valor: f.firmaMomento, etiqueta: etiquetaMomento(f.firmaMomento) }) },
  ]);
  const filas = cf.filas.filter((f) => coincideBusqueda(busca, f.cliente));
  const hayFiltros = cf.hayFiltros || busca.trim() !== '';
  const limpiar = () => { cf.limpiar(); setBusca(''); };
  const tablaRef = useResizableColumns('custodias-config-firmas', ['cliente', 'momento', 'acciones']);

  const acciones = (f: FirmaPorCliente): RowAction[] => [
    { label: 'Cambiar momento', icon: <Pencil size={14} />, onClick: () => setModal({ existente: f }) },
    { label: 'Quitar cambio', icon: <Trash2 size={14} />, danger: true, onClick: () => setQuitando(f) },
  ];

  return (
    <>
      <div className="admin-section" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Momento de la firma</h3>
          {ayuda}
        </div>
        <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#718096' }}>
          Cuándo firma el cliente la guía de custodia. Es el acuerdo general; los clientes de la lista de abajo tienen el suyo, y cada viaje puede cambiarlo.
        </p>
        <ErrorBanner mensaje={error} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {MOMENTOS_FIRMA.map((m) => (
            <label key={m.valor} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: soloLectura ? 'default' : 'pointer' }}>
              <input type="radio" name="momento-firma" checked={momento === m.valor} disabled={soloLectura} onChange={() => setMomento(m.valor)} />
              {m.etiqueta}
            </label>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: soloLectura ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={obligatoria} disabled={soloLectura} onChange={(e) => setObligatoria(e.target.checked)} />
          La firma es obligatoria para marcar la salida o la llegada
        </label>
        {!soloLectura && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" className="auth-btn" disabled={!cambio || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            {aviso && !cambio && <span style={{ fontSize: '0.82rem', color: '#276749' }}>{aviso}</span>}
          </div>
        )}
      </div>

      <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Cambios por cliente</h3>
      <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: '#718096' }}>
        Clientes que firman en un momento distinto al general. Los demás usan el acuerdo de arriba.
      </p>
      <div className="filter-bar">
        <div className="filter-bar-fields">
          <CajaBuscar value={busca} onChange={setBusca} placeholder="Buscar cliente…" />
        </div>
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={limpiar} disabled={!hayFiltros} />
          {!soloLectura && (
            <button type="button" className="btn-secondary" onClick={() => setModal({ existente: null })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={15} /> Agregar cliente
            </button>
          )}
        </div>
      </div>
      <ChipsFiltros cf={cf} />
      <div className="admin-section">
        {filasBase.length === 0 ? (
          <div className="empty-state"><div>Ningún cliente tiene un cambio: todos firman según el acuerdo general.</div></div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  <th style={{ width: 320 }}>Cliente <ColumnFilter cf={cf} col="cliente" orden={cf.ordenDe('cliente')} /></th>
                  <th style={{ width: 200 }}>Momento <ColumnFilter cf={cf} col="momento" orden={cf.ordenDe('momento')} /></th>
                  {!soloLectura && <th className="col-acciones"><span className="visually-hidden">Acciones</span></th>}
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={soloLectura ? 2 : 3} mensaje="No hay clientes que coincidan con la búsqueda o los filtros." onLimpiar={limpiar} />
                )}
                {filas.map((f) => (
                  <tr key={f.salesClientId}>
                    <td><span className="truncate">{f.cliente}</span></td>
                    <td>{etiquetaMomento(f.firmaMomento)}</td>
                    {!soloLectura && <td className="col-acciones"><RowActionsMenu actions={acciones(f)} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <FirmaClienteModal existente={modal.existente} onClose={() => setModal(null)} onGuardada={() => { setModal(null); onRecargar(); }} />
      )}
      {quitando && (
        <ConfirmDialog
          title="Quitar cambio"
          message={`${quitando.cliente} volverá a firmar según el acuerdo general. ¿Continuar?`}
          confirmLabel="Quitar"
          danger
          onConfirm={confirmarQuitar}
          onCancel={() => setQuitando(null)}
        />
      )}
    </>
  );
}
