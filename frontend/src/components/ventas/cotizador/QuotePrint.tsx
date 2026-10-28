import { Fragment } from 'react';
import { Phone } from 'lucide-react';
import type { ProductComputation, QuoteComputation } from '../../../utils/cotizador/pricing';
import type { QuoteDraft } from '../../../utils/cotizador/draft';
import { money, splitConditionLine } from '../../../utils/cotizador/format';
import QuoteTotals from './QuoteTotals';

// Logo de GEMESEG en sus colores originales (letras oscuras sobre blanco), el mismo del cotizador original.
// El logo que guarda la empresa en la app es el claro, pensado para el menú oscuro: no sirve sobre papel blanco.
const LOGO_GEMESEG_SOBRE_BLANCO = '/resources/logo-gemeseg-bgwhite.png';

interface Props {
  draft: QuoteDraft;
  comp: QuoteComputation;
  companyName: string;
  logoUrl?: string | null;
  issuerName: string;
  issuerRole: string;
  /** Teléfono de quien emite (ya con el de respaldo aplicado). */
  issuerPhone: string;
}

// Lo que se imprime / guarda como PDF. NUNCA muestra el costo del proveedor, la ganancia ni el nombre del
// proveedor: "Costo unit." y "Costo total" son los precios de venta (sin IVA), igual que el cotizador original.
// El formato (encabezado, datos en columna, cuadro de totales oscuro, firmas) sigue al PDF del original.
export default function QuotePrint({ draft, comp, companyName, logoUrl, issuerName, issuerRole, issuerPhone }: Props) {
  const kits = comp.lines.filter((l) => l.kind === 'kit');
  const prods = comp.lines.filter((l) => l.kind === 'product');
  const installs = comp.lines.filter((l) => l.kind === 'install');
  let n = 0;

  const esGemeseg = /gemeseg/i.test(companyName);
  const logo = esGemeseg ? LOGO_GEMESEG_SOBRE_BLANCO : logoUrl;

  const row = (c: ProductComputation, key: string) => {
    if (c.missing || !c.item || !c.price) return null;
    n++;
    return (
      <tr key={key}>
        <td className="num">{n}</td>
        <td>
          <span className="desc">{c.item.name}</span>
          <small>{c.item.code}</small>
        </td>
        <td className="center und">{c.item.unit || '—'}</td>
        <td className="right">{money(c.price.priceBeforeIva)}</td>
        <td className="center">{c.line.qty}</td>
        <td className="right">
          <strong>{money(c.pvpTotal)}</strong>
        </td>
        <td className="center">
          {c.item.hasInstalacion ? <span className={`inst-box${c.line.installActive ? ' on' : ''}`} /> : '—'}
        </td>
      </tr>
    );
  };

  const condLines = draft.conditions.trim() ? draft.conditions.trim().split('\n') : [];

  return (
    <div className="cot-print-only" aria-hidden="true">
      <div className="cot-print-header">
        <div className={`cot-print-logo${esGemeseg ? '' : ' en-caja'}`}>{logo && <img src={logo} alt={companyName} />}</div>
        <div>
          <div className="cot-print-title">Cotizador {companyName}</div>
          {issuerPhone && (
            <div className="cot-print-sub">
              <Phone size={11} fill="currentColor" strokeWidth={1.5} className="cot-print-phone" />
              {issuerPhone}
            </div>
          )}
        </div>
      </div>

      <div className="cot-print-info">
        <div>
          <span className="label">N° Cotización:</span> <strong>{draft.quoteNumber || '—'}</strong>
        </div>
        <div>
          <span className="label">Fecha emisión:</span> <strong>{draft.quoteDate || '—'}</strong>
        </div>
        <div>
          <span className="label">Validez:</span> <strong>15 días</strong>
        </div>
      </div>

      <div className="cot-print-client">
        <div className="cot-print-client-grid">
          <div>
            <span className="label">Cliente:</span> {draft.client.name || '—'}
          </div>
          <div>
            <span className="label">RUC / Cédula:</span> {draft.client.ruc || '—'}
          </div>
          <div>
            <span className="label">Teléfono:</span> {draft.client.phone || '—'}
          </div>
          <div>
            <span className="label">Dirección:</span> {draft.client.address || '—'}
          </div>
          <div>
            <span className="label">Contacto:</span> {draft.client.contact || '—'}
          </div>
          <div>
            <span className="label">Email:</span> {draft.client.email || '—'}
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
            {kits.map((l, i) =>
              l.kind === 'kit' ? (
                <Fragment key={`k${i}`}>
                  <tr className="kit">
                    <td>📦</td>
                    <td colSpan={6}>
                      {l.line.kitName} <small>x{l.line.qty}</small>
                    </td>
                  </tr>
                  {l.comps.map((c, j) => row(c, `k${i}c${j}`))}
                </Fragment>
              ) : null,
            )}
            {prods.map((l, i) => (l.kind === 'product' ? row(l, `p${i}`) : null))}
          </tbody>
        </table>
      )}

      {installs.length > 0 && (
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
              {installs.map((l, i) =>
                l.kind === 'install' ? (
                  <tr key={`i${i}`}>
                    <td className="num">{i + 1}</td>
                    <td>
                      <span className="desc">{l.line.description}</span>
                      {(l.line.category || l.line.subcategory) && (
                        <small>
                          {' '}
                          ({l.line.category}
                          {l.line.subcategory ? ` › ${l.line.subcategory}` : ''})
                        </small>
                      )}
                    </td>
                    <td className="right">{money(l.line.qty > 0 ? l.pvpTotal / l.line.qty : 0)}</td>
                    <td className="center">{l.line.qty}</td>
                    <td className="right">
                      <strong>{money(l.pvpTotal)}</strong>
                    </td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </>
      )}

      <QuoteTotals totals={comp.totals} discountType={draft.discountType} discountValue={draft.discountValue} />

      {(condLines.length > 0 || draft.notes.trim()) && (
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
          {draft.notes.trim() && (
            <div style={{ marginTop: 10 }}>
              <strong>NOTAS:</strong>
              <br />
              {draft.notes
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
          <small>{issuerName || '[Nombre del responsable]'}</small>
          <br />
          <small>{issuerRole || '[Cargo]'}</small>
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
