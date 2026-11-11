import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { getRevisionIA, pedirRevisionIA } from '../../services/contratacion-publica.service';
import type { CPEstadoEntrega, CPEstadoRevisionIA, CPRevisionIA } from '../../types/contratacion-publica';

export const REVISION_IA_ETIQUETA: Record<CPEstadoRevisionIA, string> = {
  REVISANDO: 'Revisando…',
  PARECE_CORRECTO: 'Parece correcto',
  REVISAR: 'Revisar',
  NO_LEIDO: 'Sin revisar',
  ERROR: 'No se pudo revisar',
};

export const REVISION_IA_COLOR: Record<CPEstadoRevisionIA, { bg: string; fg: string }> = {
  REVISANDO: { bg: '#ebf8ff', fg: '#2b6cb0' },
  PARECE_CORRECTO: { bg: '#f0fff4', fg: '#276749' },
  REVISAR: { bg: '#fffaf0', fg: '#c05621' },
  NO_LEIDO: { bg: '#edf2f7', fg: '#4a5568' },
  ERROR: { bg: '#edf2f7', fg: '#4a5568' },
};

const SONDEO_MS = 4000;
const SONDEO_MAX = 40; // ~2,5 minutos y se deja de insistir

interface Props {
  entregaId: number;
  estadoDocumento: CPEstadoEntrega;
  /** Quien puede rechazar: ve el botón que pasa el texto sugerido al cuadro del motivo. */
  puedeProponerMotivo: boolean;
  /** `soloSiVacio`: la propuesta automática no pisa lo que la persona ya escribió. */
  onUsarMotivo: (texto: string, soloSiVacio?: boolean) => void;
}

/**
 * Nota del Agente Revisor de Entregas dentro del panel de revisión. Si el documento está entregado
 * y el agente todavía no lo miró (por ejemplo, quien entregó cerró la pestaña), lo pide una vez.
 * Solo sugiere: aprobar o rechazar lo decide quien revisa.
 */
export default function RevisionIA({ entregaId, estadoDocumento, puedeProponerMotivo, onUsarMotivo }: Props) {
  const [rev, setRev] = useState<CPRevisionIA | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [pidiendo, setPidiendo] = useState(false);
  const pedidos = useRef(new Set<number>());

  const pedir = (volver: boolean) => {
    setPidiendo(true);
    setFallo(false);
    pedirRevisionIA(entregaId, volver)
      .then((r) => setRev(r.revision))
      .catch(() => setFallo(true))
      .finally(() => setPidiendo(false));
  };

  useEffect(() => {
    let cancelado = false;
    setRev(null);
    setFallo(false);
    setCargando(true);
    getRevisionIA(entregaId)
      .then((r) => {
        if (cancelado) return;
        setRev(r.revision);
        // Entregado y sin nota del agente: se pide una sola vez por documento.
        if (!r.revision && estadoDocumento === 'ENTREGADO' && !pedidos.current.has(entregaId)) {
          pedidos.current.add(entregaId);
          pedir(false);
        }
      })
      .catch(() => { if (!cancelado) setFallo(true); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregaId]);

  // Si el agente pide revisar, el cuadro del motivo del rechazo ya viene escrito (el panel solo lo
  // rellena si está vacío; quien revisa lo edita o lo ignora, y nada se rechaza solo).
  useEffect(() => {
    if (puedeProponerMotivo && rev?.estado === 'REVISAR' && rev.mensajeRechazo) onUsarMotivo(rev.mensajeRechazo, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev?.entregaId, rev?.estado, rev?.mensajeRechazo]);

  // Mientras el agente lee, se vuelve a preguntar cada pocos segundos.
  useEffect(() => {
    if (rev?.estado !== 'REVISANDO') return;
    let intentos = 0;
    const t = window.setInterval(() => {
      intentos += 1;
      getRevisionIA(entregaId)
        .then((r) => { if (r.revision && r.revision.estado !== 'REVISANDO') setRev(r.revision); })
        .catch(() => undefined);
      if (intentos >= SONDEO_MAX) window.clearInterval(t);
    }, SONDEO_MS);
    return () => window.clearInterval(t);
  }, [entregaId, rev?.estado]);

  const caja: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: 6 };
  const titulo = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#4a5568', fontSize: '0.78rem' }}>
      <Sparkles size={13} /> Revisión del agente
    </div>
  );

  if (cargando || pidiendo || rev?.estado === 'REVISANDO') {
    return (
      <div style={caja}>
        {titulo}
        <div style={{ color: '#718096' }}>El agente está leyendo el documento…</div>
      </div>
    );
  }
  if (fallo && !rev) {
    return (
      <div style={caja}>
        {titulo}
        <div style={{ color: '#718096' }}>No se pudo consultar la revisión del agente.</div>
        {estadoDocumento === 'ENTREGADO' && (
          <button type="button" className="btn-secondary" style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => pedir(false)}>
            Volver a intentar
          </button>
        )}
      </div>
    );
  }
  if (!rev) return null; // documento sin entregar o ya resuelto sin nota

  const color = REVISION_IA_COLOR[rev.estado];
  const terminada = rev.estado === 'PARECE_CORRECTO' || rev.estado === 'REVISAR';
  return (
    <div style={caja}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {titulo}
        <span className="status-badge" style={{ background: color.bg, color: color.fg }}>{REVISION_IA_ETIQUETA[rev.estado]}</span>
      </div>
      {terminada && rev.tipoDocumento && <div style={{ color: '#718096' }}>Parece: {rev.tipoDocumento}</div>}
      {terminada && rev.motivos.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, color: '#c05621' }}>
          {rev.motivos.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
      {terminada && rev.motivos.length === 0 && rev.resumen && <div>{rev.resumen}</div>}
      {!terminada && rev.mensaje && <div style={{ color: '#718096' }}>{rev.mensaje}</div>}
      {terminada && <div style={{ color: '#a0aec0', fontSize: '0.72rem' }}>Es una sugerencia sobre firma, sello, vigencia y si se lee: tú decides.</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {rev.estado === 'REVISAR' && rev.mensajeRechazo && puedeProponerMotivo && (
          <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => onUsarMotivo(rev.mensajeRechazo)}>
            Usar como motivo del rechazo
          </button>
        )}
        {estadoDocumento === 'ENTREGADO' && (terminada || rev.estado === 'ERROR') && (
          <button type="button" className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => pedir(true)}>
            <RefreshCw size={12} /> {rev.estado === 'ERROR' ? 'Volver a intentar' : 'Volver a revisar'}
          </button>
        )}
      </div>
    </div>
  );
}
