import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Link2, Pencil, Trash2, Unlink } from 'lucide-react';
import {
  crearCodigoCelular, desvincularCelularCustodia, getCelularesCustodia, quitarCelularCustodia,
  renombrarCelularCustodia, vincularDeNuevoCelular,
} from '../../../services/custodia.service';
import type { CelularCustodia, CodigoCelular } from '../../../types/custodiaCampo';
import { ETIQUETA_ESTADO } from '../../../types/custodiaCampo';
import ConfirmDialog from '../../common/ConfirmDialog';
import ErrorBanner from '../../common/ErrorBanner';
import FormModal from '../../common/FormModal';
import ClearFiltersButton from '../../common/ClearFiltersButton';
import CajaBuscar, { coincideBusqueda } from './CajaBuscar';
import ColumnPickerMenu from '../../common/ColumnPickerMenu';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../common/ColumnFilter';
import RowActionsMenu, { type RowAction } from '../../common/RowActionsMenu';
import { mensajeDeError } from '../ClienteSelect';
import { useColumnFilters } from '../../../hooks/useColumnFilters';
import { useColumnPreferences } from '../../../hooks/useColumnPreferences';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { fechaHoraEC } from '../../../utils/formatoCampo';

const COLUMNAS: { key: string; label: string }[] = [
  { key: 'vinculado', label: 'Vinculado' },
  { key: 'ultimoUso', label: 'Último uso' },
  { key: 'viaje', label: 'Viaje actual' },
  { key: 'estado', label: 'Estado' },
];
const COLUMNAS_POR_DEFECTO = COLUMNAS.map((c) => c.key);
const ANCHO: Record<string, number> = { vinculado: 150, ultimoUso: 150, viaje: 200, estado: 130 };

const pad = (n: number) => String(n).padStart(2, '0');

/** Cuenta regresiva «mm:ss» hasta que el código vence. */
function useCuentaRegresiva(expiraEn: string | null): number {
  const [restante, setRestante] = useState(0);
  useEffect(() => {
    if (!expiraEn) return;
    const calcular = () => setRestante(Math.max(0, Math.floor((new Date(expiraEn).getTime() - Date.now()) / 1000)));
    calcular();
    const t = window.setInterval(calcular, 1000);
    return () => window.clearInterval(t);
  }, [expiraEn]);
  return restante;
}

/**
 * «Vincular celular»: se escribe cómo se llama el equipo, el servidor da un código de 10 minutos y la persona lo
 * escribe UNA vez en el celular. Mientras la ventana está abierta se mira si el celular ya apareció en la lista.
 */
