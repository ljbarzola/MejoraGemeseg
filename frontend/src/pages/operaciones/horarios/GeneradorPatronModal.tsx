import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, Wand2, X } from 'lucide-react';
import {
  getPatronRotacion,
  generarPatronHorario,
  previewPatronRotacion,
} from '../../../services/contratacion-publica.service';
import type {
  CPCodigoTurno,
  GuardiaOrdenPatron,
  TramoPatron,
} from '../../../types/contratacion-publica';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import DateInput from '../../../components/common/DateInput';

interface Props {
  puestoId: number;
  puestoNombre: string;
  horarioId: number;
  fechaInicio: string; // rango del horario, 'YYYY-MM-DD'
  fechaFin: string;
  guardiasDelPuesto: { cedula: string; nombreGuardia: string }[];
  codigosTurno: CPCodigoTurno[];
  celdasExistentesCount: number;
  onClose: () => void;
  onGenerated: () => void;
}

function formatFechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

export default function GeneradorPatronModal({
  puestoId,
  puestoNombre,
  horarioId,
  fechaInicio,
  fechaFin,
  guardiasDelPuesto,
  codigosTurno,
  celdasExistentesCount,
  onClose,
  onGenerated,
}: Props) {
  const [tramos, setTramos] = useState<TramoPatron[]>([{ codigoTurno: '', dias: 1 }]);
  const [coberturaSimultanea, setCoberturaSimultanea] = useState(1);
  const [ordenGuardias, setOrdenGuardias] = useState<GuardiaOrdenPatron[]>(guardiasDelPuesto);
  const [fechaInicioCiclo, setFechaInicioCiclo] = useState(fechaInicio);
  // «Llenar hasta» (por defecto el último día del horario) y «El último día termina con»: hasta qué turno se
  // trabaja ese último día (p. ej. hasta el de Día, y esa noche ya no le toca a nadie). '' = todos los turnos.
  const [hasta, setHasta] = useState(fechaFin);
  const [ultimoTurno, setUltimoTurno] = useState('');
  const [loadingInicial, setLoadingInicial] = useState(true);

  const [previewResult, setPreviewResult] = useState<{
    celdas: { cedula: string; fecha: string; codigoTurno: string }[];
    cicloLongitud: number;
    numGrupos: number;
    desfaseDias: number;
  } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [confirmandoSobrescritura, setConfirmandoSobrescritura] = useState(false);

  const codigosActivos = codigosTurno.filter((c) => c.activo);
  const codigoPorCodigo = useMemo(() => {
    const map = new Map<string, CPCodigoTurno>();
    codigosTurno.forEach((c) => map.set(c.codigo, c));
    return map;
  }, [codigosTurno]);

  useEffect(() => {
    getPatronRotacion(puestoId)
      .then((patron) => {
        if (patron) {
          setTramos(patron.tramos.length > 0 ? patron.tramos : [{ codigoTurno: '', dias: 1 }]);
          setCoberturaSimultanea(patron.coberturaSimultanea);
          setFechaInicioCiclo(patron.fechaInicioCiclo.slice(0, 10));
          const guardadoPorCedula = new Map(patron.ordenGuardias.map((g) => [g.cedula, g]));
          const actuales = guardiasDelPuesto.map((g) => g.cedula);
          const enOrdenGuardado = patron.ordenGuardias
            .filter((g) => actuales.includes(g.cedula))
            .map((g) => guardadoPorCedula.get(g.cedula)!);
          const nuevos = guardiasDelPuesto.filter(
            (g) => !patron.ordenGuardias.some((og) => og.cedula === g.cedula),
          );
          setOrdenGuardias([...enOrdenGuardado, ...nuevos]);
        } else {
          setOrdenGuardias(guardiasDelPuesto);
        }
      })
      .finally(() => setLoadingInicial(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puestoId]);

  // Turnos de trabajo de la secuencia (sin libres ni custodias), en el orden del día: por hora de entrada si
  // todos la tienen; si no, en el orden en que aparecen en los tramos.
  const turnosDeTrabajo = useMemo(() => {
    const lista: string[] = [];
    tramos.forEach((t) => {
      const c = codigoPorCodigo.get(t.codigoTurno);
      if (c && !c.esDescanso && !c.esCustodia && !lista.includes(c.codigo)) lista.push(c.codigo);
    });
    const hora = (cod: string) => codigoPorCodigo.get(cod)?.horaInicio ?? '';
    if (lista.every((cod) => hora(cod))) lista.sort((a, b) => hora(a).localeCompare(hora(b)));
    return lista;
  }, [tramos, codigoPorCodigo]);
  const ultimoDia = hasta || fechaFin;
  const turnoFinal = turnosDeTrabajo.includes(ultimoTurno) ? ultimoTurno : '';
  // Lo que ese último día ya no se pone: los turnos que empiezan después del elegido.
  const quitarUltimoDia = useMemo(
    () => (turnoFinal ? turnosDeTrabajo.slice(turnosDeTrabajo.indexOf(turnoFinal) + 1) : []),
    [turnoFinal, turnosDeTrabajo],
  );
  const textoTurno = (cod: string) => {
    const c = codigoPorCodigo.get(cod);
    if (!c) return cod;
    const horas = c.horaInicio && c.horaFin ? ` (${c.horaInicio} a ${c.horaFin}${c.horaFin <= c.horaInicio ? ' del día siguiente' : ''})` : '';
    return `${c.codigo} — ${c.nombre}${horas}`;
  };

  useEffect(() => {
    if (loadingInicial) return;
    setPreviewError('');
    const handle = setTimeout(() => {
      setLoadingPreview(true);
      previewPatronRotacion(puestoId, {
        tramos,
        coberturaSimultanea,
        ordenGuardias,
        fechaInicioCiclo,
        fechaInicio,
        fechaFin: hasta || fechaFin,
      })
        .then((res) => setPreviewResult(res))
        .catch((err) => {
          setPreviewResult(null);
          setPreviewError(err.response?.data?.message || 'No se pudo calcular el patrón.');
        })
        .finally(() => setLoadingPreview(false));
    }, 400);
    return () => clearTimeout(handle);
  }, [tramos, coberturaSimultanea, ordenGuardias, fechaInicioCiclo, loadingInicial, puestoId, fechaInicio, fechaFin, hasta]);

  const updateTramo = (i: number, patch: Partial<TramoPatron>) =>
    setTramos((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const removeTramo = (i: number) => setTramos((prev) => prev.filter((_, idx) => idx !== i));
  const addTramo = () => setTramos((prev) => [...prev, { codigoTurno: '', dias: 1 }]);
  const moveTramo = (i: number, dir: -1 | 1) =>
    setTramos((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const moveGuardia = (i: number, dir: -1 | 1) =>
    setOrdenGuardias((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const previewCeldaPorGuardiaYFecha = useMemo(() => {
    const map = new Map<string, string>();
    (previewResult?.celdas || []).forEach((c) => {
      if (c.fecha === ultimoDia && quitarUltimoDia.includes(c.codigoTurno)) return;
      map.set(`${c.cedula}|${c.fecha}`, c.codigoTurno);
    });
    return map;
  }, [previewResult, ultimoDia, quitarUltimoDia]);

  // Cómo cierra el último día: el último turno que se trabaja y a quién le toca.
  const cierre = useMemo(() => {
    if (!previewResult) return null;
    const delDia = ordenGuardias
      .map((g) => ({ nombre: g.nombreGuardia, codigo: previewCeldaPorGuardiaYFecha.get(`${g.cedula}|${ultimoDia}`) || '' }))
      .filter((x) => turnosDeTrabajo.includes(x.codigo));
    if (delDia.length === 0) return { codigo: '', nombres: [] as string[] };
    const codigo = turnosDeTrabajo.filter((t) => delDia.some((x) => x.codigo === t)).pop()!;
    return { codigo, nombres: delDia.filter((x) => x.codigo === codigo).map((x) => x.nombre) };
  }, [previewResult, ordenGuardias, previewCeldaPorGuardiaYFecha, ultimoDia, turnosDeTrabajo]);

  const fechasPreview = useMemo(() => {
    const set = new Set<string>();
    (previewResult?.celdas || []).forEach((c) => set.add(c.fecha));
    const todas = Array.from(set).sort();
    // Un adelanto: los primeros días y los últimos, para ver cómo empieza y con qué termina cada guardia.
    return todas.length <= 12 ? todas : [...todas.slice(0, 8), ...todas.slice(-4)];
  }, [previewResult]);

  const ejecutarGeneracion = async () => {
    setGenerando(true);
    try {
      await generarPatronHorario(horarioId, {
        puestoId,
        patron: { tramos, coberturaSimultanea, ordenGuardias, fechaInicioCiclo },
        guardarComoPatronDelPuesto: true,
        hasta: hasta && hasta < fechaFin ? hasta : undefined,
        quitarUltimoDia: quitarUltimoDia.length ? quitarUltimoDia : undefined,
      });
      onGenerated();
    } catch (err: any) {
      setPreviewError(err.response?.data?.message || 'No se pudo generar el patrón.');
    } finally {
      setGenerando(false);
      setConfirmandoSobrescritura(false);
    }
  };

  const handleGenerarClick = () => {
    if (celdasExistentesCount > 0) {
      setConfirmandoSobrescritura(true);
    } else {
      ejecutarGeneracion();
    }
  };

  // El diálogo de confirmar es HERMANO del fondo de esta ventana, no hijo: si fuera hijo en el DOM, un clic en
  // su fondo oscuro burbujearía hasta el `onClick={onClose}` de abajo y cerraría también esta ventana.
  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" style={{ maxWidth: '760px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wand2 size={17} /> Generar patrón de rotación — {puestoNombre}
          </h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {loadingInicial ? (
            <div className="loading-state">Cargando...</div>
          ) : (
            <>
              <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', color: '#2a4365', borderRadius: 10, padding: '8px 14px', marginBottom: 14, fontSize: '0.8rem', lineHeight: 1.5 }}>
                <strong>Cómo funciona</strong>
                <ol style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                  <li>Arma la secuencia que se repite, por ejemplo 2 días D, 2 N y 2 L.</li>
                  <li>Ordena a los guardias: cada uno empieza la secuencia unos días después del anterior, así siempre hay alguien.</li>
                  <li>Elige hasta qué día llenar (empieza el {formatFechaCorta(fechaInicio)}) y con qué turno termina ese último día.</li>
                </ol>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>1. Secuencia que se repite</label>
                <div style={{ fontSize: '0.76rem', color: '#718096', marginBottom: '6px' }}>
                  Cada fila es un turno y cuántos días seguidos dura.
                </div>
                {tramos.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                    <select value={t.codigoTurno} onChange={(e) => updateTramo(i, { codigoTurno: e.target.value })} style={{ flex: 1 }}>
                      <option value="">-- Código --</option>
                      {codigosActivos.map((c) => (
                        <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nombre}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={t.dias}
                      onChange={(e) => updateTramo(i, { dias: Math.max(1, Number(e.target.value)) })}
                      style={{ width: '70px' }}
                      title="Días"
                    />
                    <button type="button" className="btn-secondary icon-btn" title="Subir tramo" aria-label="Subir tramo" onClick={() => moveTramo(i, -1)} disabled={i === 0}><ChevronUp size={16} /></button>
                    <button type="button" className="btn-secondary icon-btn" title="Bajar tramo" aria-label="Bajar tramo" onClick={() => moveTramo(i, 1)} disabled={i === tramos.length - 1}><ChevronDown size={16} /></button>
                    <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Quitar tramo" aria-label="Quitar tramo" onClick={() => removeTramo(i)} disabled={tramos.length === 1}><Trash2 size={16} /></button>
                  </div>
                ))}
                <button type="button" className="btn-secondary" onClick={addTramo} style={{ fontSize: '0.78rem' }}>
                  <Plus size={13} /> Agregar tramo
                </button>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>2. Fechas y cobertura</label>
                <div className="generador-campos">
                  <label>
                    <span>Guardias a la vez</span>
                    <input
                      type="number"
                      min={1}
                      value={coberturaSimultanea}
                      onChange={(e) => setCoberturaSimultanea(Math.max(1, Number(e.target.value)))}
                      title="Cuántos guardias trabajan al mismo tiempo en cada turno"
                    />
                  </label>
                  <label>
                    <span>Empieza a contar el</span>
                    <DateInput value={fechaInicioCiclo} onChange={setFechaInicioCiclo} />
                  </label>
                  <label>
                    <span>Llenar hasta</span>
                    <DateInput value={hasta} onChange={(v) => setHasta(v || fechaFin)} min={fechaInicio} max={fechaFin} />
                  </label>
                  <label>
                    <span>El último día termina con</span>
                    <select value={turnoFinal} onChange={(e) => setUltimoTurno(e.target.value)} disabled={turnosDeTrabajo.length < 2}>
                      <option value="">Todos los turnos del día</option>
                      {turnosDeTrabajo.map((cod) => (
                        <option key={cod} value={cod}>{textoTurno(cod)}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#718096', marginTop: 6, lineHeight: 1.45 }}>
                  «Empieza a contar el» es el día en que el primer guardia arranca la secuencia; si el puesto ya venía con esta rotación, deja la fecha de entonces para que siga sin cortes.
                  {quitarUltimoDia.length > 0 && (
                    <> El {formatFechaCorta(ultimoDia)} no se pone {quitarUltimoDia.map(textoTurno).join(', ')}: ese turno queda para el horario siguiente.</>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>3. Orden de los guardias</label>
                {ordenGuardias.map((g, i) => (
                  <div key={g.cedula} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ flex: 1, fontSize: '0.8rem' }}>{g.nombreGuardia} <span style={{ color: '#a0aec0' }}>({g.cedula})</span></div>
                    <button type="button" className="btn-secondary icon-btn" title="Subir" aria-label="Subir" onClick={() => moveGuardia(i, -1)} disabled={i === 0}><ChevronUp size={16} /></button>
                    <button type="button" className="btn-secondary icon-btn" title="Bajar" aria-label="Bajar" onClick={() => moveGuardia(i, 1)} disabled={i === ordenGuardias.length - 1}><ChevronDown size={16} /></button>
                  </div>
                ))}
                {ordenGuardias.length === 0 && (
                  <div className="empty-state" style={{ padding: '10px' }}>Este puesto no tiene guardias asignados.</div>
                )}
              </div>

              {previewError && (
                <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', fontSize: '0.82rem', whiteSpace: 'pre-line' }}>
                  {previewError}
                </div>
              )}

              {previewResult && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '0.78rem', color: '#4a5568', marginBottom: '8px' }}>
                    Ciclo de <strong>{previewResult.cicloLongitud}</strong> días en <strong>{previewResult.numGrupos}</strong> grupo(s) de <strong>{coberturaSimultanea}</strong> guardia(s), desfase de <strong>{previewResult.desfaseDias}</strong> días entre grupos.
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                      <thead>
                        <tr>
                          <th style={{ border: '1px solid #e2e8f0', padding: '4px 8px', background: '#f7fafc', textAlign: 'left' }}>Guardia</th>
                          {fechasPreview.map((f) => (
                            <th key={f} style={{ border: '1px solid #e2e8f0', padding: '4px 6px', background: '#f7fafc' }}>{formatFechaCorta(f)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ordenGuardias.map((g) => (
                          <tr key={g.cedula}>
                            <td style={{ border: '1px solid #e2e8f0', padding: '4px 8px', whiteSpace: 'nowrap' }}>{g.nombreGuardia}</td>
                            {fechasPreview.map((f) => {
                              const codigo = previewCeldaPorGuardiaYFecha.get(`${g.cedula}|${f}`) || '';
                              const info = codigo ? codigoPorCodigo.get(codigo) : undefined;
                              return (
                                <td key={f} style={{ border: '1px solid #e2e8f0', padding: '4px 6px', textAlign: 'center', fontWeight: 700, background: info?.color ? `${info.color}33` : undefined, color: info?.color || undefined }}>
                                  {codigo || '·'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {fechasPreview.length < (previewResult.celdas.length ? new Set(previewResult.celdas.map((c) => c.fecha)).size : 0) && (
                    <div style={{ fontSize: '0.7rem', color: '#a0aec0', marginTop: '4px' }}>Vista previa: los primeros 8 días y los últimos 4. El patrón se aplica a todos los días hasta «Llenar hasta».</div>
                  )}
                  {cierre && (
                    <div style={{ marginTop: 8, background: '#f0fff4', border: '1px solid #c6f6d5', color: '#22543d', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem' }}>
                      {cierre.codigo
                        ? <>El <strong>{formatFechaCorta(ultimoDia)}</strong> termina con el turno <strong>{textoTurno(cierre.codigo)}</strong>: le toca a <strong>{cierre.nombres.join(', ')}</strong>.</>
                        : <>El {formatFechaCorta(ultimoDia)} nadie trabaja con esta secuencia.</>}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
                <button
                  type="button"
                  className="auth-btn"
                  disabled={!previewResult || loadingPreview || generando}
                  onClick={handleGenerarClick}
                >
                  {generando ? 'Generando...' : 'Generar y aplicar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>

      {confirmandoSobrescritura && (
        <ConfirmDialog
          title="Sobrescribir días ya cargados"
          message={`Esto reemplazará los días ya cargados de "${puestoNombre}" hasta el ${formatFechaCorta(hasta || fechaFin)}. ¿Continuar?`}
          confirmLabel="Sobrescribir"
          danger
          onConfirm={ejecutarGeneracion}
          onCancel={() => setConfirmandoSobrescritura(false)}
        />
      )}
    </>
  );
}
