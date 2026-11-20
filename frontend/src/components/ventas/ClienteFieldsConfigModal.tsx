import { useEffect, useRef, useState } from 'react';
import { X, Settings2, Plus, Trash2, Lock, ChevronRight } from 'lucide-react';
import {
  addSalesClientField,
  updateSalesClientField,
  deleteSalesClientField,
  SalesClientField,
  SalesClientFieldOption,
  LISTA_SUBOPCIONES,
  SUBSERVICIOS_KEY,
} from '../../services/ventas.service';

const TYPE_LABEL: Record<string, string> = {
  TEXT: 'Texto',
  TEXTAREA: 'Texto largo',
  EMAIL: 'Email',
  NUMBER: 'Número',
  DATE: 'Fecha',
  BOOLEAN: 'Sí/No',
  SELECT: 'Lista de opciones',
  LISTA_SUBOPCIONES: 'Lista con subopciones',
};

const esLista = (fieldType: string) => fieldType === 'SELECT' || fieldType === LISTA_SUBOPCIONES;

// Convierte un label libre en un key estable — mismo criterio que
// ComplaintStagesConfigModal.tsx / SalesClientStagesConfigModal.tsx.
const slugifyKey = (label: string) =>
  label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

interface Props {
  fields: SalesClientField[];
  onClose: () => void;
  onChanged: () => void;
}

