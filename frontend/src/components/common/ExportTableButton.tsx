import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, GripVertical, X } from 'lucide-react';
import { exportarTablaVentas, getHistorialesParaExportar, type HistorialFilaPedido } from '../../services/ventas.service';

export interface ExportableColumn {
  key: string;
  label: string;
}

type Valor = string | number | null | undefined;

/** Columna extra con lo que se hizo (etapas, notas, llamadas...); la arma el servidor al exportar. */
const CLAVE_HISTORIAL = 'historial';
const COLUMNA_HISTORIAL: ExportableColumn = { key: CLAVE_HISTORIAL, label: 'Historial (etapas, notas, llamadas)' };
type Formato = 'xlsx' | 'pdf' | 'csv';

const FORMATOS: { key: Formato; label: string; ayuda: string }[] = [
  { key: 'xlsx', label: 'Excel', ayuda: '.xlsx' },
  { key: 'pdf', label: 'PDF', ayuda: 'para imprimir' },
  { key: 'csv', label: 'CSV', ayuda: 'texto separado por comas' },
];

const hoyArchivo = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const nombreArchivo = (titulo: string, ext: string) =>
  `${titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}_${hoyArchivo()}.${ext}`;

const descargar = (blob: Blob, nombre: string) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

// BOM al inicio: sin él Excel abre el CSV con las tildes y la ñ rotas.
const aCsv = (cols: ExportableColumn[], filas: Record<string, string | number>[]) => {
  const celda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lineas = [cols.map((c) => celda(c.label)).join(',')];
  for (const f of filas) lineas.push(cols.map((c) => celda(f[c.key])).join(','));
  return '﻿' + lineas.join('\r\n');
};

/**
 * Botón "Exportar" (flechita hacia abajo) para cualquier tabla de listado.
 * ÚSALO junto a "Columnas" y "Limpiar filtros" en la barra de filtros: abre una
 * ventana donde se eligen las columnas, su orden y el formato (Excel, PDF o
 * CSV). Exporta EXACTAMENTE las filas que la tabla muestra con los filtros y el
 * orden de ese momento.
 *
 *  - `columns`: todas las columnas que se pueden exportar (incluida la
 *    principal, que en la pantalla es fija) y `defaultKeys` las que vienen
 *    marcadas, en su orden: normalmente las que la persona ya ve.
 *  - `historial` (opcional): si se pasa, aparece la columna «Historial» con los
 *    cambios de etapa, notas, llamadas, reuniones y motivos de cierre. Dice, por
 *    fila, de qué oportunidad, posible cliente o empresa/persona es.
 *  - `getValue` devuelve el valor de una celda como TEXTO PLANO (la tabla
 *    dibuja JSX, aquí solo sirve lo que se pueda escribir en un archivo).
 *
 * El Excel y el PDF los arma el servidor (`POST /ventas/exportar-tabla`); el CSV
 * se genera aquí mismo.
 */
