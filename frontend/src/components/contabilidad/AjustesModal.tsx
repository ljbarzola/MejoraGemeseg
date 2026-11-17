import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import ConfirmDialog from '../common/ConfirmDialog';
import ErrorBanner from '../common/ErrorBanner';
import ClearFiltersButton from '../common/ClearFiltersButton';
import RowActionsMenu, { type RowAction } from '../common/RowActionsMenu';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../common/ColumnFilter';
import AjusteFormModal from './AjusteFormModal';
import { dinero } from '../ventas/dashboard/DashboardBits';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { usePermissions } from '../../hooks/usePermissions';
import { eliminarAjuste, getAjustes, type Ajuste, type Pago } from '../../services/contabilidad.service';

const TIPO_LABEL: Record<string, string> = { EXTRA: 'Extra', DESCUENTO: 'Descuento' };
const TIPO_COLOR: Record<string, string> = { EXTRA: '#2f855a', DESCUENTO: '#c53030' };
const SIN_AJUSTES: Ajuste[] = [];

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const formatoDia = (dia: string) => dia.split('-').reverse().join('/');
/** Un neto negativo se escribe «−$3.00», no «$-3.00». */
const conSigno = (n: number) => (n < 0 ? `−${dinero(-n)}` : dinero(n));

/**
 * Extras y descuentos (2026-11-16): se abren desde «Pagos» en una ventana, no en una pestaña aparte. Lista todos los
 * ajustes con crear, editar y eliminar; un ajuste de un pago ya registrado como pagado no se toca hasta deshacer ese pago.
 * `onCambio` avisa a «Pagos» para que recargue sus totales.
 */
