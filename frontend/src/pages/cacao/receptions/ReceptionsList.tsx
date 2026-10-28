import { useState, useEffect } from 'react';
import PageHeader from '../../../components/common/PageHeader';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import { useNavigate } from 'react-router-dom';
import { getReceptions, closeReception, reopenReception, voidReception } from '../../../services/cacao.service';
import { formatDateEc, apiErrorMessage } from '../utils';
import { useTablaCacao } from '../useTablaCacao';
import { useCacaoUnidades, ABREVIATURA_UNIDAD as UNIT_ABBR } from '../useCacaoUnidades';
import { getUser } from '../../../services/auth.service';
import MotivoDialog from '../MotivoDialog';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import ErrorBanner from '../../../components/common/ErrorBanner';
import SoloAdminDialog from '../../../components/common/SoloAdminDialog';
import RowActionsMenu from '../../../components/common/RowActionsMenu';

const PERFIL_PESAJE: Record<string, string> = { BULTOS: 'Por bultos', BASCULA: 'En báscula' };

/** Cuánto de la entrega ya se le liquidó al proveedor: lo liquidado (sin contar rechazos ni anulaciones) frente al peso neto recibido. */
function estadoLiquidacionEntrega(r: { netWeight: number; liquidadoKg?: number; closedAt?: string | null; voidedAt?: string | null }) {
  // Una recepción anulada (registrada por error) se muestra aparte de todo lo demás.
  if (r.voidedAt) return { orden: 4, label: 'Anulada', bg: '#fed7d7', color: '#9b2c2c' };
  // Una entrega cerrada sin liquidar se muestra aparte, sin importar cuánto se liquidó.
  if (r.closedAt) return { orden: 3, label: 'Cerrada', bg: '#e2e8f0', color: '#4a5568' };
  const liquidado = r.liquidadoKg || 0;
  // Misma tolerancia de redondeo que usa el servidor al topar la liquidación.
  if (liquidado <= 0.001) return { orden: 0, label: 'Sin liquidar', bg: '#fefcbf', color: '#975a16' };
  if (liquidado < r.netWeight - 0.001) return { orden: 1, label: 'Parcial', bg: '#bee3f8', color: '#2b6cb0' };
  return { orden: 2, label: 'Liquidada', bg: '#c6f6d5', color: '#276749' };
}

