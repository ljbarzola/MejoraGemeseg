import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ErrorBanner from '../common/ErrorBanner';
import DateInput from '../common/DateInput';
import MotivoCierreModal from './MotivoCierreModal';
import {
  createContratoComercial,
  updateContratoComercial,
  renovarContratoComercial,
  cancelarContratoComercial,
  registrarCierreContrato,
  getContratoComercial,
  type ContratoComercial,
  type ContratoComercialInput,
  type MotivoInput,
  type SalesClient,
  type SalesServicio,
  type TipoContrato,
} from '../../services/ventas.service';
import { aInputDia, diaCorto, hoyEcuador } from '../../utils/contratoComercial';

type Modo = 'crear' | 'editar' | 'renovar';

interface Props {
  modo: Modo;
  // Contrato que se edita o se renueva.
  contrato?: ContratoComercial;
  // Al crear: clientes para elegir, y uno preseleccionado si se llega desde su ficha.
  clientes?: SalesClient[];
  clienteIdInicial?: number;
  servicios: SalesServicio[];
  onClose: () => void;
  onSaved: (c: ContratoComercial) => void;
  // Solo al renovar. Fase 4: al aceptar una oportunidad de renovación este mismo formulario recoge las
  // fechas, servicios y valor del contrato nuevo, pero NO renueva por su cuenta: entrega los datos a
  // quien lo abrió (que los manda junto con el cambio de etapa). Si lanza, el error se muestra aquí.
  // Con esto el fin del contrato nuevo viene lleno (misma duración que el anterior).
  onCapturar?: (datos: ContratoComercialInput) => Promise<void>;
  introRenovar?: ReactNode;
  textoBoton?: string;
}

const TITULOS: Record<Modo, string> = {
  crear: 'Nuevo contrato',
  editar: 'Editar contrato',
  renovar: 'Renovar contrato',
};

const TITULOS_PRODUCTO: Record<Modo, string> = {
  crear: 'Nueva venta de producto',
  editar: 'Editar venta de producto',
  renovar: 'Renovar contrato',
};

