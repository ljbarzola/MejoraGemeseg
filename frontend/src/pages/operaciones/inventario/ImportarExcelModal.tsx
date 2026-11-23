import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, X } from 'lucide-react';
import { importarExcelInventario } from '../../../services/inventario.service';
import type { ResultadoImportacion } from '../../../types/inventario';
import { mensajeError } from './inventarioUi';

/**
 * TEMPORAL (2026-11-19): carga el Excel de inventario de Operaciones. Primero muestra qué se cargaría
 * y recién al confirmar escribe. Solo entra lo que está escrito en el Excel; lo dudoso queda marcado
 * «Por corregir» en Armas. Se retira cuando todo se registre directamente en la aplicación.
 */
export default function ImportarExcelModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const elegir = async (f: File | null) => {
    setArchivo(f);
    setResultado(null);
    setError('');
    if (!f) return;
    setCargando(true);
    try {
      setResultado(await importarExcelInventario(f, false));
    } catch (err) {
      setError(mensajeError(err, 'No se pudo leer el archivo. Revisa que sea el Excel del inventario.'));
    } finally {
      setCargando(false);
    }
  };

  const cargar = async () => {
    if (!archivo) return;
    setCargando(true);
    setError('');
    try {
      setResultado(await importarExcelInventario(archivo, true));
      onDone();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo cargar el inventario. No se guardó nada.'));
    } finally {
      setCargando(false);
    }
  };

  const r = resultado;
  const hecho = !!r?.confirmado;
  const accesoriosNuevos = r ? r.accesorios.aCargar.filter((a) => !a.yaCargado) : [];
  const chalecosNuevos = r && !r.chalecos.yaCargados ? r.chalecos.filasACargar : 0;
  const hayAlgo = !!r && (r.armas.nuevas > 0 || chalecosNuevos > 0 || accesoriosNuevos.length > 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Importar desde Excel</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="modal-body">
          {error && <div ref={errorRef} className="form-error">{error}</div>}

          {!hecho && (
            <>
              <p style={{ margin: '0 0 12px', color: '#4a5568', fontSize: '0.9rem' }}>
                Elige el Excel de inventario de Operaciones (<strong>INVENTARIO ARMA GEMESEG.xlsx</strong>). Primero verás qué se cargaría; no se guarda nada hasta que lo confirmes.
                Solo entra lo que está escrito en el Excel: lo que falta queda vacío y lo dudoso queda marcado para corregir.
              </p>
              <label className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <FileSpreadsheet size={16} /> {archivo ? 'Elegir otro archivo' : 'Elegir archivo'}
                <input
                  type="file"
                  accept=".xlsx"
                  style={{ display: 'none' }}
                  onChange={(e) => { void elegir(e.target.files?.[0] ?? null); e.target.value = ''; }}
                />
              </label>
              {archivo && <span style={{ marginLeft: 12, fontSize: '0.85rem', color: '#718096' }}>{archivo.name}</span>}
            </>
          )}

          {cargando && <div className="loading-state" style={{ marginTop: 16 }}>{hecho ? 'Cargando…' : 'Leyendo el archivo…'}</div>}

          {r && !cargando && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {hecho && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#276749', fontWeight: 600 }}>
                  <CheckCircle2 size={18} /> Listo: el inventario quedó cargado.
                </div>
              )}

              <section>
                <h4 style={{ margin: '0 0 6px', color: 'var(--azul-oscuro)' }}>Armas</h4>
                <div style={{ fontSize: '0.9rem' }}>
                  {hecho ? 'Se cargaron' : 'Se cargarían'} <strong>{r.armas.nuevas}</strong> armas nuevas
                  {r.armas.yaRegistradas > 0 && <> · {r.armas.yaRegistradas} ya estaban registradas (se dejan como están)</>}.
                </div>
                {r.armas.paraCorregir.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: '0.85rem', color: '#c05621', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <AlertTriangle size={14} /> {r.armas.paraCorregir.length} quedan marcadas «Por corregir» (lectura del Excel):
                    </div>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.82rem', color: '#4a5568' }}>
                      {r.armas.paraCorregir.map((a) => (
                        <li key={a.serie}><strong style={{ fontFamily: 'monospace' }}>{a.serie}</strong>{a.puesto ? ` · ${a.puesto}` : ''} — {a.nota.replace(/^CORREGIR \(leído del Excel\):\s*/, '')}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section>
                <h4 style={{ margin: '0 0 6px', color: 'var(--azul-oscuro)' }}>Chalecos</h4>
                {r.chalecos.yaCargados ? (
                  <div style={{ fontSize: '0.9rem', color: '#718096' }}>«{r.chalecos.articulo}» ya tiene movimientos: no se vuelve a cargar.</div>
                ) : (
                  <div style={{ fontSize: '0.9rem' }}>
                    {hecho ? 'Se cargaron' : 'Se cargarían'} <strong>{r.chalecos.unidades}</strong> «{r.chalecos.articulo}» en {r.chalecos.filasACargar} filas:
                    {' '}{r.chalecos.enBodega} en el rastrillo y {r.chalecos.enPuestos} en sus puestos.
                    {r.chalecos.filasEnCero > 0 && <> {r.chalecos.filasEnCero} filas sin cantidad en el Excel quedan en 0.</>}
                  </div>
                )}
              </section>

              <section>
                <h4 style={{ margin: '0 0 6px', color: 'var(--azul-oscuro)' }}>Accesorios</h4>
                {r.accesorios.aCargar.length === 0 ? (
                  <div style={{ fontSize: '0.9rem', color: '#718096' }}>Ninguno tiene cantidad escrita.</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem' }}>
                    {r.accesorios.aCargar.map((a) => (
                      <li key={`${a.nombre}|${a.variante}`} style={a.yaCargado ? { color: '#718096' } : undefined}>
                        {a.nombre}{a.variante ? ` (${a.variante})` : ''}: <strong>{a.cantidad}</strong>{a.yaCargado ? ' · ya cargado, se deja como está' : ''}
                      </li>
                    ))}
                  </ul>
                )}
                {r.accesorios.sinCantidad > 0 && (
                  <div style={{ fontSize: '0.82rem', color: '#718096', marginTop: 4 }}>
                    {r.accesorios.sinCantidad} renglones del Excel no tienen cantidad y no se cargan.
                  </div>
                )}
              </section>

              {(r.puestos.enlazados.length > 0 || r.puestos.sinEnlazar.length > 0) && (
                <section>
                  <h4 style={{ margin: '0 0 6px', color: 'var(--azul-oscuro)' }}>Puestos</h4>
                  <div style={{ fontSize: '0.9rem' }}>
                    {r.puestos.enlazados.length > 0
                      ? <><strong>{r.puestos.enlazados.length}</strong> puestos del Excel ya existen en la aplicación y {hecho ? 'quedaron enlazados' : 'quedarían enlazados'}: sus armas y su equipo se ven desde el contrato.</>
                      : 'Ningún puesto del Excel existe todavía en la aplicación.'}
                  </div>
                  {r.puestos.sinEnlazar.length > 0 && (
                    <div style={{ fontSize: '0.82rem', color: '#718096', marginTop: 4 }}>
                      {r.puestos.sinEnlazar.length} no existen con ese nombre exacto y se guardan solo por nombre. Si más tarde se crean con ese mismo nombre, el contrato los encuentra igual.
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ cursor: 'pointer' }}>Ver cuáles</summary>
                        <div style={{ marginTop: 4 }}>{r.puestos.sinEnlazar.join(', ')}</div>
                      </details>
                    </div>
                  )}
                </section>
              )}

              {r.avisos.map((a) => (
                <div key={a} style={{ fontSize: '0.82rem', color: '#718096', borderLeft: '3px solid #e2e8f0', paddingLeft: 10 }}>{a}</div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>{hecho ? 'Cerrar' : 'Cancelar'}</button>
          {!hecho && (
            <button type="button" className="auth-btn" disabled={!r || cargando || !hayAlgo} onClick={cargar}>
              {r && !hayAlgo ? 'No hay nada nuevo que cargar' : 'Cargar al inventario'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