export default function AjustesModal({
  pagos,
  onClose,
  onCambio,
}: {
  pagos: Pago[];
  onClose: () => void;
  onCambio: () => void;
}) {
  const { canWrite } = usePermissions();
  const puedeEscribir = canWrite('CONTABILIDAD');
  const [ajustes, setAjustes] = useState<Ajuste[]>(SIN_AJUSTES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [formulario, setFormulario] = useState<{ ajuste?: Ajuste } | null>(null);
  const [aBorrar, setABorrar] = useState<Ajuste | null>(null);

  const cargar = useCallback(() => {
    setLoading(true);
    getAjustes()
      .then((a) => { setAjustes(a.ajustes); setError(''); })
      .catch((e) => setError(e?.response?.data?.message || 'No se pudieron cargar los ajustes. Inténtalo de nuevo.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(cargar, [cargar]);

  // Escape cierra esta ventana solo si no hay otra encima (el formulario y la confirmación se cierran a sí mismos).
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape' && !formulario && !aBorrar) onClose(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose, formulario, aBorrar]);

  const cf = useColumnFilters<Ajuste>(ajustes, [
    { key: 'persona', etiqueta: 'Persona', tipo: 'valores', getValues: (a) => ({ valor: a.cedula || a.persona, etiqueta: a.persona }) },
    { key: 'tipo', etiqueta: 'Tipo', tipo: 'valores', orden: Object.keys(TIPO_LABEL), getValues: (a) => ({ valor: a.tipo, etiqueta: TIPO_LABEL[a.tipo] ?? a.tipo }) },
    { key: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', getValue: (a) => a.fecha },
    { key: 'monto', etiqueta: 'Monto', tipo: 'numero', getValue: (a) => a.firmado, formato: (n) => conSigno(n) },
    { key: 'concepto', etiqueta: 'Motivo', tipo: 'texto', getValue: (a) => a.concepto },
    { key: 'viaje', etiqueta: 'Viaje', tipo: 'texto', getValue: (a) => a.numeroGuia },
  ]);
  const hayFiltros = !!busqueda || cf.hayFiltros;
  const limpiarTodo = () => { setBusqueda(''); cf.limpiar(); };

  const filas = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    if (!q) return cf.filas;
    return cf.filas.filter((a) => sinTildes([a.persona, a.cedula, a.concepto, a.numeroGuia].filter(Boolean).join(' ')).includes(q));
  }, [cf.filas, busqueda]);

  const extras = filas.filter((a) => a.tipo === 'EXTRA').reduce((s, a) => s + a.monto, 0);
  const descuentos = filas.filter((a) => a.tipo === 'DESCUENTO').reduce((s, a) => s + a.monto, 0);

  async function confirmarBorrar() {
    if (!aBorrar) return;
    const a = aBorrar;
    setABorrar(null);
    try {
      await eliminarAjuste(a.id);
      setError('');
      cargar();
      onCambio();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo eliminar el ajuste. Inténtalo de nuevo.');
    }
  }

  const accionesDe = (a: Ajuste): RowAction[] => [
    { label: 'Editar', icon: <Pencil size={14} />, onClick: () => setFormulario({ ajuste: a }) },
    { label: 'Eliminar', icon: <Trash2 size={14} />, danger: true, onClick: () => setABorrar(a) },
  ];

  // Las ventanas de encima (formulario, confirmación) van FUERA de este cuadro: un clic en ellas no debe llegar al fondo de esta.
  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 1000, width: '96vw' }} role="dialog" aria-modal="true" aria-label="Extras y descuentos" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Extras y descuentos</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0, color: '#718096', fontSize: '13px' }}>
            Lo que se suma (extra: por ejemplo, pagarle un poco más a un chofer) o se resta (descuento) a una persona al liquidar. Entra en su rol de pago y en los totales.
          </p>
          <ErrorBanner mensaje={error} />

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por persona, motivo o guía..."
              style={{ flex: '1 1 220px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
            />
            <ClearFiltersButton onClear={limpiarTodo} disabled={!hayFiltros} />
            {puedeEscribir && (
              <button type="button" className="auth-btn" onClick={() => setFormulario({})} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} /> Nuevo ajuste
              </button>
            )}
          </div>
          <ChipsFiltros cf={cf} />

          {loading && ajustes.length === 0 ? (
            <div className="loading-state">Cargando ajustes...</div>
          ) : ajustes.length === 0 ? (
            <div className="empty-state">
              <div>Todavía no hay extras ni descuentos.{puedeEscribir ? ' Registra uno con «Nuevo ajuste» o desde una fila de Pagos.' : ''}</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 18, fontSize: '0.85rem', color: '#4a5568', flexWrap: 'wrap' }}>
                <span>Extras: <strong style={{ color: TIPO_COLOR.EXTRA }}>{dinero(extras)}</strong></span>
                <span>Descuentos: <strong style={{ color: TIPO_COLOR.DESCUENTO }}>{dinero(descuentos)}</strong></span>
                <span>Neto: <strong>{conSigno(extras - descuentos)}</strong></span>
                <span style={{ color: '#a0aec0' }}>{hayFiltros ? 'de lo que ves' : 'de todos'}</span>
              </div>
              <div className="tasks-table-wrapper" style={{ maxHeight: 360, overflow: 'auto' }}>
                <table className="tasks-table">
                  <thead>
                    <tr>
                      <th>Persona <ColumnFilter cf={cf} col="persona" orden={cf.ordenDe('persona')} /></th>
                      <th>Tipo <ColumnFilter cf={cf} col="tipo" orden={cf.ordenDe('tipo')} /></th>
                      <th>Fecha <ColumnFilter cf={cf} col="fecha" orden={cf.ordenDe('fecha')} /></th>
                      <th style={{ textAlign: 'right' }}>Monto <ColumnFilter cf={cf} col="monto" orden={cf.ordenDe('monto')} /></th>
                      <th>Motivo <ColumnFilter cf={cf} col="concepto" orden={cf.ordenDe('concepto')} /></th>
                      <th>Viaje <ColumnFilter cf={cf} col="viaje" orden={cf.ordenDe('viaje')} /></th>
                      {puedeEscribir && <th className="col-acciones"><span className="visually-hidden">Acciones</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.length === 0 && (
                      <FilaSinResultados columnas={puedeEscribir ? 7 : 6} mensaje="No hay ajustes que coincidan con los filtros." onLimpiar={hayFiltros ? limpiarTodo : undefined} />
                    )}
                    {filas.map((a) => (
                      <tr key={a.id}>
                        <td><span style={{ fontWeight: 600 }}>{a.persona}</span></td>
                        <td><span className="status-badge" style={{ background: `${TIPO_COLOR[a.tipo]}1f`, color: TIPO_COLOR[a.tipo] }}>{TIPO_LABEL[a.tipo] ?? a.tipo}</span></td>
                        <td>{formatoDia(a.fecha)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: TIPO_COLOR[a.tipo] }}>
                          {a.tipo === 'DESCUENTO' ? '−' : '+'}{dinero(a.monto)}
                        </td>
                        <td>{a.concepto}</td>
                        <td style={{ fontFamily: 'monospace' }}>{a.numeroGuia || '—'}</td>
                        {puedeEscribir && <td className="col-acciones"><RowActionsMenu actions={accionesDe(a)} /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>

      {formulario && (
        <AjusteFormModal
          ajuste={formulario.ajuste}
          pagos={pagos}
          ajustes={ajustes}
          onClose={() => setFormulario(null)}
          onGuardado={() => { setFormulario(null); cargar(); onCambio(); }}
        />
      )}

      {aBorrar && (
        <ConfirmDialog
          title="Eliminar ajuste"
          message={`¿Eliminar el ${TIPO_LABEL[aBorrar.tipo]?.toLowerCase()} de ${dinero(aBorrar.monto)} a ${aBorrar.persona} («${aBorrar.concepto}»)? Dejará de salir en su rol de pago.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarBorrar}
          onCancel={() => setABorrar(null)}
        />
      )}
    </>
  );
}