export default function ReceptionsList() {
  const { factor: factorUnidad } = useCacaoUnidades();
  const navigate = useNavigate();
  const [receptions, setReceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cerrando, setCerrando] = useState<any | null>(null);
  const [reabriendo, setReabriendo] = useState<any | null>(null);
  const [anulando, setAnulando] = useState<any | null>(null);
  // Quien no puede decidir ve los botones igual y, al usarlos, se le explica a quién acudir (no se esconden).
  const [soloAdmin, setSoloAdmin] = useState<string | null>(null);
  const rol = getUser()?.role;
  const puedeDecidir = rol === 'ADMIN' || rol === 'MANAGER';
  const requiere = (accion: string, fn: () => void) => (puedeDecidir ? fn() : setSoloAdmin(accion));
  // Anular es solo del administrador (corrige un error de registro y toca el inventario).
  const requiereAdmin = (accion: string, fn: () => void) => (rol === 'ADMIN' ? fn() : setSoloAdmin(accion));

  const load = () => getReceptions().then(setReceptions).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  async function ejecutar(fn: () => Promise<unknown>, fallback: string) {
    setError('');
    try {
      await fn();
      await load();
    } catch (err: any) {
      setError(apiErrorMessage(err, fallback));
    }
  }

  // Filtros en la cabecera de cada columna (se aplican a las filas ya cargadas).
  const kg = (n: number) => `${n.toLocaleString()} kg`;
  const cf = useColumnFilters<any>(receptions, [
    { key: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', soloDia: true, getValue: (r) => r.date },
    { key: 'proveedor', etiqueta: 'Proveedor', tipo: 'valores', vacio: 'Sin proveedor', getValues: (r) => (r.supplier?.name ? { valor: String(r.supplier.id ?? r.supplier.name), etiqueta: r.supplier.name } : null) },
    { key: 'guia', etiqueta: 'Guía', tipo: 'texto', getValue: (r) => r.guideNumber },
    { key: 'entrada', etiqueta: 'Entrada', tipo: 'valores', orden: ['KG', 'TON', 'SACO'], getValues: (r) => r.unitOfMeasure || 'KG' },
    { key: 'bruto', etiqueta: 'Peso Bruto', tipo: 'numero', formato: kg, getValue: (r) => r.grossWeight },
    { key: 'tara', etiqueta: 'Tara', tipo: 'numero', formato: kg, getValue: (r) => r.tare },
    { key: 'neto', etiqueta: 'Peso Neto', tipo: 'numero', formato: kg, getValue: (r) => r.netWeight },
    { key: 'humedad', etiqueta: 'Humedad %', tipo: 'numero', formato: (n) => `${n}%`, getValue: (r) => r.humidity },
    { key: 'impurezas', etiqueta: 'Impurezas %', tipo: 'numero', formato: (n) => `${n}%`, getValue: (r) => r.impurities },
    { key: 'precio', etiqueta: 'Precio Prov.', tipo: 'numero', formato: (n) => `$${n.toFixed(2)}`, getValue: (r) => r.provisionalPrice },
    { key: 'lote', etiqueta: 'Lote', tipo: 'valores', vacio: 'Sin lote', getValues: (r) => r.lot?.code },
  ]);
  const filas = cf.filas;

  function getOrigWeight(kg: number, unit: string | null) {
    if (!unit || unit === 'KG') return null;
    // El peso del saco es el de la empresa; si aún no lo configuró no se inventa una conversión.
    const factor = factorUnidad(unit);
    if (!factor) return null;
    return { value: (kg / factor).toFixed(2), abbr: UNIT_ABBR[unit] || unit };
  }

  const pesoConUnidad = (kg: number, unit: string | null, color: string, negrita?: boolean) => {
    const orig = getOrigWeight(kg, unit);
    return (
      <span style={negrita ? { fontWeight: 700 } : undefined}>
        {kg.toLocaleString()} kg
        {orig && <span style={{ fontSize: '11px', color, fontWeight: negrita ? 600 : undefined, marginLeft: '4px' }}>({orig.value} {orig.abbr})</span>}
      </span>
    );
  };

  const { tabla, selectorColumnas, buscador, botonExportar, limpiarBusqueda, hayBusqueda } = useTablaCacao<any>({
    clave: 'recepciones',
    filas: receptions,
    idFila: (r) => r.id,
    estiloFila: (r) => (r.voidedAt ? { opacity: 0.55 } : undefined),
    ordenInicial: 'fecha',
    direccionInicial: 'desc',
    principal: { key: 'fecha', excel: { tipo: 'fecha' }, ancho: 100, label: 'Fecha', orden: (r) => new Date(r.date).getTime(), celda: (r) => formatDateEc(r.date) },
    columnas: [
      { key: 'proveedor', ancho: 200, label: 'Proveedor', orden: (r) => r.supplier?.name, celda: (r) => r.supplier?.name || '—' },
      { key: 'punto', ancho: 150, label: 'Punto de acopio', orden: (r) => r.punto?.nombre, celda: (r) => r.punto?.nombre || '—' },
      { key: 'guia', ancho: 130, label: 'Guía', orden: (r) => r.guideNumber, celda: (r) => r.guideNumber },
      { key: 'ticket', ancho: 130, label: 'Ticket', orden: (r) => r.ticketNumber, celda: (r) => r.ticketNumber || '—' },
      { key: 'perfil', excel: { valor: (r) => PERFIL_PESAJE[r.weighingProfile] || '' }, ancho: 130, label: 'Perfil de pesaje', ocultaPorDefecto: true, orden: (r) => r.weighingProfile, celda: (r) => PERFIL_PESAJE[r.weighingProfile] || '—' },
      { key: 'chofer', ancho: 170, label: 'Chofer', ocultaPorDefecto: true, orden: (r) => r.driverName, celda: (r) => r.driverName || '—' },
      { key: 'placa', ancho: 110, label: 'Placa', ocultaPorDefecto: true, orden: (r) => r.vehiclePlate, celda: (r) => r.vehiclePlate || '—' },
      {
        key: 'entrada',
        label: 'Entrada',
        orden: (r) => r.unitOfMeasure || 'KG',
        celda: (r) => (
          <span className="status-badge" style={{
            backgroundColor: r.unitOfMeasure === 'KG' ? '#f0fff4' : '#ebf8ff',
            color: r.unitOfMeasure === 'KG' ? '#276749' : '#2b6cb0',
            fontSize: '11px',
          }}>
            {r.unitOfMeasure || 'KG'}
          </span>
        ),
      },
      { key: 'bruto', excel: { titulo: 'Peso Bruto (kg)' }, ancho: 170, label: 'Peso Bruto', orden: (r) => r.grossWeight, celda: (r) => pesoConUnidad(r.grossWeight, r.unitOfMeasure, '#718096') },
      { key: 'tara', excel: { titulo: 'Tara (kg)' }, ancho: 150, label: 'Tara', orden: (r) => r.tare, celda: (r) => pesoConUnidad(r.tare, r.unitOfMeasure, '#718096') },
      { key: 'neto', excel: { titulo: 'Peso Neto (kg)' }, ancho: 170, label: 'Peso Neto', orden: (r) => r.netWeight, celda: (r) => pesoConUnidad(r.netWeight, r.unitOfMeasure, '#2b6cb0', true) },
      { key: 'humedad', excel: { tipo: 'porcentaje', titulo: 'Humedad (%)' }, label: 'Humedad %', orden: (r) => r.humidity, celda: (r) => `${r.humidity}%` },
      { key: 'impurezas', excel: { tipo: 'porcentaje', titulo: 'Impurezas (%)' }, label: 'Impurezas %', orden: (r) => r.impurities, celda: (r) => `${r.impurities}%` },
      { key: 'precio', excel: { tipo: 'moneda', titulo: 'Precio Prov. ($/kg)' }, label: 'Precio Prov.', orden: (r) => r.provisionalPrice, celda: (r) => `$${r.provisionalPrice.toFixed(2)}` },
      {
        key: 'lote', ancho: 150,
        label: 'Lote',
        orden: (r) => r.lot?.code,
        celda: (r) =>
          r.lot ? (
            <span className="status-badge" style={{ backgroundColor: '#ebf8ff', color: '#2b6cb0' }}>{r.lot.code}</span>
          ) : '—',
      },
      {
        key: 'liquidacion', excel: { valor: (r) => estadoLiquidacionEntrega(r).label }, ancho: 130,
        label: 'Liquidación',
        orden: (r) => estadoLiquidacionEntrega(r).orden,
        celda: (r) => {
          const e = estadoLiquidacionEntrega(r);
          const detalle = r.voidedAt
            ? `Anulada el ${formatDateEc(r.voidedAt)}: ${r.voidReason || 'sin motivo'}`
            : r.closedAt
            ? `Cerrada sin liquidar el ${formatDateEc(r.closedAt)}: ${r.closeReason || 'sin motivo'}`
            : `Liquidado ${(r.liquidadoKg || 0).toLocaleString()} de ${r.netWeight.toLocaleString()} kg`;
          return (
            <span className="status-badge" style={{ backgroundColor: e.bg, color: e.color }} title={detalle}>
              {e.label}
            </span>
          );
        },
      },
    ],
    // Cerrar una entrega sin liquidarla (o reabrirla si ya se cerró). Una liquidada por completo no tiene nada que cerrar.
    // Anular (error de registro) va detrás de «⋯», solo para el administrador.
    acciones: (r) => {
      if (r.voidedAt) return null;
      let principal = null;
      if (r.closedAt) {
        principal = <button className="btn-sm-edit btn-sm-edit--texto" onClick={() => requiere('reabra entregas cerradas', () => setReabriendo(r))}>Reabrir</button>;
      } else if (estadoLiquidacionEntrega(r).orden !== 2) {
        principal = (
          <button className="btn-sm-edit btn-sm-edit--texto" title="Cerrar sin liquidar" onClick={() => requiere('cierre entregas sin liquidar', () => setCerrando(r))}>
            Cerrar entrega
          </button>
        );
      }
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {principal}
          <RowActionsMenu
            actions={[{
              label: 'Anular recepción',
              danger: true,
              hint: 'Para un error de registro: el lote queda en cero',
              onClick: () => requiereAdmin('anule recepciones', () => setAnulando(r)),
            }]}
          />
        </div>
      );
    },
  });

  return (
    <div className="page-container">
      <PageHeader
        eyebrow="Cacao"
        title="Recepciones"
        description="Cada entrega de cacao que recibes. Al guardarla se crea su lote y entra al inventario."
        actions={
          <>
            <button className="auth-btn" onClick={() => navigate('/cacao/receptions/new')}>+ Nueva Recepción</button>
          </>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-fields">{buscador}</div>
        <div className="filter-bar-actions">
          {selectorColumnas}
          {botonExportar}
          <ClearFiltersButton onClear={limpiarBusqueda} disabled={!hayBusqueda} />
        </div>
      </div>

      <ErrorBanner mensaje={error} />

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando recepciones...</div>
        ) : receptions.length === 0 ? (
          <div className="empty-state">Todavía no hay recepciones. Cada vez que un proveedor te entregue cacao, regístralo con «+ Nueva Recepción»: se crea su lote y entra al inventario.</div>
        ) : (
          tabla
        )}
      </div>

      {cerrando && (
        <MotivoDialog
          tipo="RECEPCION"
          title="Cerrar entrega sin liquidar"
          message={`Indica por qué no se le va a liquidar al proveedor esta entrega (guía ${cerrando.guideNumber}). Dejará de ofrecerse al liquidar; puedes reabrirla después.`}
          confirmLabel="Cerrar entrega"
          onCancel={() => setCerrando(null)}
          onConfirm={(reason) => {
            const r = cerrando;
            setCerrando(null);
            ejecutar(() => closeReception(r.id, reason), 'No se pudo cerrar la entrega.');
          }}
        />
      )}
      {reabriendo && (
        <ConfirmDialog
          title="Reabrir entrega"
          message={`La entrega con guía ${reabriendo.guideNumber} volverá a ofrecerse al liquidar. ¿Reabrirla?`}
          confirmLabel="Sí, reabrir"
          onCancel={() => setReabriendo(null)}
          onConfirm={() => {
            const r = reabriendo;
            setReabriendo(null);
            ejecutar(() => reopenReception(r.id), 'No se pudo reabrir la entrega.');
          }}
        />
      )}
      {anulando && (
        <MotivoDialog
          tipo="ANULACION"
          title="Anular recepción"
          message={`Vas a anular la entrega con guía ${anulando.guideNumber}: su lote (${anulando.lot?.code || 'sin lote'}) quedará en cero y anulado. Solo se puede si no se ha liquidado ni embarcado.`}
          confirmLabel="Anular recepción"
          onCancel={() => setAnulando(null)}
          onConfirm={(reason) => {
            const r = anulando;
            setAnulando(null);
            ejecutar(() => voidReception(r.id, reason), 'No se pudo anular la recepción.');
          }}
        />
      )}
      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}
    </div>
  );
}
