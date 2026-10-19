import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, FileUp, Loader2, X } from 'lucide-react';
import { getOpcionesBitacora, subirBitacora } from '../../../services/bitacoras.service';
import type { OpcionPuestoBitacora } from '../../../types/bitacoras';
import { ARCHIVOS_BITACORA } from '../../../utils/bitacoras';
import { mensajeError } from '../../../utils/entregasCp';

const MAX_MB = 15;

/**
 * Subir la foto de una bitácora. Se elige primero el puesto (de ahí sale el
 * horario contra el que se compara) y después la foto: desde el celular se abre
 * la cámara. El agente tarda unos segundos en leerla; la respuesta llega ya
 * leída y comparada, y se abre la bitácora.
 */
export default function SubirBitacoraModal({
  puestoInicial,
  onClose,
  onSubida,
}: {
  puestoInicial?: number;
  onClose: () => void;
  /** Recibe el id de la bitácora creada. */
  onSubida: (id: number) => void;
}) {
  const [opciones, setOpciones] = useState<OpcionPuestoBitacora[] | null>(null);
  const [puestoId, setPuestoId] = useState<string>(puestoInicial ? String(puestoInicial) : '');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const camaraRef = useRef<HTMLInputElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getOpcionesBitacora()
      .then(setOpciones)
      .catch((err) => {
        setOpciones([]);
        setError(mensajeError(err, 'No se pudieron cargar los puestos.'));
      });
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [error]);

  // Miniatura de la foto elegida (un PDF no tiene).
  useEffect(() => {
    if (!archivo || !archivo.type.startsWith('image/') || /heic|heif/.test(archivo.type)) {
      setVista(null);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  const puestoElegido = useMemo(
    () => opciones?.flatMap((o) => o.puestos.map((p) => ({ ...p, o }))).find((p) => String(p.id) === puestoId),
    [opciones, puestoId],
  );

  const elegir = (f: File | undefined) => {
    if (!f) return;
    setError('');
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo pesa ${(f.size / 1024 / 1024).toFixed(1)} MB y el máximo es ${MAX_MB} MB.`);
      return;
    }
    setArchivo(f);
  };

  const enviar = async (conFoto: boolean) => {
    if (!puestoId) {
      setError('Elige el puesto al que pertenece la bitácora.');
      return;
    }
    if (conFoto && !archivo) {
      setError('Toma o elige la foto de la bitácora.');
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const b = await subirBitacora(Number(puestoId), conFoto ? archivo : null);
      onSubida(b.id);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo subir la bitácora. Vuelve a intentarlo.'));
      setEnviando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={enviando ? undefined : onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Subir bitácora</h3>
          <button className="modal-close" onClick={onClose} disabled={enviando} aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div ref={errorRef}>{error && <div className="form-error">{error}</div>}</div>

          {opciones !== null && opciones.length === 0 && !error && (
            <div className="form-error" style={{ background: '#fffaf0', borderColor: '#fbd38d', color: '#7b341e' }}>
              No hay puestos de servicio para elegir. Crea un contrato con sus puestos en Contratos (Contratación Pública).
            </div>
          )}

          <div className="form-group">
            <label>Puesto de la bitácora *</label>
            <select value={puestoId} onChange={(e) => setPuestoId(e.target.value)} disabled={enviando || opciones === null}>
              <option value="">{opciones === null ? 'Cargando puestos…' : 'Elige el puesto'}</option>
              {opciones?.map((o) => (
                <optgroup key={o.contratoId} label={`${o.entidadNombre} — contrato ${o.numero}`}>
                  {o.puestos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <small style={{ color: '#718096' }}>
              De aquí sale el horario contra el que se compara la hoja: elige el puesto de esta bitácora, no el de otra.
            </small>
          </div>

          <div className="form-group">
            <label>Foto de la hoja *</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" disabled={enviando} onClick={() => camaraRef.current?.click()}>
                <Camera size={16} /> Tomar foto
              </button>
              <button type="button" className="btn-secondary" disabled={enviando} onClick={() => archivoRef.current?.click()}>
                <FileUp size={16} /> Elegir archivo
              </button>
            </div>
            <input ref={camaraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ''; }} />
            <input ref={archivoRef} type="file" accept={ARCHIVOS_BITACORA} hidden onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ''; }} />
            <small style={{ color: '#718096' }}>
              Foto (JPG, PNG, WebP o HEIC) o PDF, de hasta {MAX_MB} MB. Que se vea la hoja completa, derecha y con buena luz.
            </small>
            {archivo && (
              <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center', border: '1px solid var(--borde-input)', borderRadius: 10, padding: 10 }}>
                {vista && <img src={vista} alt="Vista previa de la bitácora" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }} />}
                <div style={{ minWidth: 0 }}>
                  <div className="truncate" style={{ fontWeight: 700 }} title={archivo.name}>{archivo.name}</div>
                  <div style={{ fontSize: '0.78rem', color: '#718096' }}>{(archivo.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
              </div>
            )}
          </div>

          {enviando && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 10, padding: '10px 14px', fontSize: '0.88rem', color: '#2a4365' }}>
              <Loader2 size={18} className="spin" />
              <span>
                {archivo ? 'El agente está leyendo la hoja y comparándola con el horario' : 'Creando la bitácora'}
                {puestoElegido ? ` de «${puestoElegido.nombre}»` : ''}. Puede tardar hasta medio minuto; no cierres esta ventana.
              </span>
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '0 24px 20px' }}>
          <button type="button" className="btn-secondary" disabled={enviando} onClick={() => void enviar(false)} title="Crea la bitácora sin foto y tú escribes lo que dice la hoja">
            Cargar sin foto
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn-secondary" disabled={enviando} onClick={onClose}>Cancelar</button>
            <button type="button" className="auth-btn" disabled={enviando || !puestoId || !archivo} onClick={() => void enviar(true)}>
              {enviando ? 'Leyendo…' : 'Subir y leer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
