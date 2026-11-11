import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import { api } from '../../../services/auth.service';
import { createEntidadPublica, getEntidadesPublicas } from '../../../services/contratacion-publica.service';
import type { CPEntidadPublica } from '../../../types/contratacion-publica';
import DateInput from '../../../components/common/DateInput';
import { proponerCiclo } from '../../../utils/cicloMensual';

type TipoTurno = '8H' | '12H' | '24H';

interface Bloque {
  indice: number;
  titulo: string;
  repetido: boolean;
  personas: { fila: number; nombre: string; cedula: string | null }[];
  conCedula: number;
  sinCedula: number;
  codigos: string[];
  tipoTurnoSugerido: TipoTurno;
}
interface Analisis {
  hojas: { nombre: string; puestos: number }[];
  hoja: string;
  bloques: Bloque[];
  periodo: { desde: string; hasta: string; diaCorte: number | null } | null;
}
interface Resultado {
  contratoId: number;
  horarioId: number;
  puestos: number;
  guardias: number;
  sinCedula: { puesto: string; nombre: string }[];
  enlazadasPorNombre: number;
  celdas: number | null;
  avisos: string[];
}

const BASE = '/contratacion-publica/importacion';

/**
 * «Importar desde Excel» junto a «Nuevo contrato»: de un Excel de horarios deja, en un solo paso, el contrato, sus
 * puestos, los guardias de cada puesto (cédula y nombre del Excel) y un horario en borrador con los turnos. El libro
 * mezcla los puestos de muchos clientes: la persona marca cuáles son de este contrato.
 */
