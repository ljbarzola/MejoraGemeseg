import { FileText, Image as ImageIcon, Mail, Megaphone, MessageCircle, Share2, Video, Globe } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MarketingPieza } from '../../types/marketing';
import { etiquetaCanal, etiquetaTipo } from './marketingEtiquetas';
import EstadoMarketing from './EstadoMarketing';

const DIAS = ['lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado', 'domingo'];

function iconoCanal(canal: string | null): ReactNode {
  const c = (canal || '').toLowerCase();
  if (/whats|mensaje|sms|telegram/.test(c)) return <MessageCircle size={14} />;
  if (/correo|mail|email/.test(c)) return <Mail size={14} />;
  if (/instagram|facebook|tiktok|linkedin|red/.test(c)) return <Share2 size={14} />;
  if (/web|landing|blog|sitio/.test(c)) return <Globe size={14} />;
  return <Megaphone size={14} />;
}

function iconoTipo(tipo: string): ReactNode {
  const t = tipo.toLowerCase();
  if (t === 'imagen') return <ImageIcon size={14} />;
  if (t === 'video') return <Video size={14} />;
  return <FileText size={14} />;
}

function ordenDia(dia: string | null): number {
  const i = DIAS.indexOf((dia || '').trim().toLowerCase());
  return i < 0 ? 99 : i;
}

/** Calendario por semanas: una columna por semana, cada pieza con icono de tipo y de canal. */
export default function MarketingCalendario({
  piezas,
  resumen,
}: {
  piezas: MarketingPieza[];
  resumen: string | null;
}) {
  const activas = piezas.filter((p) => p.estado !== 'DESCARTADO');
  const semanas = new Map<number, MarketingPieza[]>();
  for (const p of activas) {
    const s = p.semana ?? 0;
    semanas.set(s, [...(semanas.get(s) ?? []), p]);
  }
  const claves = [...semanas.keys()].sort((a, b) => (a || 99) - (b || 99));

  if (!activas.length) return <p style={{ color: '#64748b' }}>No hay piezas para programar.</p>;

  return (
    <>
      {resumen && <p className="marketing-calendario-resumen">{resumen}</p>}
      <div className="marketing-calendario" role="list" aria-label="Calendario por semanas">
        {claves.map((s) => (
          <div className="marketing-calendario-col" key={s} role="listitem">
            <div className="marketing-calendario-cabecera">{s ? `Semana ${s}` : 'Sin semana'}</div>
            {[...(semanas.get(s) ?? [])]
              .sort((a, b) => ordenDia(a.dia) - ordenDia(b.dia))
              .map((p) => (
                <div className="marketing-calendario-item" key={p.id}>
                  <div className="marketing-calendario-dia">{p.dia || 'Sin día fijo'}</div>
                  <strong>{p.titulo || etiquetaTipo(p.tipo)}</strong>
                  <div className="marketing-calendario-meta">
                    <span title={etiquetaTipo(p.tipo)}>{iconoTipo(p.tipo)} {etiquetaTipo(p.tipo)}</span>
                    <span title={etiquetaCanal(p.canal)}>{iconoCanal(p.canal)} {etiquetaCanal(p.canal)}</span>
                  </div>
                  <EstadoMarketing estado={p.estado} />
                </div>
              ))}
          </div>
        ))}
      </div>
    </>
  );
}
