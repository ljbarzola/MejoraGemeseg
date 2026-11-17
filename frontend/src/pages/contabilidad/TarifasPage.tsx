import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import RowActionsMenu from '../../components/common/RowActionsMenu';
import PageHeader from '../../components/common/PageHeader';
import FormModal from '../../components/common/FormModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import DateInput from '../../components/common/DateInput';
import ErrorBanner from '../../components/common/ErrorBanner';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { usePermissions } from '../../hooks/usePermissions';
import {
  actualizarTarifa, crearTarifa, eliminarTarifa, getTarifas,
  type TarifaHistorial, type TarifasRespuesta,
} from '../../services/contabilidad.service';

const TIPOS = ['HACIENDA', 'PUERTO', 'VIP'] as const;
const TIPO_LABEL: Record<string, string> = { HACIENDA: 'Hacienda', PUERTO: 'Puerto', VIP: 'VIP' };
const SIN_FILAS: TarifaHistorial[] = [];

const usd = (n: number) => `$${n.toFixed(2)}`;
const fechaCorta = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

function mensaje(err: any, porDefecto: string): string {
  const m = err?.response?.data?.message;
  return typeof m === 'string' ? m : Array.isArray(m) ? m.join(' ') : porDefecto;
}

export default function TarifasPage() {
  const { canWrite } = usePermissions();
  const puedeEscribir = canWrite('CONTABILIDAD');
  const [data, setData] = useState<TarifasRespuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<string>('HACIENDA');
  const [valor, setValor] = useState('');
  const [desde, setDesde] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');
  const [aBorrar, setABorrar] = useState<TarifaHistorial | null>(null);
  // Una tarifa que todavía no rige se puede corregir (valor y día de inicio); las que ya rigieron, no.
  const [editando, setEditando] = useState<TarifaHistorial | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    getTarifas()
      .then((d) => { setData(d); setError(''); })
      .catch((e) => setError(mensaje(e, 'No se pudieron cargar las tarifas. Inténtalo de nuevo.')))
      .finally(() => setCargando(false));
  }, []);
  useEffect(cargar, [cargar]);

  // «Definir tarifa» desde Pagos llega con el tipo y el día del viaje que la necesita: se abre el formulario ya lleno.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (!data || params.get('nueva') !== '1') return;
    const t = params.get('tipo') ?? '';
    const d = params.get('desde') ?? '';
    setParams({}, { replace: true });
    if (!puedeEscribir) return;
    setEditando(null);
    setTipo((TIPOS as readonly string[]).includes(t) ? t : 'HACIENDA');
    setValor('');
    setDesde(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : data.hoy);
    setErrorForm('');
    setAbierto(true);
  }, [data, params, setParams, puedeEscribir]);

  const cf = useColumnFilters<TarifaHistorial>(data?.historial ?? SIN_FILAS, [
    { key: 'tipo', etiqueta: 'Tipo', tipo: 'valores', getValues: (t) => ({ valor: t.tipo, etiqueta: TIPO_LABEL[t.tipo] ?? t.tipo }) },
    { key: 'valor', etiqueta: 'Valor por persona', tipo: 'numero', getValue: (t) => t.valorPorPersona, formato: (n) => usd(n) },
    { key: 'desde', etiqueta: 'Rige desde', tipo: 'fecha', getValue: (t) => t.vigenteDesde },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', getValues: (t) => estadoDe(t, data?.hoy ?? '', data) },
  ]);

  function abrirEdicion(t: TarifaHistorial) {
    setEditando(t);
    setTipo(t.tipo);
    setValor(String(t.valorPorPersona));
    setDesde(t.vigenteDesde);
    setErrorForm('');
    setAbierto(true);
  }

  function abrirNueva(tipoInicial?: string) {
    setEditando(null);
    setTipo(tipoInicial ?? 'HACIENDA');
    setValor('');
    setDesde(data?.hoy ?? '');
    setErrorForm('');
    setAbierto(true);
  }

  async function guardar() {
    const num = Number(valor.replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) { setErrorForm('Escribe un valor mayor a 0.'); return; }
    if (!desde) { setErrorForm('Indica desde qué día rige la tarifa.'); return; }
    setGuardando(true);
    setErrorForm('');
    try {
      setData(editando
        ? await actualizarTarifa(editando.id, { valorPorPersona: num, vigenteDesde: desde })
        : await crearTarifa({ tipo, valorPorPersona: num, vigenteDesde: desde }));
      setAbierto(false);
    } catch (e) {
      setErrorForm(mensaje(e, 'No se pudo guardar la tarifa. Inténtalo de nuevo.'));
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!aBorrar) return;
    const t = aBorrar;
    setABorrar(null);
    try {
      setData(await eliminarTarifa(t.id));
      setError('');
    } catch (e) {
      setError(mensaje(e, 'No se pudo quitar la tarifa. Inténtalo de nuevo.'));
    }
  }

  const retroactiva = !!data && !!desde && desde < data.hoy;
  // Al corregir una tarifa que ya rige se recalculan los pagos PENDIENTES de esos viajes; los ya pagados no cambian.
  const afectaPendientes = !!editando && (editando.rige || retroactiva);

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Contabilidad"
        title="Tarifas de custodia"
        description="Lo que se paga por persona en cada viaje según su tipo. Cada viaje se paga con la tarifa vigente el día en que se hizo."
        actions={puedeEscribir ? <button className="auth-btn" onClick={() => abrirNueva()}>+ Nueva tarifa</button> : undefined}
      />

      <ErrorBanner mensaje={error} />

      {cargando && !data ? (
        <div className="loading-state">Cargando tarifas...</div>
      ) : data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
            {TIPOS.map((t) => {
              const v = data.vigentes[t];
              return (
                <div key={t} style={{ padding: 20, background: '#fff', borderRadius: 14, borderLeft: `5px solid ${v === null ? '#eab308' : '#22c55e'}`, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#718096', textTransform: 'uppercase' }}>{TIPO_LABEL[t]}</div>
                  {v === null ? (
                    <>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#b45309', marginTop: 4 }}>Sin definir</div>
                      <div style={{ fontSize: '0.78rem', color: '#a0aec0', marginTop: 4 }}>Los viajes de este tipo pagan $0 hasta que la definas.</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: '2rem', fontWeight: 800, color: '#100F31', marginTop: 4 }}>{usd(v)}</div>
                      <div style={{ fontSize: '0.78rem', color: '#a0aec0', marginTop: 4 }}>
                        por persona · {usd(v * data.personasPorViaje)} por viaje ({data.personasPorViaje} personas)
                      </div>
                    </>
                  )}
                  {puedeEscribir && (
                    <button className="btn-secondary" style={{ marginTop: 12 }} onClick={() => abrirNueva(t)}>
                      {v === null ? 'Definir' : 'Cambiar'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="filter-bar">
            <div className="filter-bar-actions">
              <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
            </div>
          </div>
          <ChipsFiltros cf={cf} />

          <div className="admin-section">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12 }}>Historial de tarifas</h2>
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Tipo<ColumnFilter cf={cf} col="tipo" orden={cf.ordenDe('tipo')} /></th>
                    <th style={{ textAlign: 'right' }}>Valor por persona<ColumnFilter cf={cf} col="valor" orden={cf.ordenDe('valor')} /></th>
                    <th>Rige desde<ColumnFilter cf={cf} col="desde" orden={cf.ordenDe('desde')} /></th>
                    <th>Estado<ColumnFilter cf={cf} col="estado" orden={cf.ordenDe('estado')} /></th>
                    <th className="col-acciones"><span className="visually-hidden">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.historial.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#718096', padding: 24 }}>Todavía no hay tarifas. Define la de cada tipo con «+ Nueva tarifa».</td></tr>
                  )}
                  {data.historial.length > 0 && cf.filas.length === 0 && (
                    <FilaSinResultados columnas={5} mensaje="No hay tarifas que coincidan con los filtros." onLimpiar={cf.limpiar} />
                  )}
                  {cf.filas.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{TIPO_LABEL[t.tipo] ?? t.tipo}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{usd(t.valorPorPersona)}</td>
                      <td>{fechaCorta(t.vigenteDesde)}</td>
                      <td>{estadoDe(t, data.hoy, data).etiqueta}</td>
                      <td className="col-acciones">
                        {puedeEscribir ? (
                          <RowActionsMenu actions={[
                            { label: 'Editar', icon: <Pencil size={14} />, onClick: () => abrirEdicion(t) },
                            { label: 'Quitar', icon: <Trash2 size={14} />, danger: true, onClick: () => setABorrar(t) },
                          ]} />
                        ) : <span className="icon-btn" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {abierto && data && (
        <FormModal
          title={editando ? 'Editar tarifa' : 'Nueva tarifa'}
          descripcion={editando
            ? 'Corrige el valor o el día de inicio de esta tarifa.'
            : 'Se guarda como una tarifa nueva con su fecha: no borra las anteriores.'}
          onClose={() => setAbierto(false)}
          onSubmit={guardar}
          submitLabel={editando ? 'Guardar cambios' : 'Guardar tarifa'}
          saving={guardando}
          error={errorForm}
          ancho={460}
        >
          <div className="form-group">
            <label>Tipo de custodia *</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={!!editando}>
              {TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Valor por persona (USD) *</label>
              <input type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej: 20" />
            </div>
            <div className="form-group">
              <label>Rige desde *</label>
              <DateInput value={desde} onChange={setDesde} required />
            </div>
          </div>
          {(retroactiva || afectaPendientes) && (
            <div style={{ padding: '10px 14px', background: '#fefce8', borderRadius: 10, fontSize: '0.8rem', color: '#744210' }}>
              {editando
                ? 'Esta tarifa ya rige: los viajes de esos días que todavía no se pagaron se recalcularán con este valor. Los pagos ya registrados como pagados no cambian.'
                : 'Esta fecha ya pasó: los viajes desde ese día que todavía no se pagaron se calcularán con este valor. Los ya registrados como pagados no cambian.'}
            </div>
          )}
        </FormModal>
      )}

      {aBorrar && (
        <ConfirmDialog
          title="Quitar tarifa"
          message={aBorrar.rige
            ? `Se quitará la tarifa de ${TIPO_LABEL[aBorrar.tipo] ?? aBorrar.tipo} (${usd(aBorrar.valorPorPersona)}) que rige desde el ${fechaCorta(aBorrar.vigenteDesde)}. Los viajes pendientes de pago desde ese día usarán la tarifa anterior (o quedarán sin tarifa si no hay otra). Los pagos ya registrados no cambian.`
            : `Se quitará la tarifa de ${TIPO_LABEL[aBorrar.tipo] ?? aBorrar.tipo} (${usd(aBorrar.valorPorPersona)}) que rige desde el ${fechaCorta(aBorrar.vigenteDesde)}. Todavía no se usa en ningún pago.`}
          confirmLabel="Quitar"
          danger
          onConfirm={borrar}
          onCancel={() => setABorrar(null)}
        />
      )}
    </div>
  );
}

/** Una tarifa es «Vigente» si es la que rige hoy para su tipo, «Próxima» si empieza después y «Anterior» si ya fue reemplazada. */
function estadoDe(t: TarifaHistorial, hoy: string, data: TarifasRespuesta | null): { valor: string; etiqueta: string } {
  if (t.vigenteDesde > hoy) return { valor: 'proxima', etiqueta: 'Próxima' };
  const vigenteHoy = data?.historial
    .filter((x) => x.tipo === t.tipo && x.vigenteDesde <= hoy)
    .reduce<TarifaHistorial | null>((a, x) => (!a || x.vigenteDesde > a.vigenteDesde ? x : a), null);
  return vigenteHoy?.id === t.id
    ? { valor: 'vigente', etiqueta: 'Vigente' }
    : { valor: 'anterior', etiqueta: 'Anterior' };
}
