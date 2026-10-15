import { Fragment } from 'react';
import type { ProductComputation, QuoteComputation } from '../../../utils/cotizador/pricing';
import type { QuoteDraft } from '../../../utils/cotizador/draft';
import { isoToDMY, money, splitConditionLine } from '../../../utils/cotizador/format';
import QuoteTotals from './QuoteTotals';

interface Props {
  draft: QuoteDraft;
  comp: QuoteComputation;
  companyName: string;
  logoUrl?: string | null;
  issuerName: string;
  issuerRole: string;
  issuerContact: string;
  /** Teléfono de quien emite (ya con el de respaldo aplicado). */
  issuerPhone: string;
}

// Lo que se imprime / guarda como PDF. NUNCA muestra el costo del proveedor, la ganancia ni el nombre del
// proveedor: "Costo unit." y "Costo total" son los precios de venta (sin IVA), igual que el cotizador original.
export default function QuotePrint({ draft, comp, companyName, logoUrl, issuerName, issuerRole, issuerContact, issuerPhone }: Props) {
  const kits = comp.lines.filter((l) => l.kind === 'kit');
  const prods = comp.lines.filter((l) => l.kind === 'product');
  const installs = comp.lines.filter((l) => l.kind === 'install');
  let n = 0;

  const row = (c: ProductComputation, key: string) => {
    if (c.missing || !c.item || !c.price) return null;
    n++;
    return (
      <tr key={key}>
        <td>{n}</td>
        <td>
          <strong>{c.item.name}</strong>
          <br />
          <small>{c.item.code}</small>
        </td>
        <td className="center">{c.item.isService ? 'servicio' : ''}</td>
        <td className="right">{money(c.price.priceBeforeIva)}</td>
        <td className="center">{c.line.qty}</td>
        <td className="right">
          <strong>{money(c.pvpTotal)}</strong>
        </td>
      </tr>
    );
  };

  const condLines = draft.conditions.trim() ? draft.conditions.trim().split('\n') : [];

  return (
    <div className="cot-print-only" aria-hidden="true">
      <div className="cot-print-header">
        <div className="cot-print-logo">{logoUrl && <img src={logoUrl} alt={companyName} />}</div>
        <div>
          <div className="cot-print-title">Cotizador {companyName}</div>
          {issuerPhone && <div className="cot-print-sub">Tel. {issuerPhone}</div>}
          {issuerContact && <div className="cot-print-sub">{issuerContact}</div>}
        </div>
      </div>

      <div className="cot-print-info">
        <div>
          <span className="label">N° Cotización:</span> <strong>{draft.quoteNumber || '—'}</strong>
        </div>
        <div>
          <span className="label">Fecha emisión:</span> <strong>{isoToDMY(draft.quoteDate) || '—'}</strong>
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
              <th style={{ width: 22 }}>#</th>
              <th>Nombre</th>
              <th className="center" style={{ width: 50 }}>
                Und
              </th>
              <th className="right" style={{ width: 70 }}>
                Costo unit.
              </th>
              <th className="center" style={{ width: 40 }}>
                Cant
              </th>
              <th className="right" style={{ width: 80 }}>
                Costo total
              </th>
            </tr>
          </thead>
          <tbody>
            {kits.map((l, i) =>
              l.kind === 'kit' ? (
                <Fragment key={`k${i}`}>
                  <tr className="kit">
                    <td>📦</td>
                    <td colSpan={5}>
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
                <th style={{ width: 22 }}>#</th>
                <th>Servicio / Descripción</th>
                <th className="center" style={{ width: 40 }}>
                  Cant
                </th>
                <th className="right" style={{ width: 90 }}>
                  Precio total
                </th>
              </tr>
            </thead>
            <tbody>
              {installs.map((l, i) =>
                l.kind === 'install' ? (
                  <tr key={`i${i}`}>
                    <td>{i + 1}</td>
                    <td>
                      <strong>{l.line.description}</strong>
                      {(l.line.category || l.line.subcategory) && (
                        <small>
                          {' '}
                          ({l.line.category}
                          {l.line.subcategory ? ` › ${l.line.subcategory}` : ''})
                        </small>
                      )}
                    </td>
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
