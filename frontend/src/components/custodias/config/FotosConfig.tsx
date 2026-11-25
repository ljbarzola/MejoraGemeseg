import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { updateConfigCustodias } from '../../../services/custodia.service';
import {
  MAX_FOTOS_PEDIDAS, MAX_NOMBRE_FOTO_PEDIDA,
  type ConfigCustodias, type FotoPedidaConfig, type FotosPedidasConfig, type MomentoFotosPedidas, type TipoServicioFotos,
} from '../../../types/custodiaGuia';
import ErrorBanner from '../../common/ErrorBanner';
import { mensajeDeError } from '../ClienteSelect';

const TIPOS: { key: TipoServicioFotos; label: string }[] = [
  { key: 'PUERTO', label: 'Puerto' },
  { key: 'HACIENDA', label: 'Hacienda' },
  { key: 'VIP', label: 'VIP' },
];

const MOMENTOS: { key: MomentoFotosPedidas; titulo: string; ayuda: string }[] = [
  { key: 'SALIDA', titulo: 'Al salir', ayuda: 'Las fotos que el custodio toma antes de marcar «Salimos».' },
  { key: 'LLEGADA', titulo: 'Al llegar', ayuda: 'Las fotos que el custodio toma antes de marcar «Llegamos».' },
];

/** Una fila en pantalla: lleva una clave propia para que borrar una no mueva el cuadro de escritura de las otras. */
type Fila = FotoPedidaConfig & { k: number };
type Estado = Record<TipoServicioFotos, Record<MomentoFotosPedidas, Fila[]>>;

let contador = 0;
const aFilas = (lista: FotoPedidaConfig[] | undefined): Fila[] => (lista ?? []).map((f) => ({ ...f, k: ++contador }));

function aEstado(c: FotosPedidasConfig | undefined): Estado {
  const e = {} as Estado;
  for (const t of TIPOS) e[t.key] = { SALIDA: aFilas(c?.[t.key]?.SALIDA), LLEGADA: aFilas(c?.[t.key]?.LLEGADA) };
  return e;
}

/** Lo que se guarda y se compara: sin las claves de pantalla ni espacios de más. */
function limpio(e: Estado): FotosPedidasConfig {
  const r = {} as FotosPedidasConfig;
  for (const t of TIPOS) {
    r[t.key] = {
      SALIDA: e[t.key].SALIDA.map(({ nombre, obligatoria, varias }) => ({ nombre: nombre.trim(), obligatoria, varias })),
      LLEGADA: e[t.key].LLEGADA.map(({ nombre, obligatoria, varias }) => ({ nombre: nombre.trim(), obligatoria, varias })),
    };
  }
  return r;
}

/** Devuelve el primer problema que encuentre (con el lugar donde está), o '' si todo está bien. */
function revisar(c: FotosPedidasConfig): string {
  for (const t of TIPOS) {
    for (const m of MOMENTOS) {
      const lista = c[t.key][m.key];
      const donde = `${t.label}, ${m.titulo.toLowerCase()}`;
      const vistos = new Set<string>();
      for (const f of lista) {
        if (!f.nombre) return `Escribe el nombre de cada foto (${donde}).`;
        if (vistos.has(f.nombre.toLowerCase())) return `«${f.nombre}» está repetida (${donde}).`;
        vistos.add(f.nombre.toLowerCase());
      }
    }
  }
  return '';
}

/**
 * Pestaña «Fotos» de la Configuración de Custodias: qué fotos pide el celular al custodio al salir y al llegar,
 * por tipo de servicio. Cada una dice si es obligatoria (si falta, el custodio debe escribir por qué) y si admite
 * varias fotos. Quien no puede escribir en Operaciones lo ve en solo lectura.
 */