// Sumar un día a 'YYYY-MM-DD' sin zona horaria de por medio.
function diaSiguiente(dia: string): string {
  if (!dia) return '';
  const d = new Date(`${dia}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Días de gracia que se sugieren según la duración (misma regla que el servidor,
// graciaSugerida en client-lifecycle.util.ts): 30 si dura 6 meses o más o no
// vence, 15 si menos. Se puede cambiar: la fija cada contrato.
function graciaSugerida(inicio: string, fin: string): number {
  if (!inicio || !fin) return 30;
  const dias = (Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000;
  return dias >= 180 ? 30 : 15;
}

const dineroTexto = (v: number) =>
  `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ContratoComercialModal({
  modo, contrato, clientes = [], clienteIdInicial, servicios, onClose, onSaved,
  onCapturar, introRenovar, textoBoton,
}: Props) {
  const [clienteId, setClienteId] = useState<number | ''>(contrato?.salesClientId ?? clienteIdInicial ?? '');
  // Servicio recurrente o venta de producto. Se elige al crear y ya no cambia.
  const [tipo, setTipo] = useState<TipoContrato>(contrato?.kind ?? 'SERVICIO');
  const producto = tipo === 'PRODUCTO';
  const [valorTotal, setValorTotal] = useState<string>(contrato?.totalValue != null ? String(contrato.totalValue) : '');
  const [garantia, setGarantia] = useState(aInputDia(contrato?.warrantyUntil));
  const [titulo, setTitulo] = useState(contrato?.title ?? '');
  // Al renovar, el nuevo contrato arranca el día siguiente al fin del anterior
  // y sin fecha de fin (se llena a propósito).
  const [inicio, setInicio] = useState(
    modo === 'renovar' ? diaSiguiente(aInputDia(contrato?.endDate)) : aInputDia(contrato?.startDate),
  );
  const [fin, setFin] = useState(() => {
    if (modo !== 'renovar') return aInputDia(contrato?.endDate);
    // Al aceptar una renovación (onCapturar) el formulario viene LLENO: el contrato nuevo dura lo mismo que el anterior.
    const ini = aInputDia(contrato?.startDate);
    const finAnterior = aInputDia(contrato?.endDate);
    if (!onCapturar || !ini || !finAnterior) return '';
    const dias = Math.round((Date.parse(`${finAnterior}T00:00:00Z`) - Date.parse(`${ini}T00:00:00Z`)) / 86400000);
    const f = new Date(`${diaSiguiente(finAnterior)}T00:00:00.000Z`);
    f.setUTCDate(f.getUTCDate() + dias);
    return f.toISOString().slice(0, 10);
  });
  const [serviceIds, setServiceIds] = useState<number[]>(contrato?.services.map((s) => s.id) ?? []);
  const [valor, setValor] = useState<string>(contrato?.monthlyValue != null ? String(contrato.monthlyValue) : '');
  const [gracia, setGracia] = useState<string>(contrato?.graceDays != null ? String(contrato.graceDays) : '');
  // Mientras la persona no toque la gracia, se sigue sugiriendo según la duración.
  const [graciaTocada, setGraciaTocada] = useState(modo !== 'crear' && modo !== 'renovar' ? true : modo === 'renovar');
  const [notas, setNotas] = useState(modo === 'renovar' ? '' : contrato?.notes ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  // Contratos anteriores a la app (solo al crear un servicio): se cancelaron antes de
  // terminar, o ya vencieron sin renovarse. El motivo se pide al guardar.
  const [cancelado, setCancelado] = useState(false);
  const [fechaCancelacion, setFechaCancelacion] = useState('');
  const [pidiendoCierre, setPidiendoCierre] = useState(false);
  // Si el contrato ya se creó pero falló guardar su motivo, un reintento no lo crea otra vez.
  const [creado, setCreado] = useState<ContratoComercial | null>(null);
  // Contrato anterior de la cadena: contra él se compara si esto baja servicios o valor.
  const [anterior, setAnterior] = useState<ContratoComercial | null>(modo === 'renovar' ? (contrato ?? null) : null);

  useEffect(() => {
    if (modo === 'editar' && contrato?.renewedFromId && contrato?.kind !== 'PRODUCTO') {
      getContratoComercial(contrato.renewedFromId).then(setAnterior).catch(() => setAnterior(null));
    }
  }, [modo, contrato?.renewedFromId, contrato?.kind]);

  const hoy = hoyEcuador();
  const registrandoPasado = modo === 'crear' && !producto;
  const yaEmpezo = registrandoPasado && !!inicio && inicio <= hoy;
  const seCancelo = yaEmpezo && cancelado;
  const yaVencio = registrandoPasado && !seCancelo && !!fin && fin < hoy;
  const nombreCliente = contrato?.salesClient.name ?? clientes.find((c) => c.id === clienteId)?.name ?? 'el cliente';

  const sugerida = graciaSugerida(inicio, fin);
  useEffect(() => {
    if (!graciaTocada) setGracia(String(sugerida));
  }, [sugerida, graciaTocada]);

  // Un servicio desactivado solo se ofrece si el contrato ya lo tenía.
  const yaAsignados = new Set(contrato?.services.map((s) => s.id) ?? []);
  const disponibles = servicios.filter((s) => s.isActive || yaAsignados.has(s.id));

  const alternar = (id: number) =>
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const valorNumero = valor.trim() === '' ? null : Number(valor.replace(',', '.'));
  const totalNumero = valorTotal.trim() === '' ? null : Number(valorTotal.replace(',', '.'));

  // ¿Baja servicios o valor frente al contrato anterior? Entonces hay que explicar por qué.
  const reduccion = useMemo(() => {
    if (!anterior || producto) return null;
    const quitados = anterior.services.filter((s) => !serviceIds.includes(s.id));
    const valorBaja =
      anterior.monthlyValue != null && valorNumero != null && !Number.isNaN(valorNumero) && valorNumero < anterior.monthlyValue;
    return quitados.length > 0 || valorBaja
      ? { quitados, valorBaja, valorAnterior: anterior.monthlyValue ?? null }
      : null;
  }, [anterior, serviceIds, valorNumero, producto]);

  const validar = (): string => {
    if (modo === 'crear' && !clienteId) return producto ? 'Elige el cliente de la venta.' : 'Elige el cliente del contrato.';
    if (producto) {
      if (!inicio) return 'Indica la fecha de la venta.';
      if (serviceIds.length === 0) return 'Elige al menos un producto.';
      if (totalNumero != null && (Number.isNaN(totalNumero) || totalNumero < 0)) return 'El valor total no es válido.';
      if (garantia && garantia < inicio) return 'La garantía no puede terminar antes de la fecha de la venta.';
      return '';
    }
    if (!inicio) return 'Indica la fecha de inicio.';
    if (fin && fin < inicio) return 'La fecha de fin no puede ser anterior a la de inicio.';
    if (seCancelo) {
      if (!fechaCancelacion) return `Indica en qué fecha se canceló el contrato de ${nombreCliente}.`;
      if (fechaCancelacion < inicio) return `El contrato de ${nombreCliente} empezó el ${diaCorto(inicio)}: no pudo cancelarse antes (${diaCorto(fechaCancelacion)}).`;
      if (fechaCancelacion > hoy) return 'La fecha de cancelación no puede ser futura: si fue hoy, elige hoy.';
    }
    if (serviceIds.length === 0) return 'Elige al menos un servicio.';
    if (valorNumero != null && (Number.isNaN(valorNumero) || valorNumero < 0)) return 'El valor mensual no es válido.';
    const g = Number(gracia);
    if (gracia.trim() === '' || !Number.isInteger(g) || g < 0 || g > 365) {
      return 'Los días de gracia deben ser un número entero entre 0 y 365.';
    }
    return '';
  };

  const guardar = async (motivo?: MotivoInput, cierre?: 'CANCELADO' | 'NO_RENOVADO') => {
    const base: ContratoComercialInput = producto
      ? {
        // Venta de producto: sin fin, valor mensual ni gracia. Garantía vacía = sin garantía.
        title: titulo.trim(),
        startDate: inicio,
        serviceIds,
        notes: notas.trim(),
        totalValue: totalNumero,
        warrantyUntil: garantia,
      }
      : {
        title: titulo.trim(),
        startDate: inicio,
        // Cadena vacía = sin fecha de fin (el backend la lee así al editar).
        endDate: fin,
        serviceIds,
        notes: notas.trim(),
        monthlyValue: valorNumero,
        graceDays: Number(gracia),
        ...(motivo && !cierre ? { motivo } : {}),
      };
    let guardado: ContratoComercial;
    if (modo === 'crear') {
      guardado = creado ?? await createContratoComercial({ ...base, kind: tipo, salesClientId: Number(clienteId) });
      if (cierre && motivo) {
        setCreado(guardado);
        try {
          guardado = cierre === 'CANCELADO'
            ? await cancelarContratoComercial(guardado.id, { date: fechaCancelacion, motivo })
            : await registrarCierreContrato(guardado.id, motivo);
        } catch (err: any) {
          const msg = err?.response?.data?.message;
          throw { response: { data: { message: `El contrato de ${nombreCliente} ya quedó creado, pero no se pudo guardar el motivo: ${(Array.isArray(msg) ? msg[0] : msg) || 'intenta de nuevo'}.` } } };
        }
      }
    } else if (modo === 'editar' && contrato) {
      guardado = await updateContratoComercial(contrato.id, base);
    } else if (contrato && onCapturar) {
      await onCapturar(base);
      return;
    } else if (contrato) {
      guardado = await renovarContratoComercial(contrato.id, base);
    } else {
      throw new Error('Falta el contrato.');
    }
    onSaved(guardado);
  };

  const alGuardar = async () => {
    setError('');
    const problema = validar();
    if (problema) return setError(problema);
    // Si baja servicios o valor, primero se pide el motivo (el servidor también lo exige).
    if (reduccion) return setPidiendoMotivo(true);
    // Contrato que ya terminó (venció o se canceló): se explica por qué antes de guardarlo.
    if (seCancelo || yaVencio) return setPidiendoCierre(true);
    setGuardando(true);
    try {
      await guardar();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError((Array.isArray(msg) ? msg[0] : msg) || (producto ? 'No se pudo guardar la venta. Intenta de nuevo.' : 'No se pudo guardar el contrato. Intenta de nuevo.'));
    } finally {
      setGuardando(false);
    }
  };

  const contextoReduccion = reduccion && anterior && (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {reduccion.quitados.length > 0 && (
        <li>Servicios que se quitan: {reduccion.quitados.map((s) => s.name).join(', ')}.</li>
      )}
      {reduccion.valorBaja && reduccion.valorAnterior != null && valorNumero != null && (
        <li>Valor mensual: de {dineroTexto(reduccion.valorAnterior)} a {dineroTexto(valorNumero)}.</li>
      )}
    </ul>
  );

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>{producto && modo !== 'renovar' ? TITULOS_PRODUCTO[modo] : TITULOS[modo]}{modo !== 'crear' && contrato ? ` — ${contrato.salesClient.name}` : ''}</h3>
            <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
          <div className="modal-body">
            <ErrorBanner mensaje={error} />
            {modo === 'renovar' && (
              introRenovar ?? (
                <p style={{ fontSize: 13, color: '#666', marginTop: 0 }}>
                  Se crea un contrato nuevo para el mismo cliente y el actual queda como «Renovado». Los servicios, el valor y los días de gracia se copian; ajústalos si cambiaron. Si bajan servicios o valor, se te pedirá el motivo.
                </p>
              )
            )}

            {modo === 'crear' && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#1e3a8a', marginBottom: 12 }}>
                <strong>Aquí también puedes registrar contratos anteriores a la app.</strong>{' '}
                {producto
                  ? 'Si la venta fue antes, pon su fecha real.'
                  : 'Pon sus fechas reales de inicio y fin, aunque ya hayan pasado. Si el contrato ya terminó, al guardar se te pregunta por qué no se renovó (o por qué se canceló), para poder analizar por qué se van los clientes.'}
              </div>
            )}

            {modo === 'crear' && (
              <div className="form-group">
                <label>Tipo *</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={tipo === 'SERVICIO' ? 'auth-btn' : 'btn-secondary'}
                    aria-pressed={tipo === 'SERVICIO'}
                    onClick={() => { setTipo('SERVICIO'); setServiceIds([]); }}
                  >
                    Servicio recurrente
                  </button>
                  <button
                    type="button"
                    className={tipo === 'PRODUCTO' ? 'auth-btn' : 'btn-secondary'}
                    aria-pressed={tipo === 'PRODUCTO'}
                    onClick={() => { setTipo('PRODUCTO'); setServiceIds([]); }}
                  >
                    Venta de producto
                  </button>
                </div>
                <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                  {producto
                    ? 'Venta única (por ejemplo, una cámara o un equipo): no vence ni se renueva. Se sigue como «Por entregar» y «Entregado».'
                    : 'Un servicio que se repite en el tiempo: tiene vigencia y se puede renovar.'}
                </p>
              </div>
            )}

            {modo === 'crear' && (
              <div className="form-group">
                <label>Cliente *</label>
                <select value={clienteId} onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Seleccionar cliente...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>Título (opcional)</label>
              <input
                type="text"
                value={titulo}
                maxLength={150}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej: Seguridad física sede Quito 2026"
              />
            </div>

            {producto ? (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label>Fecha de la venta *</label>
                    <DateInput value={inicio} onChange={setInicio} />
                  </div>
                  <div className="form-group">
                    <label>Valor total (opcional)</label>
                    <input
                      type="number" min={0} step="0.01" inputMode="decimal"
                      value={valorTotal} onChange={(e) => setValorTotal(e.target.value)}
                      placeholder="Ej: 450"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Garantía hasta (opcional)</label>
                  <DateInput value={garantia} onChange={setGarantia} min={inicio || undefined} />
                  <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                    Déjalo vacío si el producto no tiene garantía. Si lo llenas, se avisa cuando esté por terminar.
                  </p>
                </div>
              </>
            ) : (
              <>
            <div className="form-row">
              <div className="form-group">
                <label>Inicio *</label>
                <DateInput value={inicio} onChange={setInicio} />
              </div>
              <div className="form-group">
                <label>Fin (vacío si no vence)</label>
                <DateInput value={fin} onChange={setFin} min={inicio || undefined} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Valor mensual (opcional)</label>
                <input
                  type="number" min={0} step="0.01" inputMode="decimal"
                  value={valor} onChange={(e) => setValor(e.target.value)}
                  placeholder="Ej: 3000"
                />
              </div>
              <div className="form-group">
                <label>Días de gracia al vencer *</label>
                <input
                  type="number" min={0} max={365} step={1}
                  value={gracia}
                  onChange={(e) => { setGracia(e.target.value); setGraciaTocada(true); }}
                />
                <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                  Tras el fin del contrato, el cliente sigue «En riesgo» estos días antes de pasar a «Inactivo».
                  {!graciaTocada || Number(gracia) === sugerida ? ` Sugerido por la duración: ${sugerida}.` : ` Lo sugerido por la duración sería ${sugerida}.`}
                </p>
              </div>
            </div>

            {yaEmpezo && (
              <div className="form-group" style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={cancelado} onChange={(e) => { setCancelado(e.target.checked); if (!e.target.checked) setFechaCancelacion(''); }} />
                  Este contrato se canceló antes de terminar
                </label>
                {cancelado && (
                  <div style={{ marginTop: 8, maxWidth: 260 }}>
                    <label>Fecha en que se canceló *</label>
                    <DateInput value={fechaCancelacion} onChange={setFechaCancelacion} min={inicio || undefined} max={hoy} />
                    <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
                      En «Fin» deja la fecha en que debía terminar. Al guardar se te pregunta por qué se canceló.
                    </p>
                  </div>
                )}
              </div>
            )}
            {yaVencio && (
              <div style={{ background: '#fffbeb', border: '1px solid #f6e05e', borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
                <strong>Contrato anterior ya vencido.</strong> Con estas fechas el contrato de {nombreCliente} terminó el {diaCorto(fin)} y queda como «Vencido». Al guardar se te pregunta por qué no se renovó.
              </div>
            )}
              </>
            )}

            <div className="form-group">
              <label>{producto ? 'Productos vendidos *' : 'Servicios contratados *'}</label>
              {disponibles.length === 0 ? (
                <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
                  Aún no hay {producto ? 'productos' : 'servicios'}. Créalos en Ventas → Configuración → Servicios que ofrecemos.
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 6 }}>
                  {disponibles.map((s) => (
                    <label
                      key={s.id}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, fontWeight: 400, cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={serviceIds.includes(s.id)}
                        onChange={() => alternar(s.id)}
                        style={{ marginTop: 3 }}
                      />
                      <span>
                        {s.name}
                        {!s.isActive && <em style={{ color: '#999' }}> (desactivado)</em>}
                        {s.description && <span style={{ display: 'block', fontSize: 11, color: '#888' }}>{s.description}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {reduccion && (
              <div style={{ background: '#fffbeb', border: '1px solid #f6e05e', borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
                <strong>Esto baja el contrato frente al anterior.</strong>
                {contextoReduccion}
                <span style={{ color: '#666' }}>Al guardar se te preguntará el motivo.</span>
              </div>
            )}

            <div className="form-group">
              <label>Notas (opcional)</label>
              <textarea className="form-textarea" rows={3} maxLength={2000} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="auth-btn" onClick={alGuardar} disabled={guardando}>
              {guardando ? 'Guardando...' : modo === 'renovar' ? (textoBoton ?? 'Renovar contrato') : 'Guardar'}
            </button>
          </div>
        </div>
      </div>

      {pidiendoCierre && (
        <MotivoCierreModal
          kind={seCancelo ? 'CONTRATO_CANCELADO' : 'CONTRATO_NO_RENOVADO'}
          titulo={seCancelo ? '¿Por qué se canceló el contrato?' : '¿Por qué no se renovó?'}
          descripcion={seCancelo
            ? `Contrato de ${nombreCliente}, del ${diaCorto(inicio)}${fin ? ` al ${diaCorto(fin)}` : ''}, cancelado el ${diaCorto(fechaCancelacion)}`
            : `Contrato de ${nombreCliente}, del ${diaCorto(inicio)} al ${diaCorto(fin)}, vencido sin renovarse`}
          contexto="Se guarda junto con el contrato. Si no se sabe, elige «Sin información»."
          confirmLabel="Guardar contrato"
          onConfirm={async (motivo) => { await guardar(motivo, seCancelo ? 'CANCELADO' : 'NO_RENOVADO'); }}
          onCancel={() => { setPidiendoCierre(false); if (creado) onSaved(creado); }}
        />
      )}

      {pidiendoMotivo && (
        <MotivoCierreModal
          kind="CONTRATO_REDUCCION"
          titulo="¿Por qué baja el contrato?"
          descripcion={contrato ? `Contrato de ${contrato.salesClient.name}` : undefined}
          contexto={contextoReduccion}
          confirmLabel={modo === 'renovar' ? (textoBoton ?? 'Renovar contrato') : 'Guardar'}
          onConfirm={async (motivo) => { await guardar(motivo); }}
          onCancel={() => setPidiendoMotivo(false)}
        />
      )}
    </>
  );
}
