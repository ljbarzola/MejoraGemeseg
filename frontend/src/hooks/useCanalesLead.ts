import { useEffect, useState } from 'react';
import { getCanalesLead, type CanalLeadDef } from '../services/ventas.service';

// Los canales de un lead (Google Ads, Referido, WhatsApp...) vienen del
// servidor y casi nunca cambian: se piden una vez y se reutilizan en todas las
// pantallas de Ventas.
let cache: CanalLeadDef[] | null = null;
let pendiente: Promise<CanalLeadDef[]> | null = null;

export function useCanalesLead() {
  const [canales, setCanales] = useState<CanalLeadDef[]>(cache ?? []);

  useEffect(() => {
    if (cache) return;
    pendiente ??= getCanalesLead().then((c) => (cache = c));
    let vivo = true;
    pendiente
      .then((c) => { if (vivo) setCanales(c); })
      .catch(() => { pendiente = null; });
    return () => { vivo = false; };
  }, []);

  // Mientras no cargan (o si falla), se muestra la clave tal cual en vez de romper la pantalla.
  const etiquetaCanal = (key: string | null | undefined) =>
    key ? canales.find((c) => c.key === key)?.label ?? key : '';

  return { canales, etiquetaCanal };
}
