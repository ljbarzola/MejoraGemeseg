import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, Upload } from 'lucide-react';
import { usePerm } from '../../../contexts/PermissionsContext';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import {
  actualizarPlantillaInforme,
  crearPlantillaInforme,
  eliminarPlantillaInforme,
  getPlantillasInforme,
} from '../../../services/contratacion-publica.service';
import type { CPPlantillaInformeArchivo } from '../../../types/contratacion-publica';

/** Los marcadores que el sistema reconoce dentro del Word y de dónde sale cada uno. */
const MARCADORES: { marca: string; sale: string }[] = [
  { marca: '[Entidad]', sale: 'Nombre de la entidad (en mayúsculas)' },
  { marca: '[NumeroContrato]', sale: 'Número de contrato u orden de compra' },
  { marca: '[TipoCompra]', sale: 'Tipo de compra del contrato (en mayúsculas)' },
  { marca: '[Administrador]', sale: 'Administrador del contrato' },
  { marca: '[Cargo]', sale: 'Cargo del administrador (si no hay, «Administrador del contrato»)' },
  { marca: '[PeriodoDel]', sale: 'Periodo del informe: «24 de agosto al 23 de septiembre del 2026». Escribe antes «del» o «desde el»' },
  { marca: '[FechaInforme]', sale: 'El día después de terminar el periodo' },
  { marca: '[FechaInicioServicio]', sale: 'Inicio del contrato, con el día: «martes, 24 de marzo del 2026»' },
  { marca: '[DuracionContrato]', sale: 'Meses de vigencia del contrato' },
  { marca: '[DescripcionPuestos]', sale: '«02 puestos de guardia armada de 24 horas», según los puestos' },
  { marca: '[Retroalimentacion]', sale: 'Texto escrito en el informe' },
  { marca: '[Conclusiones]', sale: 'Texto escrito en el informe o, si está vacío, la sugerencia con las bitácoras' },
  { marca: '[TablaLugar]', sale: 'Tabla «Lugar del servicio» (cantón, edificio y ubicación de cada puesto)' },
  { marca: '[TablaPersonal]', sale: 'Tabla del personal asignado, tomada del horario aprobado' },
];

const MAX_PLANTILLAS = 5;

/**
 * Plantillas Word del informe mensual. Puede haber hasta 5 (por ejemplo el informe base y el del Ministerio) y cada
 * informe elige una al crearlo o editarlo; la primera se usa si no elige. La empresa cambia el diseño en Word (logo, textos
 * fijos, secciones) sin tocar el sistema; los marcadores entre corchetes son lo único que el sistema reemplaza.
 */