export default function ClienteFieldsConfigModal({ fields, onClose, onChanged }: Props) {
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState('TEXT');
  const [newOptions, setNewOptions] = useState<SalesClientFieldOption[]>([]);
  const [newAllowOther, setNewAllowOther] = useState(false);
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [addingField, setAddingField] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  // El error se pinta arriba: si se borró desde abajo de la lista, se lleva a la vista.
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [error]);

  const handleAddField = async () => {
    if (!newFieldLabel.trim()) return;
    setAddingField(true);
    setError('');
    try {
      await addSalesClientField({
        label: newFieldLabel.trim(),
        fieldType: newFieldType,
        options: esLista(newFieldType) ? newOptions : undefined,
        allowOther: esLista(newFieldType) ? newAllowOther : undefined,
      });
      setNewFieldLabel('');
      setNewFieldType('TEXT');
      setNewOptions([]);
      setNewAllowOther(false);
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo añadir el campo');
    } finally {
      setAddingField(false);
    }
  };

  const handleAddNewOption = () => {
    if (!newOptionLabel.trim()) return;
    const key = slugifyKey(newOptionLabel);
    if (!key || newOptions.some((o) => o.key === key)) return;
    setNewOptions([...newOptions, { key, label: newOptionLabel.trim() }]);
    setNewOptionLabel('');
  };

  const handleDeleteField = async (id: number) => {
    setError('');
    try {
      await deleteSalesClientField(id);
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo quitar el campo');
    }
  };

  const handleRenameField = async (field: SalesClientField, label: string) => {
    if (!label.trim() || label === field.label) return;
    setError('');
    try {
      await updateSalesClientField(field.id, { label: label.trim() });
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo renombrar el campo');
    }
  };

  const handleAddOptionToField = async (field: SalesClientField, label: string) => {
    if (!label.trim()) return;
    const key = slugifyKey(label);
    if (!key || field.options?.some((o) => o.key === key)) return;
    setError('');
    try {
      await updateSalesClientField(field.id, { options: [...(field.options || []), { key, label: label.trim() }] });
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo agregar la opción');
    }
  };

  const handleRenameOption = async (field: SalesClientField, optionKey: string, label: string) => {
    if (!label.trim()) return;
    setError('');
    try {
      const options = (field.options || []).map((o) => (o.key === optionKey ? { ...o, label: label.trim() } : o));
      await updateSalesClientField(field.id, { options });
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo renombrar la opción');
    }
  };

  // Sub-servicios de una opción de "Servicio requerido": se guardan dentro de
  // la propia opción (`children`), así que se reenvía la lista completa de
  // opciones con los hijos de esa opción cambiados.
  const saveChildren = async (
    field: SalesClientField,
    optionKey: string,
    children: { key: string; label: string }[],
    errorMessage: string,
  ) => {
    setError('');
    try {
      const options = (field.options || []).map((o) => (o.key === optionKey ? { ...o, children } : o));
      await updateSalesClientField(field.id, { options });
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || errorMessage);
    }
  };

  const nombreHijo = () => 'la subopción';

  const handleAddChild = (field: SalesClientField, option: SalesClientFieldOption, label: string) => {
    const key = slugifyKey(label);
    const children = option.children || [];
    if (!key || children.some((c) => c.key === key)) return;
    return saveChildren(field, option.key, [...children, { key, label: label.trim() }], `No se pudo agregar ${nombreHijo()}`);
  };

  const handleRenameChild = (field: SalesClientField, option: SalesClientFieldOption, childKey: string, label: string) => {
    if (!label.trim()) return;
    const children = (option.children || []).map((c) => (c.key === childKey ? { ...c, label: label.trim() } : c));
    return saveChildren(field, option.key, children, `No se pudo renombrar ${nombreHijo()}`);
  };

  const handleRemoveChild = (field: SalesClientField, option: SalesClientFieldOption, childKey: string) =>
    saveChildren(
      field,
      option.key,
      (option.children || []).filter((c) => c.key !== childKey),
      `No se pudo quitar ${nombreHijo()}`,
    );

  const handleToggleAllowOther = async (field: SalesClientField) => {
    setError('');
    try {
      await updateSalesClientField(field.id, { allowOther: !field.allowOther });
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo actualizar el campo');
    }
  };

  const handleRemoveOption = async (field: SalesClientField, optionKey: string) => {
    setError('');
    try {
      const options = (field.options || []).filter((o) => o.key !== optionKey);
      await updateSalesClientField(field.id, { options });
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo quitar la opción');
    }
  };

  const camposVisibles = fields.filter((f) => f.key !== SUBSERVICIOS_KEY);
  // Panel de la derecha: las opciones de la lista elegida. Por defecto, la primera lista.
  const listaElegida = camposVisibles.find((f) => f.id === editingId && esLista(f.fieldType))
    ?? camposVisibles.find((f) => esLista(f.fieldType));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings2 size={17} /> Configurar campos de la ficha
          </h3>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body cfc">
          <p className="cfc-ayuda">
            Los datos que se guardan de cada empresa o persona del Directorio. Para renombrar uno, escribe encima.
          </p>

          {error && <div className="form-error" ref={errorRef}>{error}</div>}

          {/* Agregar: una sola fila, como «Crear Puesto / Vacante». */}
          <div className="form-group">
            <label>Agregar campo</label>
            <div className="cfc-agregar">
              <input value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} placeholder="Ej.: Representante legal"
                aria-label="Nombre del campo nuevo"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddField(); } }} />
              <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)} aria-label="Tipo del campo nuevo">
                <option value="TEXT">Texto</option>
                <option value="NUMBER">Número</option>
                <option value="DATE">Fecha</option>
                <option value="BOOLEAN">Sí/No</option>
                <option value="SELECT">Lista de opciones</option>
                <option value={LISTA_SUBOPCIONES}>Lista con subopciones</option>
              </select>
              <button type="button" className="auth-btn cfc-btn-agregar" onClick={handleAddField} disabled={addingField || !newFieldLabel.trim()}>
                <Plus size={15} /> Añadir
              </button>
            </div>
            {esLista(newFieldType) && (
              <div className="cfc-opciones-nuevas">
                {newOptions.length > 0 && (
                  <div className="cfc-chips">
                    {newOptions.map((o) => (
                      <span key={o.key} className="cfc-chip">
                        {o.label}
                        <button type="button" onClick={() => setNewOptions(newOptions.filter((x) => x.key !== o.key))}
                          title="Quitar opción" aria-label={`Quitar ${o.label}`}>
                          <X size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="cfc-fila-sencilla">
                  <input value={newOptionLabel} onChange={(e) => setNewOptionLabel(e.target.value)} placeholder="Opción de la lista (ej.: Referido) y Enter"
                    aria-label="Opción nueva"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewOption(); } }} />
                  <button type="button" className="btn-secondary icon-btn" onClick={handleAddNewOption} title="Agregar opción" aria-label="Agregar opción">
                    <Plus size={14} />
                  </button>
                </div>
                <label className="casilla">
                  <input type="checkbox" checked={newAllowOther} onChange={(e) => setNewAllowOther(e.target.checked)} />
                  Permitir «Otro» con texto libre
                </label>
              </div>
            )}
          </div>

          <div className="cfc-dos">
            {/* Izquierda: todos los campos, uno por fila. */}
            <div className="form-group">
              <label>Campos de la ficha ({camposVisibles.length})</label>
              <div className="cfc-lista">
                {camposVisibles.map((f) => {
                  const elegido = listaElegida?.id === f.id;
                  return (
                    <div key={f.id} className={elegido ? 'cfc-campo cfc-campo--elegido' : 'cfc-campo'}>
                      <input
                        aria-label="Nombre del campo"
                        defaultValue={f.label}
                        onBlur={(e) => handleRenameField(f, e.target.value)}
                      />
                      {esLista(f.fieldType) ? (
                        <button type="button" className="cfc-tipo cfc-tipo--lista" onClick={() => setEditingId(f.id)} aria-pressed={elegido}
                          title="Ver sus opciones">
                          Lista ({f.options?.length ?? 0}) <ChevronRight size={13} />
                        </button>
                      ) : (
                        <span className="cfc-tipo">{TYPE_LABEL[f.fieldType] || f.fieldType}</span>
                      )}
                      {f.isCore ? (
                        <span className="cfc-candado" title="Campo fijo: lo usan los filtros, el Dashboard y los documentos. Se puede renombrar, no borrar.">
                          <Lock size={14} />
                        </span>
                      ) : (
                        <button type="button" className="btn-secondary icon-btn" onClick={() => handleDeleteField(f.id)}
                          style={{ color: '#c53030' }} title="Borrar campo (solo si nadie lo tiene lleno)" aria-label={`Borrar el campo ${f.label}`}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <small>El candado marca los campos fijos del sistema. Los que agregues se pueden borrar mientras nadie del Directorio los tenga llenos.</small>
            </div>

            {/* Derecha: las opciones de la lista elegida. */}
            <div className="form-group">
              <label>{listaElegida ? `Opciones de «${listaElegida.label}»` : 'Opciones'}</label>
              {!listaElegida ? (
                <p className="cfc-vacio">Ningún campo es una lista. Agrega uno de tipo «Lista de opciones» para cargar sus opciones aquí.</p>
              ) : (
                <div className="cfc-opciones">
                  {listaElegida.fieldType === LISTA_SUBOPCIONES ? (
                    (listaElegida.options || []).map((o) => (
                      <div key={`${listaElegida.id}-${o.key}`} className="cfc-opcion-grupo">
                        <OpcionEditable label={o.label} titulo="Nombre de la opción"
                          onRename={(label) => handleRenameOption(listaElegida, o.key, label)} onRemove={() => handleRemoveOption(listaElegida, o.key)} />
                        <HijosDeOpcion
                          option={o}
                          placeholder={`Subopción de «${o.label}»`}
                          onRename={(childKey, label) => handleRenameChild(listaElegida, o, childKey, label)}
                          onRemove={(childKey) => handleRemoveChild(listaElegida, o, childKey)}
                          onAdd={(label) => handleAddChild(listaElegida, o, label)}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="cfc-rejilla">
                      {(listaElegida.options || []).map((o) => (
                        <OpcionEditable key={`${listaElegida.id}-${o.key}`} label={o.label} titulo="Nombre de la opción"
                          onRename={(label) => handleRenameOption(listaElegida, o.key, label)} onRemove={() => handleRemoveOption(listaElegida, o.key)} />
                      ))}
                    </div>
                  )}
                  <AddOptionRow key={listaElegida.id} onAdd={(label) => handleAddOptionToField(listaElegida, label)} />
                  <label className="casilla">
                    <input type="checkbox" checked={listaElegida.allowOther} onChange={() => handleToggleAllowOther(listaElegida)} />
                    Permitir «Otro» con texto libre
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// Una opción (o subopción) como caja compacta: se renombra escribiendo encima y se quita con la papelera.
function OpcionEditable({ label, titulo, onRename, onRemove }: { label: string; titulo: string; onRename: (label: string) => void; onRemove: () => void }) {
  return (
    <div className="cfc-fila-sencilla">
      <input aria-label={titulo} defaultValue={label} onBlur={(e) => { if (e.target.value !== label) onRename(e.target.value); }} />
      <button type="button" className="btn-secondary icon-btn" onClick={onRemove}
        style={{ color: '#c53030' }} title="Quitar" aria-label={`Quitar ${label}`}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function HijosDeOpcion({
  option,
  placeholder,
  onRename,
  onRemove,
  onAdd,
}: {
  option: SalesClientFieldOption;
  placeholder: string;
  onRename: (childKey: string, label: string) => void;
  onRemove: (childKey: string) => void;
  onAdd: (label: string) => void;
}) {
  return (
    <div className="cfc-hijos">
      <div className="cfc-rejilla">
        {(option.children || []).map((c) => (
          <OpcionEditable key={c.key} label={c.label} titulo="Nombre de la subopción"
            onRename={(label) => onRename(c.key, label)} onRemove={() => onRemove(c.key)} />
        ))}
        <AddOptionRow placeholder={placeholder} onAdd={onAdd} />
      </div>
    </div>
  );
}

function AddOptionRow({ onAdd, placeholder = 'Nueva opción y Enter' }: { onAdd: (label: string) => void; placeholder?: string }) {
  const [label, setLabel] = useState('');
  const agregar = () => { if (label.trim()) { onAdd(label); setLabel(''); } };
  return (
    <div className="cfc-fila-sencilla">
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} />
      <button type="button" className="btn-secondary icon-btn" onClick={agregar} title="Agregar" aria-label="Agregar">
        <Plus size={14} />
      </button>
    </div>
  );
}
