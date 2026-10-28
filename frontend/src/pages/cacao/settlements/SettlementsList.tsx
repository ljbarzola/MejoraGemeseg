import { useState, useEffect, useRef } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import ErrorBanner from '../../../components/common/ErrorBanner';
import SoloAdminDialog from '../../../components/common/SoloAdminDialog';
import { useNavigate } from 'react-router-dom';
import { getSettlements, approveSettlements } from '../../../services/cacao.service';
import { getUser } from '../../../services/auth.service';
import { formatDateEc, formatMoney, estadoLiquidacion, apiErrorMessage } from '../utils';
import { useTablaCacao } from '../useTablaCacao';

const ESTADOS = ['PENDING', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED'];
const codigoLiq = (id: number) => `LIQ-${String(id).padStart(4, '0')}`;
const liquidaciones = (n: number) => `${n} ${n === 1 ? 'liquidación' : 'liquidaciones'}`;

interface Resultado { aprobadas: number[]; omitidas: { id: number; motivo: string }[] }

export default function SettlementsList() {
  const navigate = useNavigate();
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState('');
  const [error, setError] = useState('');
  // Aprobación en bloque
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [aprobando, setAprobando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const resultadoRef = useRef<HTMLDivElement>(null);
  // Quien no puede aprobar ve los botones igual y, al usarlos, se le explica a quién acudir (no se esconden).
  const [soloAdmin, setSoloAdmin] = useState<string | null>(null);

  const me = getUser();
  const puedeDecidir = me?.role === 'ADMIN' || me?.role === 'MANAGER';
  // Solo se puede aprobar una liquidación pendiente que creó otra persona (misma regla del detalle).
  const seleccionable = (s: any) => s.status === 'PENDING' && s.createdBy !== me?.id;

  const load = () => getSettlements().then(setSettlements).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  // El resultado se pinta arriba de la tabla: si la persona ya bajó hasta un botón, no lo vería.
  useEffect(() => {
    if (resultado) resultadoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [resultado]);

  const filtradas = settlements.filter((s) => !estado || s.status === estado);
  const aprobables = filtradas.filter(seleccionable);
  const elegidas = settlements.filter((s) => seleccion.has(s.id) && seleccionable(s));
  const totalElegidas = elegidas.reduce((suma, s) => suma + (s.totalAmount || 0), 0);

  const alternar = (id: number) =>
    setSeleccion((prev) => {
      const sig = new Set(prev);
      if (sig.has(id)) sig.delete(id); else sig.add(id);
      return sig;
    });

  const alternarTodas = () =>
    setSeleccion(aprobables.every((s) => seleccion.has(s.id)) ? new Set() : new Set(aprobables.map((s) => s.id)));

  async function aprobarElegidas() {
    setConfirmando(false);
    setAprobando(true);
    setError('');
    try {
      const r = await approveSettlements(elegidas.map((s) => s.id));
      setResultado(r);
      setSeleccion(new Set());
      await load();
    } catch (err: any) {
      setError(apiErrorMessage(err, 'No se pudieron aprobar las liquidaciones. Inténtalo de nuevo.'));
    } finally { setAprobando(false); }
  }

  const { tabla, selectorColumnas, buscador, botonExportar, limpiarBusqueda, hayBusqueda } = useTablaCacao<any>({
    clave: 'liquidaciones',
    filas: filtradas,
    idFila: (s) => s.id,
    ordenInicial: 'id',
    direccionInicial: 'desc',
    principal: {
      key: 'id', excel: { valor: (s) => codigoLiq(s.id) }, ancho: 130,
      label: 'ID',
      orden: (s) => s.id,
      celda: (s) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {puedeDecidir && (
            seleccionable(s)
              ? <input type="checkbox" checked={seleccion.has(s.id)} onChange={() => alternar(s.id)} aria-label={`Seleccionar ${codigoLiq(s.id)}`} />
              : <span style={{ display: 'inline-block', width: 13 }} />
          )}
          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#6b46c1' }}>{codigoLiq(s.id)}</span>
        </span>
      ),
    },
    columnas: [
      { key: 'fecha', excel: { tipo: 'fecha' }, label: 'Fecha', orden: (s) => new Date(s.date).getTime(), celda: (s) => formatDateEc(s.date) },
      { key: 'proveedor', ancho: 200, label: 'Proveedor', orden: (s) => s.supplier?.name, celda: (s) => s.supplier?.name || '—' },
      {
        key: 'periodo', excel: { valor: (s) => `${formatDateEc(s.periodStart)} - ${formatDateEc(s.periodEnd)}` }, ancho: 210,
        label: 'Periodo',
        orden: (s) => new Date(s.periodStart).getTime(),
        celda: (s) => `${formatDateEc(s.periodStart)} - ${formatDateEc(s.periodEnd)}`,
      },
      { key: 'peso', excel: { titulo: 'Peso Neto Total (kg)' }, label: 'Peso Neto Total', orden: (s) => s.totalNetWeight, celda: (s) => `${s.totalNetWeight.toLocaleString()} kg` },
      { key: 'descuentos', excel: { titulo: 'Descuentos (kg)' }, label: 'Descuentos', orden: (s) => s.totalDeductions, celda: (s) => `${s.totalDeductions.toLocaleString()} kg` },
      { key: 'precio', excel: { tipo: 'moneda', titulo: 'Precio Final ($/kg)' }, label: 'Precio Final', orden: (s) => s.finalPrice, celda: (s) => `$${s.finalPrice.toFixed(2)}/kg` },
      { key: 'monto', excel: { tipo: 'moneda', titulo: 'Monto Total ($)' }, label: 'Monto Total', orden: (s) => s.totalAmount, celda: (s) => `$${s.totalAmount.toFixed(2)}` },
      {
        key: 'estado', ancho: 130,
        label: 'Estado',
        orden: (s) => estadoLiquidacion(s.status).label,
        celda: (s) => (
          <span className="status-badge" style={{ backgroundColor: estadoLiquidacion(s.status).bg, color: estadoLiquidacion(s.status).color }}>
            {estadoLiquidacion(s.status).label}
          </span>
        ),
      },
    ],
    acciones: (s) => (
      <button className="btn-sm-edit btn-sm-edit--texto" onClick={() => navigate(`/cacao/settlements/${s.id}`, { state: { from: '/cacao/settlements' } })}>Ver</button>
    ),
  });

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Cacao"
        title="Liquidaciones"
        description="Lo que se le paga a cada proveedor por su cacao. Un gerente debe aprobar la liquidación antes de que nazca la deuda."
        actions={
          <>
            <button className="auth-btn" onClick={() => navigate('/cacao/settlements/new')}>+ Nueva Liquidación</button>
          </>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-fields">
          {buscador}
          <select className="filter-select" value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{estadoLiquidacion(e).label}</option>)}
          </select>
        </div>
        <div className="filter-bar-actions">
          {/* Siempre visibles (no aparecen ni desaparecen): se desactivan cuando no aplican. */}
          <button className="btn-secondary" disabled={puedeDecidir && aprobables.length === 0}
            title="Marca o desmarca todas las pendientes que puedes aprobar"
            onClick={() => (puedeDecidir ? alternarTodas() : setSoloAdmin('apruebe liquidaciones'))}>
            Seleccionar por aprobar
          </button>
          <button className="auth-btn" disabled={aprobando || (puedeDecidir && elegidas.length === 0)}
            onClick={() => (puedeDecidir ? setConfirmando(true) : setSoloAdmin('apruebe liquidaciones'))}>
            {aprobando ? 'Aprobando...' : `Aprobar seleccionadas (${elegidas.length})`}
          </button>
          {selectorColumnas}
          {botonExportar}
          <ClearFiltersButton onClear={() => { setEstado(''); limpiarBusqueda(); }} disabled={!estado && !hayBusqueda} />
        </div>
      </div>

      <ErrorBanner mensaje={error} />

      {resultado && (
        <div ref={resultadoRef} className={resultado.omitidas.length > 0 ? 'auth-error-banner' : 'auth-info-banner'} style={{ marginBottom: 16 }}>
          <div>
            {resultado.aprobadas.length > 0
              ? `Se aprobaron ${liquidaciones(resultado.aprobadas.length)}: ${resultado.aprobadas.map(codigoLiq).join(', ')}.`
              : 'No se aprobó ninguna liquidación.'}
          </div>
          {resultado.omitidas.length > 0 && (
            <div style={{ marginTop: 6 }}>
              No se pudieron aprobar:
              <ul style={{ margin: '4px 0 0 18px' }}>
                {resultado.omitidas.map((o) => <li key={o.id}>{codigoLiq(o.id)}: {o.motivo}</li>)}
              </ul>
            </div>
          )}
          <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => setResultado(null)}>Entendido</button>
        </div>
      )}

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando liquidaciones...</div>
        ) : settlements.length === 0 ? (
          <div className="empty-state">Todavía no hay liquidaciones. Liquida lo que le debes a un proveedor con «+ Nueva Liquidación»; un gerente la aprueba y recién ahí nace la cuenta por pagar.</div>
        ) : filtradas.length === 0 ? (
          <div className="empty-state">No hay liquidaciones con ese estado.</div>
        ) : (
          tabla
        )}
      </div>

      {confirmando && (
        <ConfirmDialog
          title="Aprobar liquidaciones"
          message={`Vas a aprobar ${liquidaciones(elegidas.length)} por ${formatMoney(totalElegidas)}. Se generará la cuenta por pagar de cada una y ya se podrán pagar.`}
          confirmLabel="Aprobar"
          onCancel={() => setConfirmando(false)}
          onConfirm={aprobarElegidas}
        />
      )}
      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}
    </div>
  );
}