export default function FotosConfig({
  config, soloLectura, onConfig, ayuda,
}: {
  /** Botón «?» de la página: va arriba a la derecha, junto al título. */
  ayuda?: ReactNode;
  config: ConfigCustodias;
  soloLectura: boolean;
  onConfig: (c: ConfigCustodias) => void;
}) {
  const [estado, setEstado] = useState<Estado>(() => aEstado(config.fotosPedidas));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setEstado(aEstado(config.fotosPedidas)); }, [config.fotosPedidas]);
  // Si el aviso de error queda arriba y la persona ya bajó hasta «Guardar», que lo vea.
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [error]);

  const cambio = JSON.stringify(limpio(estado)) !== JSON.stringify(config.fotosPedidas ? limpio(aEstado(config.fotosPedidas)) : limpio(aEstado(undefined)));

  const poner = (t: TipoServicioFotos, m: MomentoFotosPedidas, f: (l: Fila[]) => Fila[]) => {
    setAviso('');
    setEstado((e) => ({ ...e, [t]: { ...e[t], [m]: f(e[t][m]) } }));
  };
  const cambiarFila = (t: TipoServicioFotos, m: MomentoFotosPedidas, k: number, parte: Partial<FotoPedidaConfig>) =>
    poner(t, m, (l) => l.map((x) => (x.k === k ? { ...x, ...parte } : x)));

  async function guardar() {
    setError('');
    setAviso('');
    const datos = limpio(estado);
    const problema = revisar(datos);
    if (problema) { setError(problema); return; }
    setGuardando(true);
    try {
      onConfig(await updateConfigCustodias({ fotosPedidas: datos }));
      setAviso('Cambios guardados.');
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudieron guardar los cambios. Inténtalo de nuevo.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="admin-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Fotos que se piden al custodio</h3>
        {ayuda}
      </div>
      <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#718096' }}>
        Para cada tipo de servicio, las fotos que el celular pide al salir y al llegar. Si una es obligatoria y falta, el custodio tiene que escribir por qué antes de continuar.
        El custodio siempre puede agregar fotos sueltas durante el recorrido.
      </p>
      <div ref={errorRef}><ErrorBanner mensaje={error} /></div>

      {TIPOS.map((t) => (
        <div key={t.key} className="fotos-tarjeta">
          <h4 className="fotos-tarjeta-titulo">{t.label}</h4>
          <div className="fotos-cols">
            {MOMENTOS.map((m) => {
              const lista = estado[t.key][m.key];
              const lleno = lista.length >= MAX_FOTOS_PEDIDAS;
              return (
                <div key={m.key} className="fotos-col">
                  <div>
                    <div className="fotos-col-titulo">{m.titulo}</div>
                    <div className="fotos-col-ayuda">{m.ayuda}</div>
                  </div>
                  {lista.length === 0 && <div className="fotos-vacio">No se pide ninguna foto.</div>}
                  {lista.map((f) => (
                    <div key={f.k} className="fotos-fila">
                      <input
                        type="text" value={f.nombre} disabled={soloLectura} maxLength={MAX_NOMBRE_FOTO_PEDIDA} placeholder="Ej: Carga"
                        aria-label={`Nombre de la foto (${t.label}, ${m.titulo.toLowerCase()})`}
                        onChange={(e) => cambiarFila(t.key, m.key, f.k, { nombre: e.target.value })}
                      />
                      <label className="fotos-opcion">
                        <span className="cfg-switch">
                          <input type="checkbox" role="switch" checked={f.obligatoria} disabled={soloLectura} onChange={(e) => cambiarFila(t.key, m.key, f.k, { obligatoria: e.target.checked })} />
                          <span aria-hidden />
                        </span>
                        Obligatoria
                      </label>
                      <label className="fotos-opcion">
                        <span className="cfg-switch">
                          <input type="checkbox" role="switch" checked={f.varias} disabled={soloLectura} onChange={(e) => cambiarFila(t.key, m.key, f.k, { varias: e.target.checked })} />
                          <span aria-hidden />
                        </span>
                        Varias fotos
                      </label>
                      {!soloLectura && (
                        <button
                          type="button" className="btn-secondary icon-btn" title="Quitar esta foto" aria-label={`Quitar la foto ${f.nombre || 'sin nombre'}`}
                          onClick={() => poner(t.key, m.key, (l) => l.filter((x) => x.k !== f.k))}
                        >
                          <Trash2 size={15} color="#c53030" />
                        </button>
                      )}
                    </div>
                  ))}
                  {!soloLectura && (
                    <div className="fotos-agregar">
                      <button
                        type="button" className="btn-secondary" disabled={lleno}
                        onClick={() => poner(t.key, m.key, (l) => [...l, { k: ++contador, nombre: '', obligatoria: true, varias: false }])}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: '0.82rem' }}
                      >
                        <Plus size={14} /> Agregar foto
                      </button>
                      {lleno && <span className="fotos-col-ayuda">Máximo {MAX_FOTOS_PEDIDAS} fotos.</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!soloLectura && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button type="button" className="auth-btn" disabled={!cambio || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          {aviso && !cambio && <span style={{ fontSize: '0.82rem', color: '#276749' }}>{aviso}</span>}
        </div>
      )}
    </div>
  );
}
