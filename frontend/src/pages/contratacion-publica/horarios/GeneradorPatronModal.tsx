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
        fechaFin,
      })
        .then((res) => setPreviewResult(res))
        .catch((err) => {
          setPreviewResult(null);
          setPreviewError(err.response?.data?.message || 'No se pudo calcular el patrón.');
        })
        .finally(() => setLoadingPreview(false));
    }, 400);
    return () => clearTimeout(handle);
  }, [tramos, coberturaSimultanea, ordenGuardias, fechaInicioCiclo, loadingInicial, puestoId, fechaInicio, fechaFin]);

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
    (previewResult?.celdas || []).forEach((c) => map.set(`${c.cedula}|${c.fecha}`, c.codigoTurno));
    return map;
  }, [previewResult]);

  const fechasPreview = useMemo(() => {
    const set = new Set<string>();
    (previewResult?.celdas || []).forEach((c) => set.add(c.fecha));
    return Array.from(set).sort().slice(0, 12); // solo un adelanto, no el rango completo
  }, [previewResult]);

  const ejecutarGeneracion = async () => {
    setGenerando(true);
    try {
      await generarPatronHorario(horarioId, {
        puestoId,
        patron: { tramos, coberturaSimultanea, ordenGuardias, fechaInicioCiclo },
        guardarComoPatronDelPuesto: true,
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

  return (
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
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Tramos del ciclo</label>
                <div style={{ fontSize: '0.76rem', color: '#718096', marginBottom: '6px' }}>
                  Ej. 2 días código D, 2 días código N, 2 días código L — se repite todo el período.
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
                    <button type="button" className="icon-btn" onClick={() => moveTramo(i, -1)} disabled={i === 0}><ChevronUp size={14} /></button>
                    <button type="button" className="icon-btn" onClick={() => moveTramo(i, 1)} disabled={i === tramos.length - 1}><ChevronDown size={14} /></button>
                    <button type="button" className="icon-btn" onClick={() => removeTramo(i)} disabled={tramos.length === 1}><Trash2 size={14} /></button>
                  </div>
                ))}
                <button type="button" className="btn-secondary" onClick={addTramo} style={{ fontSize: '0.78rem' }}>
                  <Plus size={13} /> Agregar tramo
                </button>
              </div>

              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Cobertura simultánea</label>
                  <input
                    type="number"
                    min={1}
                    value={coberturaSimultanea}
                    onChange={(e) => setCoberturaSimultanea(Math.max(1, Number(e.target.value)))}
                    style={{ width: '90px' }}
                    title="Cuántos guardias trabajan a la vez en cada tramo"
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Fecha de inicio del ciclo</label>
                  <input type="date" value={fechaInicioCiclo} onChange={(e) => setFechaInicioCiclo(e.target.value)} />
                </div>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#a0aec0', marginTop: '-10px', marginBottom: '14px' }}>
                Si este puesto ya tenía un ciclo corriendo el período pasado, deja la fecha original para que continúe sin cortes.
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Orden de guardias (define el desfase)</label>
                {ordenGuardias.map((g, i) => (
                  <div key={g.cedula} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ flex: 1, fontSize: '0.8rem' }}>{g.nombreGuardia} <span style={{ color: '#a0aec0' }}>({g.cedula})</span></div>
                    <button type="button" className="icon-btn" onClick={() => moveGuardia(i, -1)} disabled={i === 0}><ChevronUp size={14} /></button>
                    <button type="button" className="icon-btn" onClick={() => moveGuardia(i, 1)} disabled={i === ordenGuardias.length - 1}><ChevronDown size={14} /></button>
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
                    <div style={{ fontSize: '0.7rem', color: '#a0aec0', marginTop: '4px' }}>Vista previa limitada a los primeros 12 días — el patrón se aplica a todo el período.</div>
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

      {confirmandoSobrescritura && (
        <ConfirmDialog
          title="Sobrescribir días ya cargados"
          message={`Esto reemplazará los ${celdasExistentesCount} día(s) ya cargados para "${puestoNombre}" en este período. ¿Continuar?`}
          confirmLabel="Sobrescribir"
          danger
          onConfirm={ejecutarGeneracion}
          onCancel={() => setConfirmandoSobrescritura(false)}
        />
      )}
    </div>
  );
}
