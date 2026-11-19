import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ServiciosPorCategoria from './ServiciosPorCategoria';
import UbicacionCampo from './UbicacionCampo';
import FlujoComercialPasos from './FlujoComercialPasos';
import ErrorBanner from '../common/ErrorBanner';
import CotizacionesDeOportunidad from './CotizacionesDeOportunidad';
import { usePerm } from '../../contexts/PermissionsContext';
import DateInput from '../common/DateInput';
import { diaEcuador } from '../../utils/rangoFechas';
import SubserviciosCheckboxes from '../common/SubserviciosCheckboxes';
import { useToast } from '../../contexts/ToastContext';
import {
  createOportunidad,
  createSalesClient,
  updateOportunidad,
  subopcionesKey,
  subserviciosDe,
  type Oportunidad,
  type SalesClient,
  type SalesClientField,
  type SalesServicio,
  type UbicacionOportunidad,
} from '../../services/ventas.service';

interface Props {
  modo: 'crear' | 'editar';
  oportunidad?: Oportunidad;
  clientes?: SalesClient[];
  clienteIdInicial?: number;
  servicios: SalesServicio[];
  // Campos del Directorio. Si se pasan (al crear), aparece «Es nueva en el directorio»: la empresa o persona
  // se registra AQUÍ MISMO, sin otra ventana, y nace con esta oportunidad (2026-11-19).
  camposCliente?: SalesClientField[];
  onClose: () => void;
  onSaved: (o: Oportunidad) => void;
}

// Empresa o persona nueva: a la vista, lo que alimenta las cifras (fuente obligatoria, tipo de negocio y
// público/privado); el contacto queda en «Más datos». «Servicio requerido» no se pide: los servicios son los
// de esta oportunidad. La fecha de ingreso es la «Fecha en que llegó» de la oportunidad.
const CAMPOS_A_LA_VISTA = ['tipo_negocio', 'sector'];
const CAMPOS_CONTACTO = ['email', 'phone', 'ruc', 'address'];
const OTRO = '__OTRO__';

