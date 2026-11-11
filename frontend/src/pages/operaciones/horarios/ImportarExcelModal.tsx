import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import { importarHorarioExcel } from '../../../services/contratacion-publica.service';
import type { CPImportGuardia, CPImportHorarioResultado } from '../../../types/contratacion-publica';

interface Props {
  horarioId: number;
  onClose: () => void;
  onImportado: () => void;
}

const MOTIVO: Record<CPImportGuardia['estado'], string> = {
  OK: '',
  NO_ASIGNADO: 'No está asignado a este puesto (asígnalo en el contrato y vuelve a subir)',
  SIN_TURNOS: 'Sin turnos dentro de las fechas del horario',
  REPETIDO: 'Aparece dos veces en el puesto; se usó la primera fila',
};

function fechaCorta(iso: string) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export default function ImportarExcelModal({ horarioId, onClose, onImportado }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [hoja, setHoja] = useState('');
  const [previa, setPrevia] = useState<CPImportHorarioResultado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const mensaje = (err: any) => err?.response?.data?.message || 'No se pudo leer el archivo. Revisa que sea un Excel (.xlsx).';

  const leer = async (f: File, hojaElegida?: string) => {
    setCargando(true);
    setError('');
    try {
      const r = await importarHorarioExcel(horarioId, f, { hoja: hojaElegida });
      setPrevia(r);
      setHoja(r.hoja);
    } catch (err: any) {
      setPrevia(null);
      setError(mensaje(err));
    } finally {
      setCargando(false);
    }
  };

  const alElegirArchivo = (f: File | undefined) => {
    if (!f) return;
    setArchivo(f);
    setPrevia(null);
    void leer(f);
  };

  const aplicar = async () => {
    if (!archivo || !previa) return;
    setCargando(true);
    setError('');
    try {
      await importarHorarioExcel(horarioId, archivo, { hoja: previa.hoja, aplicar: true });
      onImportado();
    } catch (err: any) {
      setError(mensaje(err));
      setCargando(false);
    }
  };

  const puestosOk = previa?.puestos.filter((p) => p.puestoId !== null) ?? [];
  const puestosNo = previa?.puestos.filter((p) => p.puestoId === null) ?? [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={17} /> Importar horario desde Excel
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.85rem', color: '#4a5568', marginTop: 0 }}>
            Sube el Excel con los bloques «NOMBRES Y APELLIDOS» (un bloque por puesto). Primero verás qué se importaría; nada se guarda hasta que pulses «Importar».
            Solo se cargan los guardias que ya están asignados al puesto, y se reemplazan los turnos de esas personas dentro de este horario.
          </p>

          <input ref={inputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={(e) => { alElegirArchivo(e.target.files?.[0]); e.target.value = ''; }} />
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
            <button className="btn-secondary" disabled={cargando} onClick={() => inputRef.current?.click()}>
              <Upload size={16} /> {archivo ? 'Cambiar archivo' : 'Elegir archivo'}
            </button>
            {archivo && <span style={{ fontSize: '0.85rem' }}>{archivo.name}</span>}
            {previa && previa.hojas.length > 1 && (
              <label style={{ fontSize: '0.85rem', display: 'flex', gap: '6px', alignItems: 'center' }}>
                Hoja
                <select className="filter-select" value={hoja} disabled={cargando} onChange={(e) => archivo && leer(archivo, e.target.value)}>
                  {previa.hojas.map((h) => (
                    <option key={h.nombre} value={h.nombre}>{h.nombre} ({h.puestos} puestos)</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {error && (
            <div ref={errorRef} style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '0.85rem' }}>{error}</div>
          )}
          {cargando && !previa && <div className="loading-state">Leyendo el archivo...</div>}

          {previa && (
            <>
              <div style={{ fontSize: '0.85rem', marginBottom: '10px' }}>
                Fechas de este horario: <strong>{fechaCorta(previa.rango.inicio)}</strong> al <strong>{fechaCorta(previa.rango.fin)}</strong>.{' '}
                Se importarían <strong>{previa.totalCeldas}</strong> turnos en <strong>{puestosOk.length}</strong> puesto(s).
              </div>

              {previa.codigosDesconocidos.length > 0 && (
                <div style={{ background: '#fffaf0', border: '1px solid #fbd38d', color: '#744210', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '0.85rem' }}>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={15} /> Códigos de turno que el sistema no conoce</strong>
                  <div style={{ marginTop: '4px' }}>
                    {previa.codigosDesconocidos.map((c) => `${c.codigo} (${c.veces})`).join(' · ')}
                  </div>
                  <div style={{ marginTop: '4px' }}>Créalos en «Códigos de turno» (con su nombre y si es descanso) y vuelve a subir el archivo. Mientras tanto no se importa nada.</div>
                </div>
              )}
              {previa.avisos.filter((a) => !a.startsWith('Hay códigos')).map((a, i) => (
                <div key={i} style={{ fontSize: '0.82rem', color: '#744210', marginBottom: '6px', display: 'flex', gap: '6px' }}><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />{a}</div>
              ))}

              {puestosOk.length === 0 && puestosNo.length > 0 && (
                <details style={{ marginTop: 8, fontSize: '0.85rem' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Ver los {puestosNo.length} puestos del Excel que no coinciden</summary>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18, maxHeight: 220, overflow: 'auto', color: '#4a5568' }}>
                    {puestosNo.map((p, i) => <li key={i}>{p.titulo}</li>)}
                  </ul>
                </details>
              )}
              {puestosOk.length > 0 && (
              <div className="tasks-table-wrapper" style={{ maxHeight: '320px', overflow: 'auto', marginTop: '8px' }}>
                <table className="tasks-table">
                  <thead>
                    <tr><th>Puesto en el Excel</th><th>En el sistema</th><th>Guardia</th><th>Turnos</th><th>Observación</th></tr>
                  </thead>
                  <tbody>
                    {previa.puestos.map((p, i) =>
                      p.guardias.length === 0 ? (
                        <tr key={i}>
                          <td>{p.titulo}</td>
                          <td colSpan={4} style={{ color: '#c53030' }}>{p.puestoId === null ? 'No existe en este contrato; no se importa' : 'Sin personas'}</td>
                        </tr>
                      ) : (
                        p.guardias.map((g, j) => (
                          <tr key={`${i}-${j}`}>
                            <td>{j === 0 ? p.titulo : ''}</td>
                            <td>{j === 0 ? p.puestoNombre : ''}</td>
                            <td>{g.guardiaNombre ?? g.nombre}</td>
                            <td>{g.estado === 'OK' ? g.celdas : '—'}</td>
                            <td style={{ color: g.estado === 'OK' ? '#276749' : '#c53030', fontSize: '0.8rem' }}>
                              {g.estado === 'OK' ? 'Listo' : `Fila ${g.fila}: ${MOTIVO[g.estado]}`}
                            </td>
                          </tr>
                        ))
                      ),
                    )}
                  </tbody>
                </table>
              </div>
              )}
              {puestosNo.length > 0 && puestosOk.length === 0 && (
                <p style={{ fontSize: '0.82rem', color: '#4a5568' }}>Los nombres de los puestos del Excel tienen que parecerse a los del contrato (por ejemplo «Hospital Valdivia»).</p>
              )}
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={cargando}>Cancelar</button>
          <button className="auth-btn" onClick={aplicar} disabled={cargando || !previa?.puedeAplicar}>
            <CheckCircle2 size={16} /> {cargando && previa ? 'Importando...' : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  );
}
