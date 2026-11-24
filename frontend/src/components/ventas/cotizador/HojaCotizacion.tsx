import { Fragment } from 'react';
import { Phone } from 'lucide-react';
import type { QuoteTotals as Totales } from '../../../utils/cotizador/pricing';
import type { DiscountType } from '../../../utils/cotizador/types';
import { money, splitConditionLine } from '../../../utils/cotizador/format';
import QuoteTotals from './QuoteTotals';

// Hoja impresa / PDF de una cotización (2026-11-17). Es UNA sola pieza para los dos caminos, así el PDF
// sale idéntico:
//   - el Cotizador (QuotePrint.tsx arma estos datos con su cálculo de pantalla), y
//   - el enlace del cliente (CotizacionPublicaPage.tsx los arma con lo que manda el servidor).
// Por eso esta hoja solo recibe PRECIOS DE VENTA: nunca costos, ganancia ni proveedor.

// Logo de GEMESEG en sus colores originales (letras oscuras sobre blanco), el mismo del cotizador original.
// El logo que guarda la empresa en la app es el claro, pensado para el menú oscuro: no sirve sobre papel blanco.
const LOGO_GEMESEG_SOBRE_BLANCO = '/resources/logo-gemeseg-bgwhite.png';

export interface HojaFilaProducto {
  /** Modelo del equipo (vacío en materiales y servicios): se imprime en lugar del código. */
  modelo: string;
  nombre: string;
  /** Unidad de venta («—» si no tiene). */
  unidad: string;
  /** Precio de venta unitario sin IVA. */
  precioUnitario: number;
  /** Cantidad que se imprime (en un kit, la de cada kit). */
  cantidad: number;
  total: number;
  admiteInstalacion: boolean;
  instalacionIncluida: boolean;
}

export type HojaBloque =
  | { tipo: 'producto'; fila: HojaFilaProducto }
  | { tipo: 'kit'; nombre: string; cantidad: number; filas: HojaFilaProducto[] };

export interface HojaServicio {
  descripcion: string;
  categoria: string;
  subcategoria: string;
  precioUnitario: number;
  cantidad: number;
  total: number;
}

export interface HojaDatos {
  empresa: string;
  /** Logo de la empresa ya resuelto (URL completa); GEMESEG usa siempre su logo sobre blanco. */
  logoUrl?: string | null;
  numero: string;
  fecha: string;
  cliente: { name: string; ruc: string; phone: string; address: string; contact: string; email: string };
  bloques: HojaBloque[];
  custodias: HojaServicio[];
  instalaciones: HojaServicio[];
  totales: Totales;
  discountType: DiscountType;
  discountValue: number;
  condiciones: string;
  notas: string;
  emisor: { nombre: string; cargo: string; telefono: string };
}

