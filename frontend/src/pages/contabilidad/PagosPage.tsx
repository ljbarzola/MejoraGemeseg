import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, FileText, Scale, Pencil, Tag, Undo2, Wallet } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import ErrorBanner from '../../components/common/ErrorBanner';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import ColumnPickerMenu from '../../components/common/ColumnPickerMenu';
import ExportTableButton from '../../components/common/ExportTableButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../components/common/ColumnFilter';
import RolDePagoModal from '../../components/contabilidad/RolDePagoModal';
import AjusteFormModal from '../../components/contabilidad/AjusteFormModal';
import AjustesModal from '../../components/contabilidad/AjustesModal';
import RegistrarPagoModal from '../../components/contabilidad/RegistrarPagoModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import RowActionsMenu, { type RowAction } from '../../components/common/RowActionsMenu';
import { usePermissions } from '../../hooks/usePermissions';
import { Contador, KpiFila, dinero } from '../../components/ventas/dashboard/DashboardBits';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { useColumnPreferences } from '../../hooks/useColumnPreferences';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { deshacerPagos, getPagos, type Pago } from '../../services/contabilidad.service';

const TIPO_LABEL: Record<string, string> = { HACIENDA: 'Hacienda', PUERTO: 'Puerto', VIP: 'VIP' };
const SIN_PAGOS: Pago[] = [];

// Se pueden mostrar u ocultar; la persona va siempre primera y fija.
const COLUMNAS: { key: string; label: string }[] = [
  { key: 'estado', label: 'Estado' },
  { key: 'cedula', label: 'Cédula' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'guia', label: 'Guía' },
  { key: 'rol', label: 'Rol' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'placa', label: 'Placa' },
  { key: 'monto', label: 'Tarifa' },
  { key: 'ajuste', label: 'Ajuste' },
  { key: 'total', label: 'Total' },
  { key: 'pagadoEn', label: 'Pagado el' },
  { key: 'referencia', label: 'Referencia' },
];
const COLUMNAS_POR_DEFECTO = ['estado', 'fecha', 'guia', 'rol', 'tipo', 'cliente', 'monto', 'ajuste', 'total'];
const ANCHO: Record<string, number> = { estado: 100, cedula: 115, fecha: 100, guia: 95, rol: 110, tipo: 100, cliente: 110, placa: 100, monto: 95, ajuste: 105, total: 95, pagadoEn: 110, referencia: 150 };
const COLUMNAS_EXPORTAR = [{ key: 'persona', label: 'Persona' }, ...COLUMNAS];

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const diaEcuador = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const formatoDia = (iso: string) => diaEcuador(iso).split('-').reverse().join('/');
const montoTexto = (p: Pago) => (p.sinTarifa ? 'Sin tarifa' : dinero(p.monto));
/** Por qué un pago quedó «sin tarifa», dicho en claro. */
function causaSinTarifa(p: Pago): string {
  const tipo = TIPO_LABEL[p.tipo] ?? p.tipo;
  return p.tarifaDesde
    ? `La primera tarifa de ${tipo} empieza el ${textoDia(p.tarifaDesde)}, y este viaje es del ${textoDia(p.diaViaje)}. Define la tarifa desde esa fecha o corrige la existente.`
    : `Todavía no hay una tarifa de ${tipo}. Defínela en Tarifas.`;
}
const textoDia = (dia: string | null) => (dia ? dia.split('-').reverse().join('/') : '');
const ESTADO_PAGO = (p: Pago) => (p.pagado ? 'Pagado' : 'Pendiente');

function valorExportar(p: Pago, key: string): string | number {
  switch (key) {
    case 'persona': return p.persona;
    case 'cedula': return p.cedula;
    case 'fecha': return formatoDia(p.fecha);
    case 'guia': return p.numeroGuia;
    case 'rol': return p.rol;
    case 'tipo': return TIPO_LABEL[p.tipo] ?? p.tipo;
    case 'cliente': return p.cliente || '';
    case 'placa': return p.placa || '';
    case 'monto': return p.monto;
    case 'ajuste': return p.ajuste;
    case 'total': return p.total;
    case 'estado': return ESTADO_PAGO(p);
    case 'pagadoEn': return textoDia(p.pagadoEn);
    case 'referencia': return p.referencia || '';
    default: return '';
  }
}