export default function ImportarContratoModal({
  onClose,
  onCreado,
  onAbrir,
}: {
  onClose: () => void;
  /** Se avisa al crear para que quien llama recargue la lista. */
  onCreado: () => void;
  /** Ir al contrato o al horario recién creados (sin recargar la página). */
  onAbrir: (ruta: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [entidades, setEntidades] = useState<CPEntidadPublica[]>([]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [filtro, setFiltro] = useState('');
  const [marcados, setMarcados] = useState<Record<number, TipoTurno | null>>({});

  const [entidadId, setEntidadId] = useState('');
  const [numero, setNumero] = useState('');
  const [objeto, setObjeto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [tipoCompra, setTipoCompra] = useState('');
  const [administrador, setAdministrador] = useState('');
  const [diaCorte, setDiaCorte] = useState('');
  const [horarioDesde, setHorarioDesde] = useState('');
  const [horarioHasta, setHorarioHasta] = useState('');
  const [periodoLeido, setPeriodoLeido] = useState('');
  const [creandoEntidad, setCreandoEntidad] = useState(false);
  const [nuevaEntidad, setNuevaEntidad] = useState('');
  const [guardandoEntidad, setGuardandoEntidad] = useState(false);

  useEffect(() => {
    getEntidadesPublicas().then(setEntidades).catch(() => setEntidades([]));
    const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
    const p = proponerCiclo(null, null, hoy);
    setHorarioDesde(p.desde);
    setHorarioHasta(p.hasta);
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const mensaje = (err: any, general: string) => err?.response?.data?.message || general;

  const analizar = async (f: File, hoja?: string) => {
    setLeyendo(true);
    setError('');
    try {
      const form = new FormData();
      form.append('archivo', f);
      const r: Analisis = await api
        .post(`${BASE}/analizar`, form, { headers: { 'Content-Type': 'multipart/form-data' }, params: { hoja: hoja || undefined } })
        .then((x) => x.data);
      setAnalisis(r);
      // El periodo y el día de corte se leen de la hoja (mes en su nombre, días de sus columnas); se pueden corregir.
      if (r.periodo) {
        setHorarioDesde(r.periodo.desde);
        setHorarioHasta(r.periodo.hasta);
        if (r.periodo.diaCorte) setDiaCorte(String(r.periodo.diaCorte));
        setPeriodoLeido(`Leído de la hoja «${r.hoja}»: ${r.periodo.desde.split('-').reverse().join('/')} al ${r.periodo.hasta.split('-').reverse().join('/')}.`);
      } else {
        setPeriodoLeido('');
      }
      setMarcados({});
      setFiltro('');
    } catch (err: any) {
      setAnalisis(null);
      setError(mensaje(err, 'No se pudo leer el archivo. Revisa que sea un Excel (.xlsx).'));
    } finally {
      setLeyendo(false);
    }
  };

  const elegirArchivo = (f: File | undefined) => {
    if (!f) return;
    setArchivo(f);
    setAnalisis(null);
    void analizar(f);
  };

  const crearEntidad = async () => {
    const nombre = nuevaEntidad.trim();
    if (!nombre) return;
    setGuardandoEntidad(true);
    setError('');
    try {
      const e = await createEntidadPublica({ nombre });
      setEntidades((lista) => [...lista, e as unknown as CPEntidadPublica].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      setEntidadId(String(e.id));
      setNuevaEntidad('');
      setCreandoEntidad(false);
    } catch (err: any) {
      setError(mensaje(err, 'No se pudo crear la entidad. Revisa el nombre e inténtalo de nuevo.'));
    } finally {
      setGuardandoEntidad(false);
    }
  };

  const visibles = useMemo(() => {
    const t = filtro.trim().toUpperCase();
    return (analisis?.bloques ?? []).filter((b) => !t || b.titulo.toUpperCase().includes(t));
  }, [analisis, filtro]);

  const alternar = (b: Bloque) =>
    setMarcados((m) => ({ ...m, [b.indice]: m[b.indice] ? null : b.tipoTurnoSugerido }));
  const totalMarcados = Object.values(marcados).filter(Boolean).length;
  const marcarVisibles = (marcar: boolean) =>
    setMarcados((m) => {
      const n = { ...m };
      for (const b of visibles) if (!b.repetido) n[b.indice] = marcar ? n[b.indice] ?? b.tipoTurnoSugerido : null;
      return n;
    });

  const faltaAlgo =
    !archivo || !analisis || !entidadId || !numero.trim() || !objeto.trim() || !fechaInicio || !fechaFin || !horarioDesde || !horarioHasta || totalMarcados === 0;

  const crear = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (faltaAlgo || !archivo || !analisis) return;
    setCreando(true);
    setError('');
    try {
      const datos = {
        hoja: analisis.hoja,
        entidadId: Number(entidadId),
        numero: numero.trim(),
        objeto: objeto.trim(),
        referenciaProceso: referencia.trim() || undefined,
        fechaInicio,
        fechaFin,
        tipoCompra: tipoCompra.trim() || undefined,
        administradorNombre: administrador.trim() || undefined,
        diaCorte: diaCorte.trim() ? Number(diaCorte) : null,
        horarioDesde,
        horarioHasta,
        bloques: Object.entries(marcados)
          .filter(([, t]) => !!t)
          .map(([i, t]) => ({ indice: Number(i), tipoTurno: t })),
      };
      const form = new FormData();
      form.append('archivo', archivo);
      form.append('datos', JSON.stringify(datos));
      const r: Resultado = await api.post(`${BASE}/aplicar`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((x) => x.data);
      setResultado(r);
      onCreado();
    } catch (err: any) {
      setError(mensaje(err, 'No se pudo crear el contrato. Revisa los datos e inténtalo de nuevo.'));
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileSpreadsheet size={17} /> Importar contrato desde Excel</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        {resultado ? (
          <>
            <div className="modal-body">
              <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#276749', marginTop: 0 }}>
                <CheckCircle2 size={18} /> Contrato creado
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: '0.9rem' }}>
                <li><strong>{resultado.puestos}</strong> puesto(s) con <strong>{resultado.guardias}</strong> guardia(s) asignados.</li>
                {resultado.enlazadasPorNombre > 0 && <li>{resultado.enlazadasPorNombre} persona(s) sin cédula se enlazaron por nombre con RRHH.</li>}
                <li>{resultado.celdas === null ? 'Horario en borrador, vacío (los turnos no se importaron).' : <>Horario en borrador con <strong>{resultado.celdas}</strong> turnos.</>}</li>
              </ul>
              {resultado.avisos.map((a, i) => (
                <div key={i} style={{ fontSize: '0.84rem', color: '#744210', display: 'flex', gap: 6, marginBottom: 6 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {a}
                </div>
              ))}
              {resultado.sinCedula.length > 0 && (
                <details style={{ fontSize: '0.84rem', marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Personas con identificador temporal (completar su cédula)</summary>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18, maxHeight: 160, overflow: 'auto' }}>
                    {resultado.sinCedula.map((p, i) => <li key={i}>{p.nombre} — {p.puesto}</li>)}
                  </ul>
                </details>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Cerrar</button>
              <button className="btn-secondary" onClick={() => onAbrir(`/operaciones/horarios/${resultado.horarioId}`)}>Abrir el horario</button>
              <button className="auth-btn" onClick={() => onAbrir(`/operaciones/contratos/${resultado.contratoId}`)}>Abrir el contrato</button>
            </div>
          </>
        ) : (
          <form onSubmit={crear}>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: '#4a5568', marginTop: 0 }}>
                Sube el Excel de horarios, marca los puestos que son de este contrato y completa sus datos. Se crean el contrato, los puestos, los guardias
                (cédula y nombre del Excel) y un horario en borrador con los turnos. Si alguien no trae cédula basta con el nombre: si ya está en RRHH se usa su cédula y si no queda con un identificador temporal hasta que la completes.
              </p>

              <input ref={inputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={(e) => { elegirArchivo(e.target.files?.[0]); e.target.value = ''; }} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <button type="button" className="btn-secondary" disabled={leyendo || creando} onClick={() => inputRef.current?.click()}>
                  <Upload size={16} /> {archivo ? 'Cambiar archivo' : 'Elegir archivo'}
                </button>
                {archivo && <span style={{ fontSize: '0.85rem' }}>{archivo.name}</span>}
                {analisis && analisis.hojas.length > 1 && (
                  <label style={{ fontSize: '0.85rem', display: 'flex', gap: 6, alignItems: 'center' }}>
                    Hoja
                    <select value={analisis.hoja} disabled={leyendo} onChange={(e) => archivo && analizar(archivo, e.target.value)}>
                      {analisis.hojas.map((h) => <option key={h.nombre} value={h.nombre}>{h.nombre} ({h.puestos} puestos)</option>)}
                    </select>
                  </label>
                )}
              </div>
              {error && <div ref={errorRef} className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
              {leyendo && <div className="loading-state">Leyendo el archivo...</div>}

              {analisis && (
                <>
                  <h4 style={{ margin: '4px 0 6px', fontSize: '0.9rem' }}>1. Puestos de este contrato ({totalMarcados} marcados de {analisis.bloques.length})</h4>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                    <input type="text" placeholder="Buscar un puesto…" value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ flex: '1 1 220px' }} />
                    <button type="button" className="btn-secondary" onClick={() => marcarVisibles(true)}>Marcar los que se ven</button>
                    <button type="button" className="btn-secondary" onClick={() => marcarVisibles(false)}>Quitar marcas</button>
                  </div>
                  <div className="tasks-table-wrapper" style={{ maxHeight: 250, overflow: 'auto', marginBottom: 16 }}>
                    <table className="tasks-table">
                      <thead><tr><th style={{ width: 36 }}></th><th>Puesto del Excel</th><th>Personas</th><th>Códigos</th><th>Turno</th></tr></thead>
                      <tbody>
                        {visibles.map((b) => (
                          <tr key={b.indice} style={{ opacity: b.repetido ? 0.5 : 1 }}>
                            <td>
                              <input type="checkbox" aria-label={`Incluir ${b.titulo}`} disabled={b.repetido} checked={!!marcados[b.indice]} onChange={() => alternar(b)} />
                            </td>
                            <td>{b.titulo}{b.repetido && <small style={{ color: '#9c4221' }}> (repetido en la hoja)</small>}</td>
                            <td>{b.personas.length}{b.sinCedula > 0 && <small style={{ color: '#718096' }}> ({b.sinCedula} sin cédula: se asignan por nombre)</small>}</td>
                            <td style={{ fontSize: '0.78rem' }}>{b.codigos.join(', ') || '—'}</td>
                            <td>
                              <select
                                disabled={!marcados[b.indice]}
                                value={marcados[b.indice] ?? b.tipoTurnoSugerido}
                                onChange={(e) => setMarcados((m) => ({ ...m, [b.indice]: e.target.value as TipoTurno }))}
                              >
                                <option value="8H">8 horas</option>
                                <option value="12H">12 horas</option>
                                <option value="24H">24 horas</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                        {visibles.length === 0 && <tr><td colSpan={5} style={{ color: '#718096' }}>Ningún puesto coincide con la búsqueda.</td></tr>}
                      </tbody>
                    </table>
                  </div>

                  <h4 style={{ margin: '4px 0 6px', fontSize: '0.9rem' }}>2. Datos del contrato</h4>
                  <div className="form-group">
                    <label>Entidad pública *</label>
                    <select value={entidadId} onChange={(e) => setEntidadId(e.target.value)} required>
                      <option value="">-- Elegir entidad --</option>
                      {entidades.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                    {!creandoEntidad ? (
                      <button type="button" className="btn-secondary" style={{ marginTop: 6, alignSelf: 'flex-start' }} onClick={() => setCreandoEntidad(true)}>
                        + La entidad no está, crearla aquí
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <input type="text" placeholder="Nombre de la nueva entidad" value={nuevaEntidad} onChange={(e) => setNuevaEntidad(e.target.value)} style={{ flex: '1 1 240px' }} autoFocus />
                        <button type="button" className="auth-btn" disabled={guardandoEntidad || !nuevaEntidad.trim()} onClick={crearEntidad}>{guardandoEntidad ? 'Creando...' : 'Crear entidad'}</button>
                        <button type="button" className="btn-secondary" disabled={guardandoEntidad} onClick={() => { setCreandoEntidad(false); setNuevaEntidad(''); }}>Cancelar</button>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ flex: '1 1 220px' }}>
                      <label>Número de contrato / orden de compra *</label>
                      <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} required />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 220px' }}>
                      <label>Referencia del proceso</label>
                      <input type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Objeto del servicio *</label>
                    <textarea rows={2} value={objeto} onChange={(e) => setObjeto(e.target.value)} required />
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ flex: '1 1 150px' }}>
                      <label>Inicio del contrato *</label>
                      <DateInput value={fechaInicio} onChange={setFechaInicio} required />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 150px' }}>
                      <label>Fin del contrato *</label>
                      <DateInput value={fechaFin} onChange={setFechaFin} min={fechaInicio || undefined} required />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 150px' }}>
                      <label>Día de corte (opcional)</label>
                      <input type="number" min={1} max={31} value={diaCorte} onChange={(e) => setDiaCorte(e.target.value)} placeholder="Ej: 24" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ flex: '1 1 220px' }}>
                      <label>Tipo de compra (opcional)</label>
                      <input type="text" value={tipoCompra} onChange={(e) => setTipoCompra(e.target.value)} placeholder="Ej: Compra por catálogo electrónico" />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 220px' }}>
                      <label>Administrador del contrato (opcional)</label>
                      <input type="text" value={administrador} onChange={(e) => setAdministrador(e.target.value)} />
                    </div>
                  </div>

                  <h4 style={{ margin: '8px 0 6px', fontSize: '0.9rem' }}>3. Periodo que representa esta hoja</h4>
                  <p style={{ fontSize: '0.8rem', color: '#718096', margin: '0 0 8px' }}>
                    Las columnas del Excel son días (1, 2, 3…). {periodoLeido ? <strong>{periodoLeido} </strong> : 'No pude saber el mes por el nombre de la hoja: elige las fechas a las que corresponden. '}
                    Puedes corregirlas; el horario se crea en borrador y lo revisas antes de enviarlo.
                  </p>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ flex: '1 1 150px' }}>
                      <label>Desde *</label>
                      <DateInput value={horarioDesde} onChange={setHorarioDesde} required />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 150px' }}>
                      <label>Hasta *</label>
                      <DateInput value={horarioHasta} onChange={setHorarioHasta} min={horarioDesde || undefined} required />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={creando}>Cancelar</button>
              <button type="submit" className="auth-btn" disabled={faltaAlgo || creando}>{creando ? 'Creando...' : 'Crear contrato'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