export default function ExportTableButton<T>({
  titulo,
  columns,
  defaultKeys,
  rows,
  getValue,
  historial,
  disabled,
  disabledTitle,
}: {
  /** Nombre del listado: va en el título del archivo y del PDF («Oportunidades»). */
  titulo: string;
  columns: ExportableColumn[];
  defaultKeys: string[];
  rows: T[];
  getValue: (row: T, key: string) => Valor;
  historial?: (row: T) => Omit<HistorialFilaPedido, 'fila'>;
  disabled?: boolean;
  /** Por qué está deshabilitado (si lo está por otra razón que no haber filas). */
  disabledTitle?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const sinFilas = rows.length === 0;
  return (
    <>
      <button
        type="button"
        className="btn-secondary icon-btn"
        onClick={() => setAbierto(true)}
        disabled={disabled || sinFilas}
        title={disabled ? disabledTitle ?? 'No se puede exportar ahora' : sinFilas ? 'No hay filas para exportar' : 'Exportar lo que se ve en la tabla (Excel, PDF o CSV)'}
        aria-label="Exportar"
      >
        <ArrowDownToLine size={16} />
      </button>
      {abierto && (
        <ExportTableModal
          titulo={titulo}
          columns={columns}
          defaultKeys={defaultKeys}
          rows={rows}
          getValue={getValue}
          historial={historial}
          onClose={() => setAbierto(false)}
        />
      )}
    </>
  );
}

function ExportTableModal<T>({
  titulo,
  columns,
  defaultKeys,
  rows,
  getValue,
  historial,
  onClose,
}: {
  titulo: string;
  columns: ExportableColumn[];
  defaultKeys: string[];
  rows: T[];
  getValue: (row: T, key: string) => Valor;
  historial?: (row: T) => Omit<HistorialFilaPedido, 'fila'>;
  onClose: () => void;
}) {
  if (historial) columns = [...columns, COLUMNA_HISTORIAL];
  const [seleccion, setSeleccion] = useState<string[]>(() => defaultKeys.filter((k) => columns.some((c) => c.key === k)));
  const [formato, setFormato] = useState<Formato>('xlsx');
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState('');
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // El cuerpo de la ventana tiene scroll: si el aviso sale arriba y la persona ya
  // bajó al botón, no lo vería y creería que no pasó nada.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const porClave = new Map(columns.map((c) => [c.key, c]));
  const activas = seleccion.map((k) => porClave.get(k)).filter((c): c is ExportableColumn => !!c);
  const disponibles = columns.filter((c) => !seleccion.includes(c.key));

  const mover = (desde: number, hasta: number) => {
    if (desde === hasta || hasta < 0 || hasta >= seleccion.length) return;
    setSeleccion((prev) => {
      const next = [...prev];
      const [x] = next.splice(desde, 1);
      next.splice(hasta, 0, x);
      return next;
    });
  };

  const armarFilas = async (): Promise<Record<string, string | number>[]> => {
    // El historial no está en la tabla: se pide al servidor solo si se eligió esa columna.
    let historiales: Record<string, string> = {};
    if (historial && activas.some((c) => c.key === CLAVE_HISTORIAL)) {
      historiales = await getHistorialesParaExportar(rows.map((r, i) => ({ fila: String(i), ...historial(r) })));
    }
    return rows.map((r, i) => {
      const fila: Record<string, string | number> = {};
      for (const c of activas) fila[c.key] = c.key === CLAVE_HISTORIAL ? historiales[String(i)] ?? '' : getValue(r, c.key) ?? '';
      return fila;
    });
  };

  const exportar = async () => {
    if (activas.length === 0) { setError('Elige al menos una columna.'); return; }
    setError('');
    setExportando(true);
    try {
      const filas = await armarFilas();
      if (formato === 'csv') {
        descargar(new Blob([aCsv(activas, filas)], { type: 'text/csv;charset=utf-8' }), nombreArchivo(titulo, 'csv'));
      } else {
        const blob = await exportarTablaVentas(formato, titulo, activas, filas);
        descargar(blob, nombreArchivo(titulo, formato));
      }
      onClose();
    } catch {
      setError('No se pudo generar el archivo. Inténtalo de nuevo.');
    } finally {
      setExportando(false);
    }
  };

  const vista = rows.slice(0, 5);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ArrowDownToLine size={17} /> Exportar {titulo.toLowerCase()}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        </div>

        <div className="modal-body">
          <p style={{ margin: '0 0 14px', fontSize: '0.85rem', color: '#718096' }}>
            Se exportan las <strong>{rows.length}</strong> fila(s) que ves ahora en la tabla, con los filtros y el orden aplicados.
            Elige las columnas y arrástralas para cambiar su orden.
          </p>

          {error && <div ref={errorRef} className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
            <div>
              <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>Disponibles</p>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, minHeight: 160, maxHeight: 220, overflowY: 'auto', padding: 6 }}>
                {disponibles.length === 0 ? (
                  <p style={{ fontSize: '0.78rem', color: '#a0aec0', padding: 8 }}>Ya agregaste todas las columnas.</p>
                ) : (
                  disponibles.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setSeleccion((prev) => [...prev, c.key])}
                      className="btn-secondary"
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', marginBottom: 2, border: 'none', background: 'none', fontSize: '0.82rem' }}
                    >
                      + {c.label}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div>
              <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>
                Se exportan <span style={{ fontWeight: 400, color: '#a0aec0' }}>(arrastra para ordenar)</span>
              </p>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, minHeight: 160, maxHeight: 220, overflowY: 'auto', padding: 6 }}>
                {activas.length === 0 ? (
                  <p style={{ fontSize: '0.78rem', color: '#a0aec0', padding: 8 }}>Agrega columnas desde la izquierda.</p>
                ) : (
                  activas.map((c, i) => (
                    <div
                      key={c.key}
                      draggable
                      onDragStart={() => setArrastrando(i)}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                      onDrop={(e) => { e.preventDefault(); if (arrastrando !== null) mover(arrastrando, i); setArrastrando(null); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', marginBottom: 2, background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'grab', fontSize: '0.82rem' }}
                    >
                      <span
                        tabIndex={0}
                        role="button"
                        aria-label={`Mover ${c.label}`}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp') { e.preventDefault(); mover(i, i - 1); }
                          if (e.key === 'ArrowDown') { e.preventDefault(); mover(i, i + 1); }
                        }}
                        style={{ display: 'inline-flex' }}
                      >
                        <GripVertical size={13} color="#a0aec0" style={{ flexShrink: 0 }} />
                      </span>
                      <span style={{ flex: 1 }}>{c.label}</span>
                      <button
                        type="button"
                        onClick={() => setSeleccion((prev) => prev.filter((k) => k !== c.key))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a0aec0', padding: 0, display: 'inline-flex' }}
                        title="Quitar"
                        aria-label={`Quitar ${c.label}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>Formato</p>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {FORMATOS.map((f) => (
                <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input type="radio" name="formato-exportar" checked={formato === f.key} onChange={() => setFormato(f.key)} />
                  {f.label} <span style={{ color: '#a0aec0', fontSize: '0.75rem' }}>({f.ayuda})</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--azul-oscuro)' }}>
              Vista previa {rows.length > 5 && <span style={{ fontWeight: 400, color: '#a0aec0' }}>(primeras 5 filas de {rows.length})</span>}
            </p>
            {activas.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: '#a0aec0' }}>Elige al menos una columna para ver la vista previa.</p>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead>
                    <tr style={{ background: '#f7fafc' }}>
                      {activas.map((c) => (
                        <th key={c.key} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vista.map((r, i) => (
                      <tr key={i}>
                        {activas.map((c) => (
                          <td key={c.key} style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {c.key === CLAVE_HISTORIAL ? 'Se completa al exportar' : String(getValue(r, c.key) ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="auth-btn" onClick={exportar} disabled={exportando || activas.length === 0}>
            {exportando ? 'Generando...' : `Exportar ${FORMATOS.find((f) => f.key === formato)!.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