// Una oportunidad es una negociación de un servicio de un cliente: aquí se crea
// una nueva (por ejemplo, un cliente que ya contrata y pide otro servicio) o se
// corrigen sus datos. La etapa no se cambia aquí: tiene su propio flujo, porque
// al cotizar se pide el monto y al perder, el motivo.
export default function OportunidadModal({
  modo, oportunidad, clientes = [], clienteIdInicial, servicios, camposCliente, onClose, onSaved,
}: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  // Alta de una empresa o persona nueva dentro de esta misma ventana.
  const [nueva, setNueva] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [datosNuevo, setDatosNuevo] = useState<Record<string, string>>({});
  // Si la empresa ya se guardó pero la oportunidad falló, el segundo «Guardar» no la vuelve a crear.
  const [creada, setCreada] = useState<{ id: number; name: string } | null>(null);
  const campo = (key: string) => camposCliente?.find((f) => f.key === key);
  const campoFuente = campo('fuente');
  const ponerDato = (key: string, valor: string) => setDatosNuevo((prev) => ({ ...prev, [key]: valor }));
  const [clienteId, setClienteId] = useState<number | ''>(oportunidad?.salesClientId ?? clienteIdInicial ?? '');
  const [titulo, setTitulo] = useState(oportunidad?.title ?? '');
  const [serviceIds, setServiceIds] = useState<number[]>(oportunidad?.services.map((s) => s.id) ?? []);
  const [monto, setMonto] = useState(oportunidad?.quotedAmount != null ? String(oportunidad.quotedAmount) : '');
  const [cotizadaEl, setCotizadaEl] = useState(oportunidad?.quotedAt ? oportunidad.quotedAt.slice(0, 10) : '');
  const [notas, setNotas] = useState(oportunidad?.notes ?? '');
  // «Fecha en que llegó» es de la OPORTUNIDAD (no la de ingreso de la empresa o persona): al crear arranca en hoy.
  const hoy = diaEcuador();
  const [llegoEl, setLlegoEl] = useState(oportunidad?.receivedAt ? diaEcuador(oportunidad.receivedAt) : hoy);
  const [ubicacion, setUbicacion] = useState<UbicacionOportunidad | null>(oportunidad?.ubicacion ?? null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // Con cotización principal el monto no se escribe a mano (lo pone el Cotizador) y no se envía al guardar.
  const [hayPrincipal, setHayPrincipal] = useState(false);
  const { canWrite } = usePerm();

  const yaAsignados = new Set(oportunidad?.services.map((s) => s.id) ?? []);
  const disponibles = servicios.filter((s) => s.isActive || yaAsignados.has(s.id));
  const alternar = (id: number) =>
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const guardar = async () => {
    setError('');
    const altaNueva = modo === 'crear' && nueva && !creada;
    if (altaNueva) {
      if (!nombreNuevo.trim()) return setError('Escribe el nombre o la razón social de la empresa o persona nueva.');
      if (campoFuente && !(datosNuevo.fuente ?? '').trim()) return setError('Elige la fuente: cómo llegó esta empresa o persona.');
    } else if (modo === 'crear' && !nueva && !clienteId) {
      return setError('Elige la empresa o persona de la oportunidad.');
    }
    const montoNumero = monto.trim() === '' ? null : Number(monto.replace(',', '.'));
    if (montoNumero !== null && (Number.isNaN(montoNumero) || montoNumero < 0)) {
      return setError('El monto cotizado no es válido.');
    }
    if (!llegoEl) return setError('Indica la fecha en que llegó la oportunidad.');
    if (llegoEl > hoy) return setError('La fecha en que llegó no puede ser futura.');
    setGuardando(true);
    let idCliente = creada?.id ?? Number(clienteId);
    if (altaNueva) {
      try {
        const extra: Record<string, string> = {};
        for (const key of ['fuente', subopcionesKey('fuente'), ...CAMPOS_A_LA_VISTA]) {
          const v = (datosNuevo[key] ?? '').trim();
          if (v) extra[key] = v;
        }
        const contacto: Record<string, string> = {};
        for (const key of CAMPOS_CONTACTO) {
          const v = (datosNuevo[key] ?? '').trim();
          if (v) contacto[key] = v;
        }
        // «Solo datos»: la empresa nace sin oportunidad propia; la única es la que se crea abajo, con todo lo
        // que se marcó aquí (servicios, título, ubicación, notas). Su fecha de ingreso es la de llegada.
        const nuevo = (await createSalesClient({
          name: nombreNuevo.trim(),
          fechaIngreso: llegoEl,
          soloDatos: true,
          ...contacto,
          extra,
        })) as SalesClient & { posiblesDuplicados?: { id: number; name: string }[] };
        setCreada({ id: nuevo.id, name: nuevo.name });
        idCliente = nuevo.id;
        if (nuevo.posiblesDuplicados?.length) {
          showToast(`Ojo: se parece a «${nuevo.posiblesDuplicados[0].name}», que ya está en el directorio`, 'info');
        }
      } catch (err: any) {
        const msg = err?.response?.data?.message;
        setError((Array.isArray(msg) ? msg[0] : msg) || 'No se pudo registrar la empresa o persona. Intenta de nuevo.');
        setGuardando(false);
        return;
      }
    }
    try {
      const datos = {
        receivedAt: llegoEl,
        title: titulo.trim(),
        serviceIds,
        ...(hayPrincipal ? {} : { quotedAmount: montoNumero }),
        quotedAt: cotizadaEl || null,
        notes: notas.trim(),
        // null quita la ubicación que tenía; sin ubicación en una oportunidad nueva simplemente no se envía.
        ubicacion,
      };
      const guardada =
        modo === 'crear'
          ? await createOportunidad({ ...datos, salesClientId: idCliente })
          : await updateOportunidad(oportunidad!.id, datos);
      onSaved(guardada);
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      const detalle = (Array.isArray(msg) ? msg[0] : msg) || 'No se pudo guardar la oportunidad. Intenta de nuevo.';
      setError(
        modo === 'crear' && nueva && idCliente
          ? `«${nombreNuevo.trim()}» ya quedó en el directorio, pero la oportunidad no se creó: ${detalle} Pulsa Guardar otra vez.`
          : detalle,
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{modo === 'crear' ? 'Nueva oportunidad' : `Editar oportunidad — ${oportunidad?.salesClient.name}`}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          <ErrorBanner mensaje={error} />
          {modo === 'crear' && (
            <div className="form-ayuda">
              <FlujoComercialPasos actual={2} />
              <p>
                Para <strong>alguien que ya está en el Directorio</strong> (si es nuevo, usa «Es nueva en el directorio»). Empieza en <strong>Nueva</strong>;
                el monto cotizado se pide al pasarla a <strong>Cotizada</strong>. Las renovaciones las abre el sistema solo.
              </p>
              <p>
                ¿Apenas te contactó?{' '}
                <a href="#nuevo-posible-cliente" className="enlace-tabla" onClick={(e) => { e.preventDefault(); navigate('/ventas/leads?nuevo=1'); }}>
                  Regístralo como posible cliente
                </a>
              </p>
            </div>
          )}

          {modo === 'crear' && !nueva && (
            <div className="form-group">
              <label>Empresa o persona *</label>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Seleccionar empresa o persona...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {camposCliente && (
                <a href="#nueva-persona" className="enlace-tabla" onClick={(e) => { e.preventDefault(); setNueva(true); }}
                  style={{ display: 'inline-block', marginTop: 6, fontSize: 12.5 }}>
                  Es nueva en el directorio
                </a>
              )}
            </div>
          )}

          {modo === 'crear' && nueva && (
            <fieldset className="oport-nueva-persona" disabled={!!creada}>
              <legend>Empresa o persona nueva</legend>
              {creada ? (
                <p className="oport-nueva-nota">Ya quedó guardada en el directorio. Solo falta crear la oportunidad.</p>
              ) : (
                <a href="#elegir-existente" className="enlace-tabla oport-nueva-volver"
                  onClick={(e) => { e.preventDefault(); setNueva(false); }}>
                  Elegir una que ya está en el directorio
                </a>
              )}
              <div className="form-group">
                <label>Nombre / Razón social *</label>
                <input type="text" value={nombreNuevo} maxLength={200} autoFocus
                  onChange={(e) => setNombreNuevo(e.target.value)} placeholder="Ej: Textiles del Valle S.A." />
              </div>
              {campoFuente && (
                <div className="form-group">
                  <label>{campoFuente.label} *</label>
                  <CampoLista campo={campoFuente} valor={datosNuevo.fuente ?? ''}
                    onChange={(v) => setDatosNuevo((prev) => ({ ...prev, fuente: v, [subopcionesKey('fuente')]: '' }))} />
                  {subserviciosDe(campoFuente.options, datosNuevo.fuente ?? '').length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <SubserviciosCheckboxes
                        options={subserviciosDe(campoFuente.options, datosNuevo.fuente ?? '')}
                        value={datosNuevo[subopcionesKey('fuente')] ?? ''}
                        onChange={(v) => ponerDato(subopcionesKey('fuente'), v)}
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="form-row">
                {CAMPOS_A_LA_VISTA.map((key) => {
                  const f = campo(key);
                  if (!f) return null;
                  return (
                    <div className="form-group" key={key}>
                      <label>{f.label} (opcional)</label>
                      <CampoLista campo={f} valor={datosNuevo[key] ?? ''} onChange={(v) => ponerDato(key, v)} />
                    </div>
                  );
                })}
              </div>
              <details className="oport-nueva-mas">
                <summary>Más datos (opcional): correo, teléfono, cédula / RUC, dirección</summary>
                <div className="form-row">
                  {CAMPOS_CONTACTO.slice(0, 2).map((key) => (
                    <div className="form-group" key={key}>
                      <label>{campo(key)?.label ?? key}</label>
                      <input type={key === 'email' ? 'email' : 'text'} value={datosNuevo[key] ?? ''}
                        onChange={(e) => ponerDato(key, e.target.value)} />
                    </div>
                  ))}
                </div>
                <div className="form-row">
                  {CAMPOS_CONTACTO.slice(2).map((key) => (
                    <div className="form-group" key={key}>
                      <label>{campo(key)?.label ?? key}</label>
                      <input type="text" value={datosNuevo[key] ?? ''} onChange={(e) => ponerDato(key, e.target.value)} />
                    </div>
                  ))}
                </div>
              </details>
            </fieldset>
          )}

          <div className="form-group">
            <label>Título (opcional)</label>
            <input type="text" value={titulo} maxLength={150} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Cámaras con IA para la bodega" />
          </div>

          <div className="form-group">
            <label>Servicios que pidió</label>
            {disponibles.length === 0 ? (
              <p style={{ fontSize: 13, color: '#888', margin: 0 }}>Aún no hay servicios. Créalos en Ventas → Configuración → Servicios que ofrecemos.</p>
            ) : (
              <ServiciosPorCategoria servicios={disponibles} seleccionados={serviceIds} onToggle={alternar} marcarDesactivados />
            )}
          </div>

          <div className="form-group">
            <label>Fecha en que llegó *</label>
            <DateInput value={llegoEl} onChange={setLlegoEl} max={hoy} />
            <small style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#718096' }}>
              Es la fecha de esta oportunidad{modo === 'crear' ? ' (hoy, si recién llegó)' : ''}, no la de ingreso de la empresa o persona. De aquí se miden los tiempos de respuesta y de cierre.
            </small>
          </div>

          {/* Cotizaciones del Cotizador unidas a esta oportunidad (2026-11-17): la principal pone el monto. */}
          {modo === 'editar' && oportunidad && (
            <CotizacionesDeOportunidad
              oportunidadId={oportunidad.id}
              puedeEscribir={canWrite('VENTAS')}
              onMontoCambio={(m, principal) => {
                setHayPrincipal(principal);
                if (principal) setMonto(m != null ? String(m) : '');
              }}
            />
          )}

          {/* Al crear no se pide: la oportunidad nace en «Nueva» y el monto se registra al pasarla a «Cotizada». */}
          {modo === 'editar' && (
            <div className="form-row">
              <div className="form-group">
                <label>Monto cotizado (opcional)</label>
                <input
                  type="number" min={0} step="0.01" inputMode="decimal" value={monto}
                  onChange={(e) => setMonto(e.target.value)} placeholder="Ej: 3000"
                  disabled={hayPrincipal}
                  title={hayPrincipal ? 'Sale de la cotización principal' : undefined}
                />
                {hayPrincipal && (
                  <small style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#718096' }}>Sale de la cotización principal.</small>
                )}
              </div>
              <div className="form-group">
                <label>Cotizada el (opcional)</label>
                <DateInput value={cotizadaEl} onChange={setCotizadaEl} />
              </div>
            </div>
          )}

          <UbicacionCampo value={ubicacion} onChange={setUbicacion} />

          <div className="form-group">
            <label>Notas (opcional)</label>
            <textarea className="form-textarea" rows={3} maxLength={2000} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}

// Lista de un campo del Directorio (fuente, tipo de negocio, público/privado). Si el campo admite «Otro»,
// esa opción cambia a un texto libre que se guarda tal cual (mismo criterio que la ficha del Directorio).
function CampoLista({ campo, valor, onChange }: { campo: SalesClientField; valor: string; onChange: (v: string) => void }) {
  const [otro, setOtro] = useState(false);
  const opciones = campo.options ?? [];
  const esOtro = !!campo.allowOther && (otro || (!!valor && !opciones.some((o) => o.key === valor)));
  if (esOtro) {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="text" value={valor} autoFocus placeholder="Especifica..." onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn-secondary" onClick={() => { setOtro(false); onChange(''); }}>Lista</button>
      </div>
    );
  }
  return (
    <select
      value={valor}
      onChange={(e) => {
        if (e.target.value === OTRO) { setOtro(true); onChange(''); } else onChange(e.target.value);
      }}
    >
      <option value="">Elegir...</option>
      {opciones.map((o) => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
      {/* Si la lista ya trae su propio «Otro» (la fuente), no se repite. */}
      {campo.allowOther && !opciones.some((o) => o.label.trim().toLowerCase() === 'otro') && (
        <option value={OTRO}>Otro (especifique)</option>
      )}
    </select>
  );
}
