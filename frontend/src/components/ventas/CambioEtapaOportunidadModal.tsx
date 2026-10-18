import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import ErrorBanner from '../common/ErrorBanner';
import DateInput from '../common/DateInput';
import MotivoCierreModal from './MotivoCierreModal';
import { diaCorto } from '../../utils/contratoComercial';
import {
  cambiarEtapaOportunidad,
  getContratosComerciales,
  type AceptarContratoInput,
  type ContratoComercial,
  type ContratoResultado,
  type Oportunidad,
  type SalesClientStage,
} from '../../services/ventas.service';

interface Props {
  oportunidad: Oportunidad;
  etapas: SalesClientStage[];
  destino: SalesClientStage;
  onDone: (o: Oportunidad & { contratoResultado?: ContratoResultado }) => void;
  onCancel: () => void;
}

const ESTADOS_VIGENTES = ['VIGENTE', 'POR_VENCER', 'POR_INICIAR'];

const Badge = ({ label, color }: { label: string; color?: string }) => (
  <span className="status-badge" style={{ backgroundColor: (color || '#718096') + '22', color: color || '#718096', whiteSpace: 'nowrap' }}>
    {label}
  </span>
);

// Cambio de etapa de UNA oportunidad. Cada destino pide lo que le corresponde:
// Perder la oportunidad exige el motivo (MotivoCierreModal), Cotizada pide el
// monto y la fecha, y el resto solo se confirma. Es el único lugar donde se
// cambia la etapa.
export default function CambioEtapaOportunidadModal({ oportunidad, etapas, destino, onDone, onCancel }: Props) {
  const origen = etapas.find((e) => e.key === oportunidad.status) ?? null;
  const [monto, setMonto] = useState(oportunidad.quotedAmount != null ? String(oportunidad.quotedAmount) : '');
  const [fecha, setFecha] = useState(oportunidad.quotedAt ? oportunidad.quotedAt.slice(0, 10) : '');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const esPerdida = destino.key === 'RECHAZADO';
  const esCotizado = destino.key === 'COTIZADO';
  const esAceptada = destino.key === 'ACEPTADO';

  // Fase 3: al aceptar se pregunta el tipo y qué pasa con el contrato.
  const [tipo, setTipo] = useState<'' | 'SERVICIO' | 'PRODUCTO'>('');
  const [vigentes, setVigentes] = useState<ContratoComercial[] | null>(null);
  // 'nuevo' = contrato nuevo; número = se suma a ese contrato vigente.
  const [eleccion, setEleccion] = useState<'' | 'nuevo' | number>('');
  const [garantia, setGarantia] = useState<'' | 'si' | 'no'>('');
  const [meses, setMeses] = useState('');

  useEffect(() => {
    if (!esAceptada) return;
    getContratosComerciales({ clienteId: oportunidad.salesClientId, tipo: 'SERVICIO' })
      .then((lista) => setVigentes(lista.filter((c) => ESTADOS_VIGENTES.includes(c.estado))))
      .catch(() => setVigentes([]));
  }, [esAceptada, oportunidad.salesClientId]);

  const cliente = oportunidad.salesClient.name;
  const serviciosTexto = oportunidad.services.map((s) => s.name).join(', ');
  const sinServicios = esAceptada && oportunidad.services.length === 0;

  if (esPerdida) {
    return (
      <MotivoCierreModal
        kind="OPP_PERDIDA"
        titulo="¿Por qué se perdió?"
        descripcion={`${oportunidad.salesClient.name}${oportunidad.title ? ` · ${oportunidad.title}` : ''}`}
        confirmLabel="Marcar como perdida"
        onConfirm={async (motivo) => {
          onDone(await cambiarEtapaOportunidad(oportunidad.id, { toStatus: destino.key, motivo }));
        }}
        onCancel={onCancel}
      />
    );
  }

  const confirmar = async () => {
    setError('');
    const montoNumero = monto.trim() === '' ? undefined : Number(monto.replace(',', '.'));
    if (esCotizado && montoNumero !== undefined && (Number.isNaN(montoNumero) || montoNumero < 0)) {
      return setError('El monto cotizado no es válido.');
    }
    let contrato: AceptarContratoInput | undefined;
    if (esAceptada) {
      if (!tipo) return setError('Elige si lo que se aceptó es un servicio o un producto/instalación.');
      if (tipo === 'SERVICIO') {
        if (vigentes === null) return setError('Estoy revisando los contratos de este cliente; intenta de nuevo en un momento.');
        if (vigentes.length > 0 && eleccion === '') {
          return setError(`Elige a cuál de los contratos vigentes de ${cliente} se suma esta oportunidad, o marca que es un contrato nuevo.`);
        }
        contrato = {
          tipo,
          ...(typeof eleccion === 'number' ? { agreementId: eleccion } : {}),
          ...(eleccion === 'nuevo' ? { confirmarNuevo: true } : {}),
        };
      } else {
        if (garantia === '') return setError('Indica si el producto o la instalación tiene garantía.');
        const mesesNumero = Number(meses);
        if (garantia === 'si' && (!Number.isInteger(mesesNumero) || mesesNumero < 1 || mesesNumero > 120)) {
          return setError('Escribe los meses de garantía (un número entero entre 1 y 120).');
        }
        contrato = { tipo, ...(garantia === 'si' ? { garantiaMeses: mesesNumero } : {}) };
      }
    }
    setGuardando(true);
    try {
      onDone(
        await cambiarEtapaOportunidad(oportunidad.id, {
          toStatus: destino.key,
          notes: notas.trim() || undefined,
          ...(esCotizado ? { quotedAmount: montoNumero ?? null, ...(fecha ? { quotedAt: fecha } : {}) } : {}),
          ...(contrato ? { contrato } : {}),
        }),
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError((Array.isArray(msg) ? msg[0] : msg) || 'No se pudo cambiar la etapa. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: esAceptada ? 580 : 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Cambiar de etapa</h3>
          <button className="modal-close" onClick={onCancel} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>
            {oportunidad.salesClient.name}{oportunidad.title ? ` · ${oportunidad.title}` : ''}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <Badge label={origen?.label ?? 'Sin etapa'} color={origen?.color} />
            <ArrowRight size={16} color="#718096" />
            <Badge label={destino.label} color={destino.color} />
          </div>

          {esCotizado && (
            <div className="form-row">
              <div className="form-group">
                <label>Monto cotizado (opcional)</label>
                <input type="number" min={0} step="0.01" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Ej: 3000" autoFocus />
              </div>
              <div className="form-group">
                <label>Cotizada el (por defecto hoy)</label>
                <DateInput value={fecha} onChange={setFecha} />
              </div>
            </div>
          )}

          {esAceptada && (
            <div style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
              {sinServicios ? (
                <p style={{ margin: 0, fontSize: 13, color: '#c53030' }}>
                  La oportunidad{oportunidad.title ? ` «${oportunidad.title}»` : ''} de {cliente} no tiene servicios. Edítala y agrégale al menos uno antes de aceptarla, para poder registrar su contrato.
                </p>
              ) : (
                <>
                  <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>
                    ¿Qué aceptó {cliente}? ({serviciosTexto})
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 400, cursor: 'pointer', marginBottom: 4 }}>
                    <input type="radio" name="tipo" checked={tipo === 'SERVICIO'} onChange={() => { setTipo('SERVICIO'); setEleccion(''); }} />
                    Un servicio (se presta de forma recurrente: guardias, monitoreo…)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 400, cursor: 'pointer' }}>
                    <input type="radio" name="tipo" checked={tipo === 'PRODUCTO'} onChange={() => { setTipo('PRODUCTO'); setEleccion(''); }} />
                    Un producto o una instalación (venta única)
                  </label>

                  {tipo === 'SERVICIO' && vigentes === null && (
                    <p style={{ margin: '10px 0 0', fontSize: 12, color: '#888' }}>Revisando los contratos vigentes de {cliente}...</p>
                  )}

                  {tipo === 'SERVICIO' && vigentes !== null && vigentes.length === 0 && (
                    <p style={{ margin: '10px 0 0', fontSize: 13, color: '#4a5568' }}>
                      {cliente} no tiene contratos de servicio vigentes. Al aceptar se creará un contrato nuevo{oportunidad.title ? ` «${oportunidad.title}»` : ''} con {serviciosTexto}, desde hoy y sin fecha de fin (la completas después en Contratos).
                    </p>
                  )}

                  {tipo === 'SERVICIO' && vigentes !== null && vigentes.length > 0 && (
                    <div style={{ marginTop: 10, background: '#fffbeb', border: '1px solid #f6e05e', borderRadius: 8, padding: '10px 12px' }}>
                      <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>
                        {cliente} ya tiene {vigentes.length} contrato{vigentes.length === 1 ? '' : 's'} vigente{vigentes.length === 1 ? '' : 's'} de servicio. ¿{serviciosTexto} {vigentes.length === 1 ? 'es adicional a ese contrato' : 'es adicional a alguno de ellos'}?
                      </p>
                      {vigentes.map((c) => (
                        <label key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, fontWeight: 400, cursor: 'pointer', marginBottom: 4 }}>
                          <input type="radio" name="eleccion" style={{ marginTop: 3 }} checked={eleccion === c.id} onChange={() => setEleccion(c.id)} />
                          <span>
                            Sí, sumarlo a <strong>{c.title ? `«${c.title}»` : `contrato #${c.id}`}</strong> ({c.services.map((s) => s.name).join(', ')}; {c.endDate ? `hasta el ${diaCorto(c.endDate)}` : 'sin fecha de fin'})
                          </span>
                        </label>
                      ))}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 400, cursor: 'pointer' }}>
                        <input type="radio" name="eleccion" checked={eleccion === 'nuevo'} onChange={() => setEleccion('nuevo')} />
                        No, es un contrato nuevo{oportunidad.title ? ` («${oportunidad.title}»)` : ''}
                      </label>
                    </div>
                  )}

                  {tipo === 'PRODUCTO' && (
                    <div style={{ marginTop: 10 }}>
                      <p style={{ margin: '0 0 6px', fontSize: 13, color: '#4a5568' }}>
                        Se registrará la venta de {serviciosTexto} a {cliente} (venta única, desde hoy{oportunidad.quotedAmount != null ? `, por $${oportunidad.quotedAmount}` : ''}).
                      </p>
                      <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600 }}>¿Tiene garantía?</p>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 400, cursor: 'pointer', marginBottom: 4 }}>
                        <input type="radio" name="garantia" checked={garantia === 'no'} onChange={() => setGarantia('no')} />
                        No tiene garantía
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 400, cursor: 'pointer' }}>
                        <input type="radio" name="garantia" checked={garantia === 'si'} onChange={() => setGarantia('si')} />
                        Sí, por
                        <input type="number" min={1} max={120} step={1} value={meses} disabled={garantia !== 'si'} onChange={(e) => setMeses(e.target.value)} style={{ width: 70 }} />
                        meses
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {destino.isFinal && (
            <p style={{ fontSize: 13, color: '#718096', margin: '0 0 10px' }}>
              Es una etapa final: la oportunidad se cierra y se borra el siguiente paso del cliente si esta era su oportunidad principal.
            </p>
          )}

          <div className="form-group">
            <label>Nota del cambio (opcional)</label>
            <textarea className="form-textarea" rows={2} maxLength={500} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={guardando}>Cancelar</button>
          <button className="auth-btn" onClick={confirmar} disabled={guardando || sinServicios}>
            {guardando ? 'Guardando...' : destino.isFinal ? 'Confirmar cambio' : 'Cambiar de etapa'}
          </button>
        </div>
      </div>
    </div>
  );
}
