import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ErrorBanner from '../../common/ErrorBanner';
import { calcularCustodia, getTarifasCustodia } from '../../../services/cotizador-custodia.service';
import {
  entradaInicial,
  lineaDesdeResultado,
  MARGEN_CUSTODIA_POR_DEFECTO,
  type CotCustodiaLine,
  type EntradaCustodia,
  type ResultadoCustodia,
  type TarifasCustodia,
} from '../../../utils/cotizador/custodia';
import { money } from '../../../utils/cotizador/format';
import CustodiaMapa from './CustodiaMapa';
import NumInput from './NumInput';
import '../../../styles/custodia.css';

const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

const pct = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} %`;

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <div className="cus-campo">
      <label>
        <span>{etiqueta}</span>
        {children}
      </label>
      {ayuda && <small>{ayuda}</small>}
    </div>
  );
}

interface Props {
  /** Línea ya agregada que se quiere recalcular (se reemplaza, no se duplica). */
  inicial?: CotCustodiaLine | null;
  onClose: () => void;
  onConfirm: (linea: CotCustodiaLine) => void;
}

// Calculadora de «Custodia móvil» del Cotizador. El cálculo lo hace el servidor con las tarifas de la
// empresa (Ventas → Configuración → Tarifas de custodia); aquí solo se llenan los datos y se ve el resultado.
export default function CustodiaModal({ inicial, onClose, onConfirm }: Props) {
  const [tarifas, setTarifas] = useState<TarifasCustodia | null>(null);
  const [entrada, setEntrada] = useState<EntradaCustodia | null>(inicial?.entrada ?? null);
  const [resultado, setResultado] = useState<ResultadoCustodia | null>(null);
  const [error, setError] = useState('');
  const [calculando, setCalculando] = useState(false);
  const [verDesglose, setVerDesglose] = useState(false);
  const secuencia = useRef(0);

  useEffect(() => {
    getTarifasCustodia()
      .then((t) => {
        setTarifas(t);
        setEntrada((e) => e ?? entradaInicial(t));
      })
      .catch((err) => setError(mensajeDe(err, 'No se pudieron cargar las tarifas de custodia. Cierra e intenta de nuevo.')));
  }, []);

  // Recalcula (en el servidor) poco después de que la persona deja de cambiar datos.
  const clave = useMemo(() => JSON.stringify(entrada), [entrada]);
  useEffect(() => {
    if (!entrada) return;
    const mio = ++secuencia.current;
    setCalculando(true);
    const t = setTimeout(() => {
      calcularCustodia(entrada)
        .then((r) => {
          if (mio !== secuencia.current) return;
          setResultado(r.resultado);
          setError('');
        })
        .catch((err) => {
          if (mio !== secuencia.current) return;
          setResultado(null);
          setError(mensajeDe(err, 'No se pudo calcular. Revisa los datos e intenta de nuevo.'));
        })
        .finally(() => mio === secuencia.current && setCalculando(false));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  if (!entrada || !tarifas) {
    return createPortal(
      <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1300 }}>
        <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Custodia móvil</h3>
            <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
          <div className="modal-body">
            <ErrorBanner mensaje={error} />
            {!error && <p style={{ color: '#718096' }}>Cargando tarifas...</p>}
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  const set = (p: Partial<EntradaCustodia>) => setEntrada((e) => (e ? { ...e, ...p } : e));
  const entero = (n: number | null) => Math.max(0, Math.trunc(n ?? 0));
  const alquilado = entrada.vehiculoTipo === 'ALQUILADO';
  const extraElegido = (id: string) => entrada.extras.find((x) => x.id === id);
  const alternarExtra = (id: string, activo: boolean) =>
    set({ extras: activo ? [...entrada.extras, { id, cantidad: 1 }] : entrada.extras.filter((x) => x.id !== id) });
  const cantidadExtra = (id: string, cantidad: number) =>
    set({ extras: entrada.extras.map((x) => (x.id === id ? { ...x, cantidad } : x)) });
  const hayExtras = tarifas.extras.length > 0;
  const errores = resultado && !resultado.ok ? resultado.errores : [];

  const confirmar = () => {
    if (!resultado?.ok) return;
    onConfirm(lineaDesdeResultado(entrada, resultado, inicial?.id));
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1300 }}>
      <div className="modal modal-ventas-lg cus-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{inicial ? 'Recalcular custodia móvil' : 'Custodia móvil'}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="modal-body cus-cuerpo">
          <ErrorBanner mensaje={error} />
          <div className="cus-grid">
            <div className="cus-form">
              <section>
                <h4>1. Ruta</h4>
                <CustodiaMapa
                  origen={entrada.origen}
                  destino={entrada.destino}
                  onCambio={({ origen, destino, ruta }) =>
                    set({ origen, destino, ...(ruta ? { kmIda: ruta.km } : {}) })
                  }
                />
                <div className="cus-fila">
                  <Campo etiqueta="Km de ida" ayuda="Se llena con el mapa; puedes corregirlo.">
                    <NumInput value={entrada.kmIda || null} min={0} ariaLabel="Kilómetros de ida" onCommit={(n) => set({ kmIda: n ?? 0 })} />
                  </Campo>
                  <Campo etiqueta="¿La custodia cubre el regreso?">
                    <select value={entrada.incluyeRegreso ? 'Sí' : 'No'} onChange={(e) => set({ incluyeRegreso: e.target.value === 'Sí' })}>
                      <option value="No">No, solo la ida</option>
                      <option value="Sí">Sí, ida y regreso</option>
                    </select>
                  </Campo>
                  <Campo etiqueta="Km del regreso" ayuda="Vacío = igual que la ida. El vehículo siempre vuelve.">
                    <NumInput value={entrada.kmRegreso} min={0} ariaLabel="Kilómetros de regreso" placeholder="igual que la ida" onCommit={(n) => set({ kmRegreso: n })} />
                  </Campo>
                  <Campo etiqueta="Km adicionales / desvíos">
                    <NumInput value={entrada.kmAdicionales || null} min={0} ariaLabel="Kilómetros adicionales" onCommit={(n) => set({ kmAdicionales: n ?? 0 })} />
                  </Campo>
                </div>
              </section>

              <section>
                <h4>2. Vehículo y región</h4>
                <div className="cus-fila">
                  <Campo etiqueta="Tipo de vehículo">
                    <select value={entrada.vehiculoTipo} onChange={(e) => set({ vehiculoTipo: e.target.value as EntradaCustodia['vehiculoTipo'] })}>
                      <option value="ALQUILADO">Alquilado</option>
                      <option value="PROPIO">Propio</option>
                    </select>
                  </Campo>
                  <Campo etiqueta="Vehículos">
                    <NumInput value={entrada.vehiculos} min={1} ariaLabel="Vehículos" onCommit={(n) => set({ vehiculos: entero(n) })} />
                  </Campo>
                  {alquilado && (
                    <Campo etiqueta="Días de alquiler por vehículo">
                      <NumInput value={entrada.diasAlquiler} min={1} ariaLabel="Días de alquiler" onCommit={(n) => set({ diasAlquiler: entero(n) })} />
                    </Campo>
                  )}
                  <Campo etiqueta="Región del servicio" ayuda="Define la tarifa del personal. Elige la que corresponda al servicio.">
                    <select value={entrada.region} onChange={(e) => set({ region: e.target.value })}>
                      {tarifas.regiones.map((r) => (
                        <option key={r.nombre} value={r.nombre}>{r.nombre}</option>
                      ))}
                      {!tarifas.regiones.some((r) => r.nombre === entrada.region) && entrada.region && (
                        <option value={entrada.region}>{entrada.region} (ya no está en las tarifas)</option>
                      )}
                    </select>
                  </Campo>
                  <Campo etiqueta="Cantidad de viajes">
                    <NumInput value={entrada.viajes} min={1} ariaLabel="Viajes" onCommit={(n) => set({ viajes: entero(n) })} />
                  </Campo>
                </div>
              </section>

              <section>
                <h4>3. Personal</h4>
                <div className="cus-fila">
                  <Campo
                    etiqueta="Custodios (sin contar choferes)"
                    ayuda={tarifas.minAgentes > 0 ? `Mínimo ${tarifas.minAgentes}.` : undefined}
                  >
                    <NumInput value={entrada.agentes} min={0} ariaLabel="Custodios" onCommit={(n) => set({ agentes: entero(n) })} />
                  </Campo>
                  <Campo etiqueta="Choferes">
                    <NumInput value={entrada.choferes} min={0} ariaLabel="Choferes" onCommit={(n) => set({ choferes: entero(n) })} />
                  </Campo>
                  <Campo etiqueta="Comidas por custodio">
                    <NumInput value={entrada.comidasAgente || null} min={0} ariaLabel="Comidas por custodio" onCommit={(n) => set({ comidasAgente: n ?? 0 })} />
                  </Campo>
                  <Campo etiqueta="Comidas por chofer">
                    <NumInput value={entrada.comidasChofer || null} min={0} ariaLabel="Comidas por chofer" onCommit={(n) => set({ comidasChofer: n ?? 0 })} />
                  </Campo>
                  <Campo etiqueta="Noches de hospedaje por persona">
                    <NumInput value={entrada.noches || null} min={0} ariaLabel="Noches de hospedaje" onCommit={(n) => set({ noches: n ?? 0 })} />
                  </Campo>
                </div>
              </section>

              <section>
                <h4>4. Tiempos <small>(solo la espera del vehículo cambia el costo)</small></h4>
                <div className="cus-fila">
                  <Campo etiqueta="Horas de traslado">
                    <NumInput value={entrada.horasTraslado || null} min={0} ariaLabel="Horas de traslado" onCommit={(n) => set({ horasTraslado: n ?? 0 })} />
                  </Campo>
                  <Campo etiqueta="Horas de espera">
                    <NumInput value={entrada.horasEspera || null} min={0} ariaLabel="Horas de espera" onCommit={(n) => set({ horasEspera: n ?? 0 })} />
                  </Campo>
                  <Campo etiqueta="Otras horas de servicio">
                    <NumInput value={entrada.horasOtras || null} min={0} ariaLabel="Otras horas" onCommit={(n) => set({ horasOtras: n ?? 0 })} />
                  </Campo>
                </div>
              </section>

              <section>
                <h4>5. Gastos directos (USD)</h4>
                <div className="cus-fila">
                  <Campo etiqueta="Peajes">
                    <NumInput value={entrada.peajes || null} min={0} ariaLabel="Peajes" onCommit={(n) => set({ peajes: n ?? 0 })} />
                  </Campo>
                  <Campo etiqueta="Parqueos">
                    <NumInput value={entrada.parqueos || null} min={0} ariaLabel="Parqueos" onCommit={(n) => set({ parqueos: n ?? 0 })} />
                  </Campo>
                  <Campo etiqueta="Traslados extra">
                    <NumInput value={entrada.trasladosExtra || null} min={0} ariaLabel="Traslados extra" onCommit={(n) => set({ trasladosExtra: n ?? 0 })} />
                  </Campo>
                  <Campo etiqueta="Otros gastos">
                    <NumInput value={entrada.otrosGastos || null} min={0} ariaLabel="Otros gastos" onCommit={(n) => set({ otrosGastos: n ?? 0 })} />
                  </Campo>
                </div>
              </section>

              {hayExtras && (
                <section>
                  <h4>6. Extras <small>(si aplican a esta custodia)</small></h4>
                  <div className="cus-extras">
                    {tarifas.extras.map((x) => {
                      const elegido = extraElegido(x.id);
                      return (
                        <div key={x.id} className="cus-extra">
                          <label>
                            <input type="checkbox" checked={!!elegido} onChange={(e) => alternarExtra(x.id, e.target.checked)} />
                            <span>{x.nombre}</span>
                          </label>
                          <small>
                            {x.modo === 'PORCENTAJE' ? `${pct(x.valor)} del costo` : `${money(x.valor)}${x.unidad ? ` por ${x.unidad}` : ''}`}
                            {x.valor === 0 && ' · sin valor: defínelo en las tarifas'}
                          </small>
                          {elegido && x.modo === 'FIJO' && (
                            <NumInput value={elegido.cantidad} min={0} ariaLabel={`Cantidad de ${x.nombre}`} className="cus-extra-cant" onCommit={(n) => cantidadExtra(x.id, n ?? 0)} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <section>
                <h4>{hayExtras ? '7' : '6'}. Margen e imprevistos</h4>
                <div className="cus-fila">
                  <Campo etiqueta="Imprevistos (%)" ayuda={`Vacío = el de las tarifas (${pct(tarifas.imprevistosPct)})`}>
                    <NumInput value={entrada.imprevistosPct} min={0} max={100} ariaLabel="Imprevistos" placeholder={String(tarifas.imprevistosPct)} onCommit={(n) => set({ imprevistosPct: n })} />
                  </Campo>
                  <Campo etiqueta="Margen de ganancia (%)" ayuda="Sobre el precio de venta: 30 % = de cada $100 vendidos, $30 son utilidad.">
                    <NumInput value={entrada.margenPct} min={0} max={95} ariaLabel="Margen" placeholder={String(MARGEN_CUSTODIA_POR_DEFECTO)} onCommit={(n) => set({ margenPct: n ?? MARGEN_CUSTODIA_POR_DEFECTO })} />
                  </Campo>
                </div>
                <small className="cus-nota">El descuento comercial se aplica en la cotización completa, antes del IVA.</small>
              </section>
            </div>

            <aside className="cus-resumen" aria-label="Resultado del cálculo">
              {errores.length > 0 ? (
                <div className="cus-errores" role="alert">
                  <strong>Falta para calcular</strong>
                  <ul>{errores.map((e) => <li key={e}>{e}</li>)}</ul>
                </div>
              ) : resultado ? (
                <>
                  <div className="cus-precio">
                    <span>Precio sin IVA</span>
                    <strong>{money(resultado.precioSinIva)}</strong>
                    <small>El IVA se suma al final, en el total de la cotización.</small>
                  </div>
                  <dl className="cus-interno">
                    <dt className="cus-tag-interno">Interno · no se imprime</dt>
                    <dd><span>Costo directo</span><b>{money(resultado.costoDirecto)}</b></dd>
                    <dd><span>Imprevistos ({pct(resultado.imprevistosPct)})</span><b>{money(resultado.imprevistos)}</b></dd>
                    <dd><span>Costo total operativo</span><b>{money(resultado.costoTotal)}</b></dd>
                    <dd><span>Utilidad bruta</span><b>{money(resultado.utilidad)}</b></dd>
                    <dd><span>Margen real</span><b>{pct(resultado.margenEfectivoPct)}</b></dd>
                    <dd><span>Km del servicio</span><b>{String(resultado.kmServicio).replace('.', ',')} km</b></dd>
                    <dd><span>Costo por km</span><b>{money(resultado.costoPorKm)}</b></dd>
                    <dd><span>Precio por km (sin IVA)</span><b>{money(resultado.precioPorKm)}</b></dd>
                  </dl>
                  <button type="button" className="cus-ver-desglose" onClick={() => setVerDesglose(!verDesglose)} aria-expanded={verDesglose}>
                    {verDesglose ? 'Ocultar el desglose' : 'Ver el desglose de costos'}
                  </button>
                  {verDesglose && (
                    <table className="cus-desglose">
                      <thead>
                        <tr><th>Concepto</th><th className="right">Total</th></tr>
                      </thead>
                      <tbody>
                        {resultado.conceptos.filter((c) => c.total > 0).map((c) => (
                          <tr key={c.clave} title={c.formula}>
                            <td>{c.concepto}</td>
                            <td className="right">{money(c.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              ) : (
                <p style={{ color: '#718096', fontSize: 13 }}>{calculando ? 'Calculando...' : 'Llena los datos para ver el precio.'}</p>
              )}
            </aside>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={confirmar} disabled={!resultado?.ok || calculando}>
            {inicial ? 'Actualizar en la cotización' : 'Agregar a la cotización'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