function VincularModal({ idsAntes, deNuevo, onClose, onVinculado }: {
  idsAntes: number[];
  /** Un celular que ya estaba en la lista y se vuelve a vincular (mismo nombre y mismos viajes). */
  deNuevo?: CelularCustodia;
  onClose: () => void;
  onVinculado: () => void;
}) {
  const [nombre, setNombre] = useState(deNuevo?.nombre ?? '');
  const [codigo, setCodigo] = useState<CodigoCelular | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [vinculado, setVinculado] = useState(false);
  const restante = useCuentaRegresiva(codigo?.expiraEn ?? null);
  const origen = `${window.location.origin}/campo`;

  async function pedir() {
    setError('');
    if (!deNuevo && !nombre.trim()) { setError('Escribe cómo se llama el celular, por ejemplo «Celular 1».'); return; }
    setSaving(true);
    try {
      setCodigo(deNuevo ? await vincularDeNuevoCelular(deNuevo.id) : await crearCodigoCelular(nombre.trim()));
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo crear el código. Inténtalo de nuevo.'));
    } finally {
      setSaving(false);
    }
  }

  // «Vincular de nuevo» no pregunta nada: el código se pide al abrir la ventana.
  useEffect(() => { if (deNuevo) pedir(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Mientras se muestra el código, cada 4 s se mira si el celular ya se vinculó.
  // Ojo: depende de «vencido» (un booleano) y NO de los segundos que quedan; si no, el intervalo se reiniciaba cada
  // segundo y nunca llegaba a los 4 s.
  const idsRef = useRef(idsAntes);
  const estaVencido = restante <= 0;
  useEffect(() => {
    if (!codigo || vinculado || estaVencido) return;
    const t = window.setInterval(() => {
      getCelularesCustodia()
        .then((l) => {
          const ya = deNuevo
            ? l.some((c) => c.id === deNuevo.id && !c.revocado)
            : l.some((c) => !idsRef.current.includes(c.id));
          if (ya) { setVinculado(true); onVinculado(); }
        })
        .catch(() => { /* se vuelve a intentar en el siguiente ciclo */ });
    }, 4000);
    return () => window.clearInterval(t);
  }, [codigo, vinculado, estaVencido, onVinculado, deNuevo]);

  if (!codigo && deNuevo) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-ventas-sm" role="dialog" aria-modal="true" aria-label="Vincular de nuevo" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Vincular de nuevo «{deNuevo.nombre}»</h3>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
          <div className="modal-body">
            {error ? <ErrorBanner mensaje={error} /> : <p style={{ margin: 0, color: '#4a5568' }}>Creando el código…</p>}
          </div>
          <div className="modal-actions">
            {error && <button type="button" className="btn-secondary" onClick={pedir} disabled={saving}>Intentar de nuevo</button>}
            <button type="button" className="auth-btn" onClick={onClose}>Cerrar</button>
          </div>
        </div>
      </div>
    );
  }

  if (!codigo) {
    return (
      <FormModal
        title="Vincular celular"
        descripcion="Se hace una sola vez por celular. Después, el celular queda listo para recibir el viaje que le asignes."
        onClose={onClose}
        onSubmit={pedir}
        submitLabel="Crear código"
        saving={saving}
        error={error}
        ancho={520}
      >
        <div className="form-group">
          <label>Nombre del celular *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Ej: Celular 1 · Patrulla 4" />
        </div>
      </FormModal>
    );
  }

  const vencido = restante <= 0;
  if (!codigo) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-sm" role="dialog" aria-modal="true" aria-label="Código para vincular el celular" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{deNuevo ? 'Vincular de nuevo' : 'Vincular'} «{nombre.trim()}»</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body" style={{ textAlign: 'center' }}>
          {vinculado ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0' }}>
              <CheckCircle2 size={44} color="#2f855a" />
              <strong style={{ fontSize: '1.05rem', color: '#2f855a' }}>¡Celular vinculado!</strong>
              <span style={{ color: '#4a5568', fontSize: '0.88rem' }}>Ya puedes asignarlo a un viaje.</span>
            </div>
          ) : (
            <>
              <div style={{ fontFamily: 'monospace', fontSize: '2.4rem', fontWeight: 800, letterSpacing: '0.12em', color: vencido ? '#a0aec0' : '#1e3a5f', textDecoration: vencido ? 'line-through' : 'none' }}>
                {codigo.codigo}
              </div>
              <div style={{ marginTop: 4, fontSize: '0.9rem', fontWeight: 600, color: vencido ? '#c53030' : '#4a5568' }}>
                {vencido ? 'El código venció. Crea uno nuevo.' : `Vence en ${pad(Math.floor(restante / 60))}:${pad(restante % 60)}`}
              </div>
              <p style={{ margin: '14px 0 0', fontSize: '0.88rem', color: '#4a5568', lineHeight: 1.5, textAlign: 'left' }}>
                En el celular, abre <strong style={{ wordBreak: 'break-all' }}>{origen}</strong> y escribe este código. No es el PIN del custodio.
              </p>
              {deNuevo && (
                <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#718096', lineHeight: 1.5, textAlign: 'left' }}>
                  Es el mismo celular de antes: conserva su nombre y los viajes que ya llevó.
                </p>
              )}
            </>
          )}
        </div>
        <div className="modal-actions">
          {vencido && !vinculado && (
            <button type="button" className="btn-secondary" disabled={saving} onClick={() => (deNuevo ? pedir() : setCodigo(null))}>Crear otro código</button>
          )}
          <button type="button" className="auth-btn" onClick={onClose}>{vinculado ? 'Listo' : 'Cerrar'}</button>
        </div>
      </div>
    </div>
  );
}

/** Cambiar el nombre de un celular (los viajes que ya lo usaron lo muestran con el nombre nuevo). */
function RenombrarModal({ celular, onClose, onHecho }: { celular: CelularCustodia; onClose: () => void; onHecho: () => void }) {
  const [nombre, setNombre] = useState(celular.nombre);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function guardar() {
    setError('');
    if (!nombre.trim()) { setError('Escribe cómo se llama el celular.'); return; }
    setSaving(true);
    try {
      await renombrarCelularCustodia(celular.id, nombre.trim());
      onHecho();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo cambiar el nombre. Inténtalo de nuevo.'));
      setSaving(false);
    }
  }

  return (
    <FormModal title="Cambiar nombre" onClose={onClose} onSubmit={guardar} saving={saving} error={error} ancho={460}>
      <div className="form-group">
        <label>Nombre del celular *</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} />
      </div>
    </FormModal>
  );
}

