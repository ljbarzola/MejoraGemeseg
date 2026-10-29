import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAnaliticaMotivos, type AnaliticaMotivos } from '../../../services/ventas.service';
import { Cargando, Tarjeta } from './DashboardBits';
import { Dona, type SegmentoDona } from './DashboardGraficos';

type Cierre = AnaliticaMotivos['porCierre'][number];

// Del azul de la marca al violeta y al ámbar: una escala corta para los motivos, no un arcoíris.
const PALETA = ['#12375F', '#2b6cb0', '#6a6fc9', '#d97706', '#2f855a', '#a56fc9', '#c53030', '#0e7490'];
const color = (label: string, i: number) => (label === 'Sin información' ? '#94a3b8' : label === 'Otro' ? '#cbd5e1' : PALETA[i % PALETA.length]);

// Une los motivos de varios tipos de cierre en una sola lista (los tres que terminan un contrato).
function unir(cierres: Cierre[]): { total: number; items: { label: string; count: number }[]; sinInfo: number; vendedor: number; cliente: number } {
  const cuenta = new Map<string, number>();
  let total = 0, sinInfo = 0, vendedor = 0, cliente = 0;
  for (const c of cierres) {
    total += c.total;
    sinInfo += (c.sinInformacionPct / 100) * c.total;
    vendedor += (c.segunVendedorPct / 100) * c.total;
    cliente += (c.segunClientePct / 100) * c.total;
    for (const i of c.items) cuenta.set(i.label, (cuenta.get(i.label) ?? 0) + i.count);
  }
  const items = [...cuenta.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  return { total, items, sinInfo: pct(sinInfo), vendedor: pct(vendedor), cliente: pct(cliente) };
}

// Motivos de pérdida: por qué se pierde lo que se pierde, en tres cierres distintos. Cada dona es UNO de ellos, dice qué
// contiene y cada motivo lleva a la pantalla donde están esos casos. Cada tarjeta dice cuánto de lo registrado es «sin
// información» y cuánto es solo la suposición del vendedor: sin eso, la dona parecería más segura de lo que es.
export default function DashboardMotivos({ alcance, desde, hasta }: { alcance: string; desde: string; hasta: string }) {
  const navigate = useNavigate();
  const [datos, setDatos] = useState<AnaliticaMotivos | null>(null);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    try {
      setDatos(await getAnaliticaMotivos({ alcance, desde, hasta }));
    } catch {
      setError(true);
    }
  }, [alcance, desde, hasta]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!datos) return <Cargando error={error} onReintentar={cargar} />;
  const de = (kind: string) => datos.porCierre.find((k) => k.kind === kind);
  const lead = de('LEAD_DESCARTE');
  const opp = de('OPP_PERDIDA');
  const contratos = unir(['CONTRATO_CANCELADO', 'CONTRATO_NO_RENOVADO'].map(de).filter((x): x is Cierre => !!x));
  const reducidos = de('CONTRATO_REDUCCION')?.total ?? 0;

  const ir = (ruta: string, filtros: Record<string, string>) => navigate(`${ruta}?${new URLSearchParams({ ...filtros, responsable: alcance }).toString()}`);

  const segmentos = (items: { label: string; count: number }[], abrir: (label: string) => void): SegmentoDona[] =>
    items.map((i, n) => ({ key: i.label, etiqueta: i.label, valor: i.count, color: color(i.label, n), onClick: () => abrir(i.label) }));

  const pie = (sinInfo: number, vendedor: number, cliente: number) => (
    <p className="dash-notas">
      <strong>{Math.round(cliente)}%</strong> lo dijo el cliente · <strong>{Math.round(vendedor)}%</strong> es suposición del vendedor · <strong>{Math.round(sinInfo)}%</strong> sin información.
    </p>
  );

  return (
    <div className="dash-pila">
      <div className="dash-grid dash-grid--3">
        <Tarjeta
          titulo={`Posibles clientes descartados (${lead?.total ?? 0})`}
          hint="Contactos que llegaron por la web, los anuncios o a mano y se descartaron en el periodo sin pasar a oportunidad: spam, empleo, proveedores o sin interés. Pulsa un motivo para ver esos casos (la lista no se limita al periodo)."
        >
          <Dona
            aria={`Motivos de descarte de posibles clientes: ${(lead?.items ?? []).map((i) => `${i.label} ${i.count}`).join(', ') || 'sin datos'}`}
            centroTitulo="descartados" vacio="Todavía no hay descartes registrados en este periodo."
            segmentos={segmentos(lead?.items ?? [], (m) => ir('/ventas/leads', { estado: 'DESCARTADO', motivoDescarte: m }))}
          />
          {lead && lead.total > 0 && pie(lead.sinInformacionPct, lead.segunVendedorPct, lead.segunClientePct)}
        </Tarjeta>

        <Tarjeta
          titulo={`Oportunidades perdidas (${opp?.total ?? 0})`}
          hint="Negociaciones que ya eran una oportunidad y se cerraron sin venta en el periodo: el cliente dijo que no o no se pudo concretar. Pulsa un motivo para ver esos casos (la lista no se limita al periodo)."
        >
          <Dona
            aria={`Motivos de oportunidades perdidas: ${(opp?.items ?? []).map((i) => `${i.label} ${i.count}`).join(', ') || 'sin datos'}`}
            centroTitulo="perdidas" vacio="Todavía no hay oportunidades perdidas con motivo en este periodo."
            segmentos={segmentos(opp?.items ?? [], (m) => ir('/ventas/oportunidades', { etapa: 'RECHAZADO', motivo: m }))}
          />
          {opp && opp.total > 0 && pie(opp.sinInformacionPct, opp.segunVendedorPct, opp.segunClientePct)}
        </Tarjeta>

        <Tarjeta
          titulo={`Contratos que se pierden (${contratos.total})`}
          hint="Contratos que se cancelaron o que vencieron sin renovarse, con el motivo que se registró en el periodo. Pulsa un motivo para ver esos casos (la lista no se limita al periodo)."
        >
          <Dona
            aria={`Motivos por los que se pierden contratos: ${contratos.items.map((i) => `${i.label} ${i.count}`).join(', ') || 'sin datos'}`}
            centroTitulo="contratos" vacio="Todavía no hay contratos perdidos con motivo en este periodo."
            segmentos={segmentos(contratos.items, (m) => ir('/ventas/contratos', { motivo: m }))}
          />
          {contratos.total > 0 && pie(contratos.sinInfo, contratos.vendedor, contratos.cliente)}
          {reducidos > 0 && (
            <p className="dash-notas">
              Además, {reducidos} {reducidos === 1 ? 'contrato se renovó' : 'contratos se renovaron'} con menos servicios o menor valor.
            </p>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