export default function HojaCotizacion({ d }: { d: HojaDatos }) {
  const kits = d.bloques.filter((b) => b.tipo === 'kit');
  const prods = d.bloques.filter((b) => b.tipo === 'producto');
  let n = 0;

  const esGemeseg = /gemeseg/i.test(d.empresa);
  const logo = esGemeseg ? LOGO_GEMESEG_SOBRE_BLANCO : d.logoUrl;

  const row = (f: HojaFilaProducto, key: string) => {
    n++;
    return (
      <tr key={key}>
        <td className="num">{n}</td>
        <td>
          <span className="desc">{f.nombre}</span>
          {f.modelo && <small>{f.modelo}</small>}
        </td>
        <td className="center und">{f.unidad || '—'}</td>
        <td className="right">{money(f.precioUnitario)}</td>
        <td className="center">{f.cantidad}</td>
        <td className="right">
          <strong>{money(f.total)}</strong>
        </td>
        <td className="center">
          {f.admiteInstalacion ? <span className={`inst-box${f.instalacionIncluida ? ' on' : ''}`} /> : '—'}
        </td>
      </tr>
    );
  };

  const condLines = d.condiciones.trim() ? d.condiciones.trim().split('\n') : [];

  return (
    <div className="cot-print-only" aria-hidden="true">
      <div className="cot-print-header">
        <div className={`cot-print-logo${esGemeseg ? '' : ' en-caja'}`}>{logo && <img src={logo} alt={d.empresa} />}</div>
        <div>
          <div className="cot-print-title">Cotizador {d.empresa}</div>
          {d.emisor.telefono && (
            <div className="cot-print-sub">
              <Phone size={11} fill="currentColor" strokeWidth={1.5} className="cot-print-phone" />
              {d.emisor.telefono}
            </div>
          )}
        </div>
      </div>

      <div className="cot-print-info">
        <div>
          <span className="label">N° Cotización:</span> <strong>{d.numero || '—'}</strong>
        </div>
        <div>
          <span className="label">Fecha emisión:</span> <strong>{d.fecha || '—'}</strong>
        </div>
        <div>
          <span className="label">Validez:</span> <strong>15 días</strong>
        </div>
      </div>

      <div className="cot-print-client">
        <div className="cot-print-client-grid">
          <div>
            <span className="label">Cliente:</span> {d.cliente.name || '—'}
          </div>
          <div>
            <span className="label">RUC / Cédula:</span> {d.cliente.ruc || '—'}
          </div>
          <div>
            <span className="label">Teléfono:</span> {d.cliente.phone || '—'}
          </div>
          <div>
            <span className="label">Dirección:</span> {d.cliente.address || '—'}
          </div>
          <div>
            <span className="label">Contacto:</span> {d.cliente.contact || '—'}
          </div>
          <div>
            <span className="label">Email:</span> {d.cliente.email || '—'}
          </div>
        </div>
      </div>

      {(kits.length > 0 || prods.length > 0) && (
        <table className="cot-print-table">
          <thead>
            <tr>
              <th style={{ width: 24 }}>#</th>
              <th>Nombre</th>
              <th className="center" style={{ width: 40 }}>
                Und
              </th>
              <th className="right" style={{ width: 84 }}>
                Costo unit.
              </th>
              <th className="center" style={{ width: 40 }}>
                Cant
              </th>
              <th className="right" style={{ width: 96 }}>
                Costo total
              </th>
              <th className="center" style={{ width: 36 }}>
                Inst
              </th>
            </tr>
          </thead>
          <tbody>
            {kits.map((b, i) =>
              b.tipo === 'kit' ? (
                <Fragment key={`k${i}`}>
                  <tr className="kit">
                    <td>📦</td>
                    <td colSpan={6}>
                      {b.nombre} <small>x{b.cantidad}</small>
                    </td>
                  </tr>
                  {b.filas.map((f, j) => row(f, `k${i}c${j}`))}
                </Fragment>
              ) : null,
            )}
            {prods.map((b, i) => (b.tipo === 'producto' ? row(b.fila, `p${i}`) : null))}
          </tbody>
        </table>
      )}

      {d.custodias.length > 0 && (
        <>
          <div className="cot-print-section-title">SERVICIO DE CUSTODIA MÓVIL</div>
          <table className="cot-print-table">
            <thead>
              <tr>
                <th style={{ width: 24 }}>#</th>
                <th>Servicio / Descripción</th>
                <th className="right" style={{ width: 84 }}>
                  Precio unit.
                </th>
                <th className="center" style={{ width: 40 }}>
                  Cant
                </th>
                <th className="right" style={{ width: 96 }}>
                  Precio total
                </th>
              </tr>
            </thead>
            <tbody>
              {d.custodias.map((s, i) => (
                <tr key={`c${i}`}>
                  <td className="num">{i + 1}</td>
                  <td>
                    <span className="desc">{s.descripcion}</span>
                  </td>
                  <td className="right">{money(s.precioUnitario)}</td>
                  <td className="center">{s.cantidad}</td>
                  <td className="right">
                    <strong>{money(s.total)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {d.instalaciones.length > 0 && (
        <>
          <div className="cot-print-section-title">SERVICIOS DE INSTALACIÓN</div>
          <table className="cot-print-table">
            <thead>
              <tr>
                <th style={{ width: 24 }}>#</th>
                <th>Servicio / Descripción</th>
                <th className="right" style={{ width: 84 }}>
                  Costo unit.
                </th>
                <th className="center" style={{ width: 40 }}>
                  Cant
                </th>
                <th className="right" style={{ width: 96 }}>
                  Precio total
                </th>
              </tr>
            </thead>
            <tbody>
              {d.instalaciones.map((s, i) => (
                <tr key={`i${i}`}>
                  <td className="num">{i + 1}</td>
                  <td>
                    <span className="desc">{s.descripcion}</span>
                    {(s.categoria || s.subcategoria) && (
                      <small>
                        {' '}
                        ({s.categoria}
                        {s.subcategoria ? ` › ${s.subcategoria}` : ''})
                      </small>
                    )}
                  </td>
                  <td className="right">{money(s.precioUnitario)}</td>
                  <td className="center">{s.cantidad}</td>
                  <td className="right">
                    <strong>{money(s.total)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <QuoteTotals totals={d.totales} discountType={d.discountType} discountValue={d.discountValue} />

      {(condLines.length > 0 || d.notas.trim()) && (
        <div className="cot-print-cond">
          {condLines.length > 0 && (
            <>
              <strong>CONDICIONES COMERCIALES</strong>
              <br />
              <br />
              {condLines.map((l, i) => {
                const parts = splitConditionLine(l);
                return (
                  <Fragment key={i}>
                    {parts ? (
                      <>
                        <strong>{parts.label}:</strong> {parts.value}
                      </>
                    ) : (
                      l
                    )}
                    <br />
                  </Fragment>
                );
              })}
            </>
          )}
          {d.notas.trim() && (
            <div style={{ marginTop: 10 }}>
              <strong>NOTAS:</strong>
              <br />
              {d.notas
                .trim()
                .split('\n')
                .map((l, i) => (
                  <Fragment key={i}>
                    {l}
                    <br />
                  </Fragment>
                ))}
            </div>
          )}
        </div>
      )}

      <div className="cot-print-sign">
        <div className="block">
          Emite la cotización
          <br />
          <small>{d.emisor.nombre || '[Nombre del responsable]'}</small>
          <br />
          <small>{d.emisor.cargo || '[Cargo]'}</small>
        </div>
        <div className="block">
          Acepta el cliente
          <br />
          <small>Fecha: ___ / ___ / ______</small>
        </div>
      </div>

      <div className="cot-print-legal">
        Los precios están expresados en dólares de los Estados Unidos de América (USD). El IVA del 15% se muestra
        desglosado al final. Esta cotización es válida por 15 días calendario desde la fecha de emisión. Los precios
        pueden variar sin previo aviso debido a fluctuaciones del mercado y disponibilidad del proveedor. La aceptación
        de esta cotización implica la conformidad con las condiciones aquí establecidas. Para confirmar la orden, favor
        responder por escrito o firmar la cotización adjunta.
      </div>
    </div>
  );
}