/** Pestaña «Celulares» de la Configuración de Custodias. */
export default function CelularesConfig({ soloLectura, solicitudNueva, botones }: { soloLectura: boolean; solicitudNueva: number; botones?: ReactNode }) {
  const [busca, setBusca] = useState('');
  const [celulares, setCelulares] = useState<CelularCustodia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [vinculando, setVinculando] = useState(false);
  const [desvinculando, setDesvinculando] = useState<CelularCustodia | null>(null);
  const [revinculando, setRevinculando] = useState<CelularCustodia | null>(null);
  const [quitando, setQuitando] = useState<CelularCustodia | null>(null);
  const [renombrando, setRenombrando] = useState<CelularCustodia | null>(null);

  const cargar = useCallback(() => {
    getCelularesCustodia()
      .then((l) => { setCelulares(l); setError(''); })
      .catch(() => setError('No se pudieron cargar los celulares. Inténtalo de nuevo.'))
      .finally(() => setCargando(false));
  }, []);
  useEffect(cargar, [cargar]);
  useEffect(() => { if (solicitudNueva > 0 && !soloLectura) setVinculando(true); }, [solicitudNueva, soloLectura]);

  const columnPrefs = useColumnPreferences('custodias-config-celulares', COLUMNAS_POR_DEFECTO);
  const visibles = columnPrefs.visible.filter((k) => COLUMNAS.some((c) => c.key === k));
  const tablaRef = useResizableColumns('custodias-config-celulares', ['nombre', ...visibles, 'acciones']);

  const cf = useColumnFilters<CelularCustodia>(celulares, [
    { key: 'nombre', etiqueta: 'Nombre', tipo: 'texto', getValue: (c) => c.nombre },
    { key: 'vinculado', etiqueta: 'Vinculado', tipo: 'fecha', getValue: (c) => c.creadoEn },
    { key: 'ultimoUso', etiqueta: 'Último uso', tipo: 'fecha', getValue: (c) => c.ultimoUso },
    { key: 'viaje', etiqueta: 'Viaje actual', tipo: 'valores', vacio: 'Sin viaje', getValues: (c) => c.viajeActual?.numeroGuia ?? '' },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ['1', '0'], getValues: (c) => ({ valor: c.revocado ? '0' : '1', etiqueta: c.revocado ? 'Desvinculado' : 'Vinculado' }) },
  ]);
  const filas = cf.filas.filter((x) => coincideBusqueda(busca, x.nombre, x.viajeActual?.numeroGuia));
  const hayFiltros = cf.hayFiltros || busca.trim() !== '';
  const limpiar = () => { cf.limpiar(); setBusca(''); };


  async function desvincular(c: CelularCustodia) {
    setError('');
    try {
      await desvincularCelularCustodia(c.id);
      cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo desvincular el celular. Inténtalo de nuevo.'));
    }
  }

  async function quitar(c: CelularCustodia) {
    setError('');
    try {
      await quitarCelularCustodia(c.id);
      cargar();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo quitar el celular de la lista. Inténtalo de nuevo.'));
    }
  }

  // Para un celular desvinculado, el primer paso del menú es vincularlo de nuevo.
  const acciones = (c: CelularCustodia): RowAction[] => {
    const lista: RowAction[] = [];
    if (c.revocado) {
      lista.push({ label: 'Vincular de nuevo', icon: <Link2 size={14} />, onClick: () => setRevinculando(c) });
    }
    lista.push({ label: 'Cambiar nombre', icon: <Pencil size={14} />, onClick: () => setRenombrando(c) });
    if (c.revocado) {
      lista.push({
        label: 'Quitar de la lista', icon: <Trash2 size={14} />, danger: true,
        hint: 'Deja de mostrarse aquí; sus viajes siguen mostrando su nombre',
        onClick: () => setQuitando(c),
      });
    } else {
      lista.push({
        label: 'Desvincular', icon: <Unlink size={14} />, danger: true,
        hint: 'Cierra las sesiones abiertas y deja de recibir viajes',
        onClick: () => setDesvinculando(c),
      });
    }
    return lista;
  };

  const celda = (k: string, c: CelularCustodia) => {
    switch (k) {
      case 'vinculado': return fechaHoraEC(c.creadoEn);
      case 'ultimoUso': return c.ultimoUso ? fechaHoraEC(c.ultimoUso) : 'Nunca';
      case 'viaje': return c.viajeActual
        ? <span className="truncate">{c.viajeActual.numeroGuia} · {ETIQUETA_ESTADO[c.viajeActual.estado] ?? c.viajeActual.estado}</span>
        : '—';
      case 'estado':
        return c.revocado
          ? <span className="status-badge" style={{ background: '#a0aec01f', color: '#718096' }}>Desvinculado</span>
          : <span className="status-badge" style={{ background: '#2f855a1f', color: '#2f855a' }}>Vinculado</span>;
      default: return null;
    }
  };

  return (
    <>
      <ErrorBanner mensaje={error} />
      <div className="filter-bar">
        <div className="filter-bar-fields">
          <CajaBuscar value={busca} onChange={setBusca} placeholder="Buscar celular…" />
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
        {cargando && celulares.length === 0 ? (
          <div className="loading-state">Cargando celulares...</div>
        ) : celulares.length === 0 ? (
          <div className="empty-state"><div>Todavía no hay celulares vinculados.{!soloLectura ? ' Usa «Vincular celular» para agregar el primero.' : ''}</div></div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
              <thead>
                <tr>
                  <th style={{ width: 220 }}>Nombre <ColumnFilter cf={cf} col="nombre" orden={cf.ordenDe('nombre')} /></th>
                  {visibles.map((k) => (
                    <th key={k} style={{ width: ANCHO[k] }}>{COLUMNAS.find((c) => c.key === k)!.label} <ColumnFilter cf={cf} col={k} orden={cf.ordenDe(k)} /></th>
                  ))}
                  {!soloLectura && <th className="col-acciones"><span className="visually-hidden">Acciones</span></th>}
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={visibles.length + (soloLectura ? 1 : 2)} mensaje="No hay celulares que coincidan con la búsqueda o los filtros." onLimpiar={limpiar} />
                )}
                {filas.map((c) => (
                  <tr key={c.id} style={c.revocado ? { opacity: 0.6 } : undefined}>
                    <td><span className="truncate" style={{ fontWeight: 600 }}>{c.nombre}</span></td>
                    {visibles.map((k) => <td key={k}>{celda(k, c)}</td>)}
                    {!soloLectura && (
                      <td className="col-acciones">
                        <div className="acciones-iconos" style={{ justifyContent: 'flex-end' }}>
                          <RowActionsMenu actions={acciones(c)} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {vinculando && (
        <VincularModal
          idsAntes={celulares.map((c) => c.id)}
          onClose={() => { setVinculando(false); cargar(); }}
          onVinculado={cargar}
        />
      )}
      {revinculando && (
        <VincularModal
          idsAntes={celulares.map((c) => c.id)}
          deNuevo={revinculando}
          onClose={() => { setRevinculando(null); cargar(); }}
          onVinculado={cargar}
        />
      )}
      {renombrando && (
        <RenombrarModal
          celular={renombrando}
          onClose={() => setRenombrando(null)}
          onHecho={() => { setRenombrando(null); cargar(); }}
        />
      )}
      {quitando && (
        <ConfirmDialog
          title="Quitar de la lista"
          message={`«${quitando.nombre}» dejará de mostrarse en esta lista. Los viajes que lo usaron seguirán mostrando su nombre.`}
          confirmLabel="Quitar de la lista"
          danger
          onConfirm={() => { const c = quitando; setQuitando(null); quitar(c); }}
          onCancel={() => setQuitando(null)}
        />
      )}
      {desvinculando && (
        <ConfirmDialog
          title="Desvincular celular"
          message={`«${desvinculando.nombre}» dejará de recibir viajes y se cerrarán sus sesiones abiertas. Para usarlo otra vez usa «Vincular de nuevo» y escribe el código en el celular.${desvinculando.viajeActual ? ` Ahora tiene asignado el viaje ${desvinculando.viajeActual.numeroGuia}.` : ''}`}
          confirmLabel="Desvincular"
          danger
          onConfirm={() => { const c = desvinculando; setDesvinculando(null); desvincular(c); }}
          onCancel={() => setDesvinculando(null)}
        />
      )}
    </>
  );
}
