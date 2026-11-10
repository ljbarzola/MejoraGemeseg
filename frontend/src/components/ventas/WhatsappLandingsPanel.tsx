import { useEffect, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { getCiudadesWhatsapp, guardarCiudadesWhatsapp, type CiudadesWhatsapp } from '../../services/ventas.service';
import { numeroLegible } from '../../utils/numeroWhatsapp';

interface CiudadEditable { nombre: string; numeros: string[] }

// Lo que se pega en cada landing para medir los clics al botón de WhatsApp. La clave es PÚBLICA: va en la
// etiqueta <script> y cualquiera puede verla en la página; solo sirve para registrar clics anónimos, nunca
// para leer nada del CRM. Los clics no se gestionan en una pantalla: se enlazan al crear un posible cliente
// con el «Código del mensaje» y se cuentan en el Dashboard de marketing.
export default function WhatsappLandingsPanel({ clave, puedeEditar = true }: { clave: string; puedeEditar?: boolean }) {
  const { showToast } = useToast();
  const [ciudades, setCiudades] = useState<CiudadEditable[] | null>(null);
  const [sinCiudad, setSinCiudad] = useState<string[]>([]);
  const [clicsPorNumero, setClicsPorNumero] = useState<Record<string, number>>({});
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [nuevaCiudad, setNuevaCiudad] = useState('');
  const [nuevoNumero, setNuevoNumero] = useState<Record<number, string>>({});

  const aplicar = (r: CiudadesWhatsapp) => {
    setCiudades(r.ciudades.map((c) => ({ nombre: c.nombre, numeros: c.numeros.map((n) => n.numero) })));
    setSinCiudad(r.sinCiudad.map((n) => n.numero));
    setClicsPorNumero(Object.fromEntries([...r.ciudades.flatMap((c) => c.numeros), ...r.sinCiudad].map((n) => [n.numero, n.clics])));
    setSucio(false);
  };

  useEffect(() => {
    getCiudadesWhatsapp().then(aplicar).catch(() => setCiudades([]));
  }, []);

  const cambiar = (fn: (c: CiudadEditable[]) => CiudadEditable[]) => { setCiudades((c) => fn(c ?? [])); setSucio(true); };

  const agregarCiudad = () => {
    const nombre = nuevaCiudad.trim();
    if (!nombre) return;
    if ((ciudades ?? []).some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) { showToast('Esa ciudad ya está en la lista.', 'error'); return; }
    cambiar((c) => [...c, { nombre, numeros: [] }]);
    setNuevaCiudad('');
  };

  const agregarNumero = (i: number) => {
    const d = (nuevoNumero[i] ?? '').replace(/\D/g, '');
    if (d.length < 8 || d.length > 15) { showToast('Escribe el número completo con el código de país, por ejemplo 593998246418.', 'error'); return; }
    const otra = (ciudades ?? []).find((c, j) => j !== i && c.numeros.includes(d));
    if (otra) { showToast(`Ese número ya está en «${otra.nombre}». Un número solo puede ser de una ciudad.`, 'error'); return; }
    cambiar((c) => c.map((x, j) => (j === i && !x.numeros.includes(d) ? { ...x, numeros: [...x.numeros, d] } : x)));
    setSinCiudad((s) => s.filter((n) => n !== d));
    setNuevoNumero({ ...nuevoNumero, [i]: '' });
  };

  const asignar = (numero: string, i: number) => {
    cambiar((c) => c.map((x, j) => (j === i ? { ...x, numeros: [...x.numeros, numero] } : x)));
    setSinCiudad((s) => s.filter((n) => n !== numero));
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      aplicar(await guardarCiudadesWhatsapp(ciudades ?? []));
      showToast('Ciudades guardadas', 'success');
    } catch (e: any) {
      showToast(e?.response?.data?.message && typeof e.response.data.message === 'string' ? e.response.data.message : 'No se pudieron guardar las ciudades. Intenta de nuevo.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  // Las landings viven en otro dominio (gemeseg.com): llaman al CRM por su dirección pública, no por la de esta pantalla.
  const api = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : 'https://app.gemeseg.com/api';
  const etiqueta = `<script src="/gemeseg-wa-tracking.js" defer\n  data-site-key="${clave || '...'}"\n  data-api="${api}"\n  data-whatsapp="593969135744"></script>`;

  return (
    <div className="admin-section">
      <p style={{ fontSize: 13, color: '#4a5568', margin: '12px 0' }}>
        Cada vez que alguien toca el botón de WhatsApp de una landing, el CRM guarda el clic con un código (<strong style={{ fontFamily: 'monospace' }}>GMS-WA-XXXXXX</strong>), la campaña y la landing. <strong>Un clic no es un posible cliente</strong>: su lista se abre con «Ver clics» en el Dashboard (pestaña «Embudo de ventas») y desde Posibles clientes → «Llegó un WhatsApp». Cuando alguien escribe, en «Llegó un WhatsApp» pones su código: nace el posible cliente con su campaña y landing. Los clics y las conversaciones también se cuentan en el Dashboard.
      </p>
      <p style={{ fontSize: 13, margin: '0 0 8px' }}>
        Pega esta etiqueta en cada landing y en el sitio nuevo (el archivo <strong>gemeseg-wa-tracking.js</strong> está en la carpeta de landings). Cualquier enlace a <code>wa.me</code> pasa a registrar el clic solo. El servicio sale de la dirección de la página; si hace falta, se fuerza con <code>data-service="monitoreo_vehiculos"</code> en la etiqueta o <code>data-wa-service</code> en un botón.
      </p>
      <pre style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{etiqueta}</pre>
      <button
        className="auth-btn"
        disabled={!clave}
        onClick={() => {
          navigator.clipboard?.writeText(etiqueta).then(
            () => showToast('Etiqueta copiada', 'success'),
            () => showToast('No se pudo copiar. Selecciónala y cópiala a mano.', 'error'),
          );
        }}
      >
        Copiar etiqueta
      </button>

      <h4 style={{ margin: '22px 0 6px', fontSize: 14 }}>Ciudades y sus números de WhatsApp</h4>
      <p style={{ fontSize: 13, color: '#4a5568', margin: '0 0 8px' }}>
        El Dashboard separa los clics, los contactos y las campañas por <strong>ciudad</strong> (Guayaquil, Loja…). Cada ciudad puede tener uno o varios números: si cambia el número o el vendedor, agrega el número nuevo a la misma ciudad y las cifras siguen juntas. Los números nuevos aparecen abajo, en «Sin ciudad», cuando llega su primer clic.
      </p>

      {ciudades === null ? (
        <p style={{ fontSize: 13 }}>Cargando…</p>
      ) : (
        <>
          {ciudades.map((c, i) => (
            <div key={`${c.nombre}-${i}`} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', marginBottom: 10, maxWidth: 620 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <strong style={{ fontSize: 14 }}>{c.nombre}</strong>
                {puedeEditar && (
                  <button type="button" className="btn-secondary" style={{ marginLeft: 'auto', padding: '2px 10px', fontSize: 12 }}
                    onClick={() => { cambiar((x) => x.filter((_, j) => j !== i)); setSinCiudad((s) => [...s, ...c.numeros]); }}>
                    Quitar ciudad
                  </button>
                )}
              </div>
              {c.numeros.length === 0 && <p style={{ fontSize: 12, color: '#718096', margin: '0 0 6px' }}>Todavía no tiene números.</p>}
              {c.numeros.map((n) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '2px 0' }}>
                  <span>{numeroLegible(n)}</span>
                  <span style={{ color: '#718096', fontSize: 12 }}>{clicsPorNumero[n] ?? 0} clics</span>
                  {puedeEditar && (
                    <button type="button" className="btn-secondary" style={{ marginLeft: 'auto', padding: '1px 8px', fontSize: 12 }}
                      aria-label={`Quitar el número ${numeroLegible(n)} de ${c.nombre}`}
                      onClick={() => { cambiar((x) => x.map((y, j) => (j === i ? { ...y, numeros: y.numeros.filter((m) => m !== n) } : y))); setSinCiudad((s) => [...s, n]); }}>
                      Quitar
                    </button>
                  )}
                </div>
              ))}
              {puedeEditar && (
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <input className="filter-select" style={{ width: 210 }} placeholder="Agregar número (593…)" aria-label={`Agregar un número a ${c.nombre}`}
                    value={nuevoNumero[i] ?? ''} onChange={(e) => setNuevoNumero({ ...nuevoNumero, [i]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') agregarNumero(i); }} />
                  <button type="button" className="btn-secondary" onClick={() => agregarNumero(i)}>Agregar número</button>
                </div>
              )}
            </div>
          ))}

          {sinCiudad.length > 0 && (
            <div style={{ border: '1px dashed #d69e2e', background: '#fffaf0', borderRadius: 8, padding: '10px 12px', marginBottom: 10, maxWidth: 620 }}>
              <strong style={{ fontSize: 13 }}>Sin ciudad</strong>
              <p style={{ fontSize: 12, color: '#744210', margin: '2px 0 6px' }}>Estos números recibieron clics y no están en ninguna ciudad: en el Dashboard salen como «Sin ciudad».</p>
              {sinCiudad.map((n) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '2px 0' }}>
                  <span>{numeroLegible(n)}</span>
                  <span style={{ color: '#718096', fontSize: 12 }}>{clicsPorNumero[n] ?? 0} clics</span>
                  {puedeEditar && (
                    <select className="filter-select" style={{ marginLeft: 'auto' }} value="" aria-label={`Ciudad del número ${numeroLegible(n)}`}
                      onChange={(e) => { if (e.target.value !== '') asignar(n, Number(e.target.value)); }} disabled={ciudades.length === 0}>
                      <option value="">{ciudades.length === 0 ? 'Primero crea una ciudad' : 'Asignar a…'}</option>
                      {ciudades.map((c, j) => <option key={c.nombre} value={j}>{c.nombre}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}

          {puedeEditar && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
              <input className="filter-select" style={{ width: 210 }} maxLength={60} placeholder="Nueva ciudad (ej. Loja)" aria-label="Nombre de la nueva ciudad"
                value={nuevaCiudad} onChange={(e) => setNuevaCiudad(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') agregarCiudad(); }} />
              <button type="button" className="btn-secondary" onClick={agregarCiudad}>Agregar ciudad</button>
              <button type="button" className="auth-btn" disabled={guardando || !sucio} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar ciudades'}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