/**
 * Pagos (2026-11-16): lo que cobra cada persona por cada viaje que llegó a su destino. Una fila por persona y viaje.
 * Se abre con todo y se filtra en la cabecera de cada columna (fecha, persona, tipo…); «Exportar» baja lo que se ve
 * y «Rol de pago y matriz» arma los PDF de un período. Reemplaza a las pantallas de Nómina y Ganancias por cédula.
 */
export default function PagosPage() {
  const [pagos, setPagos] = useState<Pago[]>(SIN_PAGOS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [rolAbierto, setRolAbierto] = useState(false);
  const navigate = useNavigate();
  const { canWrite } = usePermissions();
  const puedeEscribir = canWrite('CONTABILIDAD');
  // Ajuste nuevo: vacío (desde el botón) o con la persona y el viaje de la fila elegida.
  const [ajustando, setAjustando] = useState<{ cedula: string; persona: string; custodiaId: number } | null>(null);
  const [ajustesAbierto, setAjustesAbierto] = useState(false);
  // Registrar el pago de varios (lo que se ve) o de uno, corregir uno ya registrado, o deshacerlo.
  const [registrando, setRegistrando] = useState<Pago[] | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<Pago | null>(null);
  const [deshaciendo, setDeshaciendo] = useState<Pago | null>(null);

  const cargar = useCallback(() => {
    setLoading(true);
    getPagos()
      .then((d) => { setPagos(d.pagos); setError(''); })
      .catch((e) => setError(e?.response?.data?.message || 'No se pudieron cargar los pagos. Inténtalo de nuevo.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(cargar, [cargar]);

  const columnPrefs = useColumnPreferences('contabilidad-pagos', COLUMNAS_POR_DEFECTO);
  const visibles = columnPrefs.visible.filter((k) => COLUMNAS.some((c) => c.key === k));
  const tablaRef = useResizableColumns('contabilidad-pagos', ['persona', ...visibles, 'acciones']);

  const cf = useColumnFilters<Pago>(pagos, [
    { key: 'persona', etiqueta: 'Persona', tipo: 'valores', getValues: (p) => ({ valor: p.cedula || p.persona, etiqueta: p.persona }) },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ['Pendiente', 'Pagado'], getValues: (p) => ESTADO_PAGO(p) },
    { key: 'cedula', etiqueta: 'Cédula', tipo: 'texto', getValue: (p) => p.cedula },
    { key: 'fecha', etiqueta: 'Fecha del viaje', tipo: 'fecha', getValue: (p) => p.fecha },
    { key: 'guia', etiqueta: 'Guía', tipo: 'texto', getValue: (p) => p.numeroGuia },
    { key: 'rol', etiqueta: 'Rol', tipo: 'valores', getValues: (p) => p.rol },
    { key: 'tipo', etiqueta: 'Tipo', tipo: 'valores', orden: Object.keys(TIPO_LABEL), getValues: (p) => ({ valor: p.tipo, etiqueta: TIPO_LABEL[p.tipo] ?? p.tipo }) },
    { key: 'cliente', etiqueta: 'Cliente', tipo: 'valores', vacio: 'Sin cliente', getValues: (p) => p.cliente },
    { key: 'placa', etiqueta: 'Placa', tipo: 'texto', getValue: (p) => p.placa },
    { key: 'monto', etiqueta: 'Tarifa', tipo: 'numero', getValue: (p) => p.monto, formato: (n) => dinero(n) },
    { key: 'ajuste', etiqueta: 'Ajuste (extra o descuento)', tipo: 'numero', getValue: (p) => p.ajuste, formato: (n) => dinero(n) },
    { key: 'total', etiqueta: 'Total', tipo: 'numero', getValue: (p) => p.total, formato: (n) => dinero(n) },
    { key: 'pagadoEn', etiqueta: 'Pagado el', tipo: 'fecha', getValue: (p) => p.pagadoEn },
    { key: 'referencia', etiqueta: 'Referencia', tipo: 'texto', getValue: (p) => p.referencia },
  ]);
  const hayFiltros = !!busqueda || cf.hayFiltros;
  const limpiarTodo = () => { setBusqueda(''); cf.limpiar(); };

  // Los filtros de columna ya se aplicaron (cf.filas); aquí solo falta el buscador general.
  const filas = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    if (!q) return cf.filas;
    return cf.filas.filter((p) => sinTildes([p.persona, p.cedula, p.numeroGuia, p.cliente, p.placa].filter(Boolean).join(' ')).includes(q));
  }, [cf.filas, busqueda]);

  // Cifras de lo que se ve: cambian con cada filtro (por ejemplo, al filtrar una persona se ve lo que ganó).
  const resumen = useMemo(() => ({
    total: filas.reduce((s, p) => s + p.total, 0),
    porPagar: filas.filter((p) => !p.pagado && !p.sinTarifa).reduce((s, p) => s + p.total, 0),
    pagado: filas.filter((p) => p.pagado).reduce((s, p) => s + p.total, 0),
    pendientes: filas.filter((p) => !p.pagado && !p.sinTarifa),
    pagos: filas.length,
    personas: new Set(filas.map((p) => p.cedula || p.persona)).size,
    viajes: new Set(filas.map((p) => p.numeroGuia)).size,
    sinTarifa: filas.filter((p) => p.sinTarifa).length,
  }), [filas]);

  // Los viajes sin tarifa, juntados por tipo (con el día más antiguo), para el aviso de arriba. Se calcula con todos los
  // pagos, no con lo filtrado: es algo pendiente de configurar, no de la vista.
  const faltanTarifas = useMemo(() => {
    const m = new Map<string, { tipo: string; cantidad: number; desde: string; tarifaDesde: string | null }>();
    for (const p of pagos) {
      if (!p.sinTarifa || p.pagado) continue;
      const a = m.get(p.tipo);
      if (!a) m.set(p.tipo, { tipo: p.tipo, cantidad: 1, desde: p.diaViaje, tarifaDesde: p.tarifaDesde });
      else { a.cantidad++; if (p.diaViaje < a.desde) a.desde = p.diaViaje; }
    }
    return Array.from(m.values());
  }, [pagos]);
  const definirTarifa = (tipo: string, desde: string) =>
    navigate(`/contabilidad/tarifas?nueva=1&tipo=${encodeURIComponent(tipo)}&desde=${encodeURIComponent(desde)}`);

  async function confirmarDeshacer() {
    if (!deshaciendo?.pagoId) return;
    const p = deshaciendo;
    setDeshaciendo(null);
    try {
      await deshacerPagos([p.pagoId!]);
      setError('');
      cargar();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo deshacer el pago. Inténtalo de nuevo.');
    }
  }

  const accionesDe = (p: Pago): RowAction[] => {
    const acciones: RowAction[] = [];
    if (p.pagado) {
      acciones.push({ label: 'Corregir día o referencia', icon: <Pencil size={14} />, onClick: () => setCorrigiendo(p) });
      acciones.push({ label: 'Deshacer pago', icon: <Undo2 size={14} />, danger: true, onClick: () => setDeshaciendo(p) });
    } else {
      if (!p.sinTarifa) acciones.push({ label: 'Registrar pago', icon: <BadgeCheck size={14} />, onClick: () => setRegistrando([p]) });
      else acciones.push({ label: 'Definir la tarifa de este viaje', icon: <Tag size={14} />, onClick: () => definirTarifa(p.tipo, p.diaViaje) });
      acciones.push({
        label: 'Agregar extra o descuento', icon: <Scale size={14} />,
        onClick: () => setAjustando({ cedula: p.cedula, persona: p.persona, custodiaId: p.custodiaId }),
      });
    }
    return acciones;
  };

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Contabilidad"
        title="Pagos"
        description="Lo que cobra cada persona por cada viaje que llegó a su destino, y si ya se le pagó. Filtra por fecha, persona o estado en la cabecera de las columnas."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setRolAbierto(true)} disabled={pagos.length === 0} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FileText size={16} /> Rol de pago y matriz
            </button>
            <button className="btn-secondary" onClick={() => setAjustesAbierto(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Scale size={16} /> Extras y descuentos
            </button>
            {puedeEscribir && (
              <button className="auth-btn" onClick={() => setRegistrando(resumen.pendientes)} disabled={resumen.pendientes.length === 0}
                title="Marca como pagado lo pendiente que ves en la lista" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Wallet size={16} /> Registrar pagos{resumen.pendientes.length > 0 ? ` (${resumen.pendientes.length})` : ''}
              </button>
            )}
          </>
        }
      />

      <ErrorBanner mensaje={error} />

      {faltanTarifas.length > 0 && (
        <div role="alert" style={{ marginTop: 16, padding: '12px 16px', background: '#fffaf0', border: '1px solid #f6ad55', borderRadius: 10, color: '#7b341e', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 6 }}>
            <AlertTriangle size={16} /> Hay viajes sin tarifa: valen $0 y no se pueden registrar como pagados
          </div>
          <p style={{ margin: '0 0 8px' }}>
            Cada viaje se paga con la tarifa de su tipo vigente el día en que se hizo. Define la tarifa que falta (con la fecha desde la que rige) y los pagos se recalculan solos.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            {faltanTarifas.map((f) => (
              <li key={f.tipo}>
                <strong>{TIPO_LABEL[f.tipo] ?? f.tipo}</strong>: {f.cantidad} pago(s), desde el viaje del {textoDia(f.desde)}.{' '}
                {f.tarifaDesde
                  ? `La primera tarifa existente empieza el ${textoDia(f.tarifaDesde)}.`
                  : 'Este tipo no tiene ninguna tarifa.'}{' '}
                {puedeEscribir && (
                  <button type="button" className="btn-secondary" style={{ padding: '2px 10px', fontSize: 12, marginLeft: 4 }} onClick={() => definirTarifa(f.tipo, f.desde)}>
                    Definir tarifa de {TIPO_LABEL[f.tipo] ?? f.tipo}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <KpiFila>
          <Contador titulo="Total de lo que ves" valor={dinero(resumen.total)} color="#2f855a" detalle={hayFiltros ? 'Con los filtros aplicados' : 'Todos los pagos'} />
          <Contador titulo="Por pagar" valor={dinero(resumen.porPagar)} color="#d97706" detalle={`${resumen.pendientes.length} pago(s) pendiente(s)`} />
          <Contador titulo="Pagado" valor={dinero(resumen.pagado)} color="#2b6cb0" detalle="Ya registrado como pagado" />
          <Contador titulo="Personas" valor={resumen.personas} color="#d97706" detalle="Choferes y custodios" />
          <Contador titulo="Viajes" valor={resumen.viajes} color="#6b46c1" detalle="Que llegaron a su destino" />
          {resumen.sinTarifa > 0 && <Contador titulo="Sin tarifa" valor={resumen.sinTarifa} color="#c53030" detalle="Valen $0 hasta definir su tarifa (ver aviso)" />}
        </KpiFila>
      </div>

      <div className="filter-bar" style={{ marginTop: 16 }}>
        <div className="filter-bar-fields">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por persona, cédula, guía, cliente o placa..."
            style={{ flex: '1 1 200px', minWidth: 160, padding: '8px 12px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <div className="filter-bar-actions">
          <ColumnPickerMenu
            columns={COLUMNAS}
            visible={columnPrefs.visible}
            pinned={columnPrefs.pinned}
            maxPinned={columnPrefs.maxPinned}
            fixedLabel="Persona"
            onApply={(keys, fijas) => columnPrefs.set(keys, fijas)}
          />
          <ClearFiltersButton onClear={limpiarTodo} disabled={!hayFiltros} />
          <ExportTableButton
            titulo="Pagos de custodia"
            columns={COLUMNAS_EXPORTAR}
            defaultKeys={['persona', ...visibles]}
            rows={filas}
            getValue={valorExportar}
          />
        </div>
      </div>

      <ChipsFiltros cf={cf} />

      <div className="admin-section">
        {loading && pagos.length === 0 ? (
          <div className="loading-state">Cargando pagos...</div>
        ) : pagos.length === 0 ? (
          <div className="empty-state">
            <div>Todavía no hay pagos: aparecen cuando un viaje de Custodias llega a su destino («Llegó»).</div>
          </div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef} data-fijas={columnPrefs.fijas}>
              <thead>
                <tr>
                  <th style={{ width: 165 }}>Persona <ColumnFilter cf={cf} col="persona" orden={cf.ordenDe('persona')} /></th>
                  {visibles.map((k) => (
                    <th key={k} style={{ width: ANCHO[k], textAlign: ['monto', 'ajuste', 'total'].includes(k) ? 'right' : undefined }}>
                      {COLUMNAS.find((c) => c.key === k)!.label} <ColumnFilter cf={cf} col={k} orden={cf.ordenDe(k)} />
                    </th>
                  ))}
                  {puedeEscribir && <th className="col-acciones"><span className="visually-hidden">Acciones</span></th>}
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={visibles.length + 2} mensaje="No hay pagos que coincidan con los filtros." onLimpiar={hayFiltros ? limpiarTodo : undefined} />
                )}
                {filas.map((p) => (
                  <tr key={p.id}>
                    <td><span className="truncate" style={{ fontWeight: 600 }}>{p.persona || '—'}</span></td>
                    {visibles.map((k) => {
                      switch (k) {
                        case 'estado':
                          return (
                            <td key={k}>
                              <span className="status-badge" style={p.pagado ? { background: '#2f855a1f', color: '#2f855a' } : { background: '#b7791f1f', color: '#b7791f' }}>
                                {ESTADO_PAGO(p)}
                              </span>
                            </td>
                          );
                        case 'pagadoEn': return <td key={k}>{p.pagadoEn ? textoDia(p.pagadoEn) : '—'}</td>;
                        case 'referencia': return <td key={k}><span className="truncate">{p.referencia || '—'}</span></td>;
                        case 'cedula': return <td key={k} style={{ fontFamily: 'monospace' }}>{p.cedula || '—'}</td>;
                        case 'fecha': return <td key={k}>{formatoDia(p.fecha)}</td>;
                        case 'guia': return <td key={k} style={{ fontFamily: 'monospace' }}>{p.numeroGuia}</td>;
                        case 'rol': return <td key={k}>{p.rol}</td>;
                        case 'tipo': return <td key={k}>{TIPO_LABEL[p.tipo] ?? p.tipo}</td>;
                        case 'cliente': return <td key={k}><span className="truncate">{p.cliente || '—'}</span></td>;
                        case 'placa': return <td key={k} style={{ fontFamily: 'monospace' }}>{p.placa || '—'}</td>;
                        case 'monto':
                          return (
                            <td key={k} style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: p.sinTarifa ? '#b45309' : '#2f855a' }} title={p.sinTarifa ? causaSinTarifa(p) : undefined}>
                              {montoTexto(p)}
                            </td>
                          );
                        case 'ajuste':
                          return (
                            <td key={k} style={{ textAlign: 'right', fontFamily: 'monospace', color: p.ajuste < 0 ? '#c53030' : p.ajuste > 0 ? '#2f855a' : '#a0aec0' }}>
                              {p.ajuste === 0 ? '—' : `${p.ajuste > 0 ? '+' : '−'}${dinero(Math.abs(p.ajuste))}`}
                            </td>
                          );
                        case 'total':
                          return <td key={k} style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>{dinero(p.total)}</td>;
                        default: return <td key={k} />;
                      }
                    })}
                    {puedeEscribir && (
                      <td className="col-acciones"><RowActionsMenu actions={accionesDe(p)} /></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rolAbierto && <RolDePagoModal pagos={pagos} onClose={() => setRolAbierto(false)} />}

      {ajustando && (
        <AjusteFormModal
          inicial={ajustando}
          pagos={pagos}
          onClose={() => setAjustando(null)}
          onGuardado={() => { setAjustando(null); cargar(); }}
        />
      )}

      {ajustesAbierto && <AjustesModal pagos={pagos} onClose={() => setAjustesAbierto(false)} onCambio={cargar} />}

      {registrando && (
        <RegistrarPagoModal pagos={registrando} onClose={() => setRegistrando(null)} onHecho={() => { setRegistrando(null); cargar(); }} />
      )}
      {corrigiendo && (
        <RegistrarPagoModal editar={corrigiendo} onClose={() => setCorrigiendo(null)} onHecho={() => { setCorrigiendo(null); cargar(); }} />
      )}
      {deshaciendo && (
        <ConfirmDialog
          title="Deshacer pago"
          message={`Se quitará el registro del pago de ${dinero(deshaciendo.total)} a ${deshaciendo.persona} (${deshaciendo.numeroGuia}). Volverá a «Pendiente» y se calculará con la tarifa de hoy.`}
          confirmLabel="Deshacer pago"
          danger
          onConfirm={confirmarDeshacer}
          onCancel={() => setDeshaciendo(null)}
        />
      )}
    </div>
  );
}