export default function PlantillaInformeConfig() {
  const { canWrite } = usePerm();
  const puedeEditar = canWrite('CONTRATACION_PUBLICA');
  const nuevaRef = useRef<HTMLInputElement>(null);
  const reemplazoRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [plantillas, setPlantillas] = useState<CPPlantillaInformeArchivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState('');
  const [renombrando, setRenombrando] = useState<{ id: number; nombre: string } | null>(null);
  const [reemplazandoId, setReemplazandoId] = useState<number | null>(null);
  const [eliminando, setEliminando] = useState<CPPlantillaInformeArchivo | null>(null);

  const cargar = () =>
    getPlantillasInforme()
      .then(setPlantillas)
      .catch(() => setPlantillas([]))
      .finally(() => setCargando(false));

  useEffect(() => { void cargar(); }, []);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const ejecutar = async (accion: () => Promise<unknown>, mensaje: string) => {
    setOcupado(true);
    setError('');
    setListo('');
    try {
      await accion();
      await cargar();
      setListo(mensaje);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo completar. Revisa que el archivo sea un Word (.docx).');
    } finally {
      setOcupado(false);
    }
  };

  const subirNueva = (archivo: File | undefined) => {
    if (!archivo) return;
    const nombre = archivo.name.replace(/\.docx$/i, '');
    void ejecutar(() => crearPlantillaInforme(nombre, archivo), `Plantilla «${nombre}» cargada.`);
  };

  const reemplazar = (archivo: File | undefined) => {
    const id = reemplazandoId;
    setReemplazandoId(null);
    if (!archivo || id === null) return;
    void ejecutar(() => actualizarPlantillaInforme(id, { archivo }), 'Archivo de la plantilla reemplazado: los próximos informes ya lo usan.');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <p style={{ fontSize: '0.88rem', color: '#4a5568', margin: 0, maxWidth: 760 }}>
          Los Word que se usan como base del informe mensual (hasta {MAX_PLANTILLAS}: por ejemplo el informe base y el del Ministerio). Cada informe elige cuál usar; la primera de la lista se usa si no elige.
          El sistema reemplaza los marcadores entre corchetes (por ejemplo <code>[Entidad]</code>) y deja todo lo demás tal como está: logo, textos fijos y formato.
        </p>
        {puedeEditar && (
          <>
            <input ref={nuevaRef} type="file" accept=".docx" style={{ display: 'none' }} onChange={(e) => { subirNueva(e.target.files?.[0]); e.target.value = ''; }} />
            <button className="auth-btn" disabled={ocupado || plantillas.length >= MAX_PLANTILLAS} onClick={() => nuevaRef.current?.click()} title={plantillas.length >= MAX_PLANTILLAS ? 'Ya hay 5 plantillas: elimina una para subir otra' : undefined}>
              <Upload size={16} /> {ocupado ? 'Subiendo...' : 'Subir plantilla'}
            </button>
          </>
        )}
      </div>
      <input ref={reemplazoRef} type="file" accept=".docx" style={{ display: 'none' }} onChange={(e) => { reemplazar(e.target.files?.[0]); e.target.value = ''; }} />

      {error && <div ref={errorRef} className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
      {listo && <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', color: '#276749', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.85rem' }}>{listo}</div>}

      <div className="admin-section" style={{ marginBottom: 16 }}>
        {cargando ? (
          <div className="loading-state">Cargando...</div>
        ) : plantillas.length === 0 ? (
          <div className="empty-state">Todavía no hay plantillas del informe. Sube un Word con sus marcadores para poder generar informes.</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr><th>Plantilla</th><th>Última actualización</th><th>Informes que la usan</th>{puedeEditar && <th className="col-acciones col-acciones--iconos"><span className="visually-hidden">Acciones</span></th>}</tr>
              </thead>
              <tbody>
                {plantillas.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {renombrando?.id === p.id ? (
                        <input
                          type="text"
                          autoFocus
                          maxLength={80}
                          value={renombrando.nombre}
                          onChange={(e) => setRenombrando({ id: p.id, nombre: e.target.value })}
                          onBlur={() => {
                            const nuevo = renombrando.nombre.trim();
                            setRenombrando(null);
                            if (nuevo && nuevo !== p.nombre) void ejecutar(() => actualizarPlantillaInforme(p.id, { nombre: nuevo }), 'Nombre actualizado.');
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenombrando(null); }}
                        />
                      ) : (
                        <>
                          <strong>{p.nombre}</strong>
                          {p.porDefecto && <span className="status-badge" style={{ marginLeft: 8, background: '#ebf8ff', color: '#2b6cb0' }}>Por defecto</span>}
                        </>
                      )}
                    </td>
                    <td>{new Date(p.updatedAt).toLocaleString('es-EC')}</td>
                    <td>{p.informes || '—'}</td>
                    {puedeEditar && (
                      <td>
                        <div className="acciones-iconos">
                          <button type="button" className="btn-secondary icon-btn" title="Cambiar el nombre" aria-label="Cambiar el nombre" onClick={() => setRenombrando({ id: p.id, nombre: p.nombre })}><Pencil size={16} /></button>
                          <button type="button" className="btn-secondary icon-btn" title="Reemplazar el archivo Word" aria-label="Reemplazar el archivo Word" disabled={ocupado} onClick={() => { setReemplazandoId(p.id); reemplazoRef.current?.click(); }}><Upload size={16} /></button>
                          <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Eliminar" aria-label="Eliminar" onClick={() => setEliminando(p)}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="admin-section">
        <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Marcadores que reconoce</h3>
        <div className="tasks-table-wrapper">
          <table className="tasks-table">
            <thead><tr><th>Escribe en el Word</th><th>El sistema pone</th></tr></thead>
            <tbody>
              {MARCADORES.map((m) => (
                <tr key={m.marca}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{m.marca}</td>
                  <td>{m.sale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#718096', marginBottom: 0 }}>
          Cada marcador tiene que quedar escrito de corrido (si Word lo parte con otro formato a mitad de palabra, no se reconoce). Las tablas se escriben en su propio párrafo.
          Una sección que solo lleve una de las plantillas (por ejemplo armamento) se escribe a mano en ese Word: el sistema no la rellena.
        </p>
      </div>

      {eliminando && (
        <ConfirmDialog
          title="Eliminar plantilla"
          message={`¿Eliminar la plantilla «${eliminando.nombre}»?${eliminando.informes ? ` ${eliminando.informes} informe(s) la tenían elegida y pasarán a usar la plantilla por defecto.` : ''} Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={() => { const p = eliminando; setEliminando(null); void ejecutar(() => eliminarPlantillaInforme(p.id), 'Plantilla eliminada.'); }}
          onCancel={() => setEliminando(null)}
        />
      )}
    </div>
  );
}
