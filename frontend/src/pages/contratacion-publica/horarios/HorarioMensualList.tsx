import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  getHorarios,
  getHorariosByContrato,
  createHorario,
  deleteHorario,
  getContrato,
  getContratos,
} from '../../../services/contratacion-publica.service';
import type { CPHorarioMensual, CPContrato } from '../../../types/contratacion-publica';
import { usePerm } from '../../../contexts/PermissionsContext';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../../../components/common/ColumnFilter';
import CPPageHeader from '../../../components/contratacion-publica/CPPageHeader';
import MovidoAConfiguracion from '../../../components/common/MovidoAConfiguracion';
import { useColumnFilters } from '../../../hooks/useColumnFilters';
import { useResizableColumns } from '../../../hooks/useResizableColumns';

function formatFechaCorta(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.slice(0, 10).split('-');
  return `${dia}/${mes}/${anio}`;
}

const ESTADO_COLOR: Record<string, { bg: string; fg: string }> = {
  BORRADOR: { bg: '#fefcbf', fg: '#975a16' },
  ENVIADO: { bg: '#bee3f8', fg: '#2b6cb0' },
  APROBADO: { bg: '#c6f6d5', fg: '#276749' },
  RECHAZADO: { bg: '#fed7d7', fg: '#c53030' },
};

/**
 * «Horarios» del menú: los horarios de TODOS los contratos en una tabla. Con `?contratoId=` (desde la
 * pestaña Horarios de un contrato) muestra solo los de ese contrato y el nuevo horario ya sabe de cuál es.
 */
export default function HorarioMensualList() {
  const navigate = useNavigate();
  const { canWrite } = usePerm();
  const canEdit = canWrite('CONTRATACION_PUBLICA');
  const [searchParams] = useSearchParams();
  const contratoId = Number(searchParams.get('contratoId')) || 0;
  const tablaRef = useResizableColumns('cp-horarios');

  const [contrato, setContrato] = useState<CPContrato | null>(null);
  const [contratos, setContratos] = useState<CPContrato[]>([]);
  const [horarios, setHorarios] = useState<CPHorarioMensual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [contratoElegido, setContratoElegido] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmandoEliminar, setConfirmandoEliminar] = useState<CPHorarioMensual | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    const pedidos = contratoId
      ? Promise.all([getContrato(contratoId), getHorariosByContrato(contratoId)]).then(([c, h]) => { setContrato(c); setHorarios(h); })
      : Promise.all([getHorarios(), getContratos()]).then(([h, cs]) => { setContrato(null); setHorarios(h); setContratos(cs); });
    pedidos
      .catch((err) => setError(err.response?.data?.message || 'No se pudieron cargar los horarios.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [contratoId]);

  // Filtros en la cabecera de cada columna. «Periodo» es un tramo: sale el horario que cubre algún día del rango.
  const cf = useColumnFilters<CPHorarioMensual>(horarios, [
    { key: 'contrato', etiqueta: 'Contrato', tipo: 'valores', getValues: (h) => ({ valor: String(h.contratoId), etiqueta: h.contrato?.numero ?? `#${h.contratoId}` }) },
    { key: 'entidad', etiqueta: 'Entidad', tipo: 'valores', getValues: (h) => ({ valor: String(h.contrato?.entidad?.id ?? 0), etiqueta: h.contrato?.entidad?.nombre ?? '—' }) },
    { key: 'periodo', etiqueta: 'Periodo', tipo: 'fecha', getValue: (h) => h.fechaInicio, getFin: (h) => h.fechaFin },
    { key: 'estado', etiqueta: 'Estado', tipo: 'valores', orden: ['BORRADOR', 'ENVIADO', 'APROBADO', 'RECHAZADO'], getValues: (h) => ({ valor: h.estado, etiqueta: h.estado }) },
  ]);

  const handleCrear = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const destino = contratoId || Number(contratoElegido);
    if (!destino) {
      setError('Elige el contrato del horario.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const creado = await createHorario({ contratoId: destino, fechaInicio, fechaFin });
      navigate(`/contratacion-publica/horarios/${creado.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo crear el horario mensual.');
    } finally {
      setSaving(false);
    }
  };

  const confirmarEliminar = async () => {
    const h = confirmandoEliminar;
    setConfirmandoEliminar(null);
    if (!h) return;
    try {
      await deleteHorario(h.id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'No se pudo eliminar el horario.');
    }
  };

  const columnas = contratoId ? 3 : 5;

  return (
    <div className="page-container">
      {contratoId > 0 && (
        <button className="cacao-back-btn" onClick={() => navigate(`/contratacion-publica/contratos/${contratoId}`)} style={{ alignSelf: 'flex-start', marginBottom: 10 }}>
          <ArrowLeft size={16} strokeWidth={2.4} /> Volver al contrato
        </button>
      )}
      <CPPageHeader
        pantalla="horarios"
        title={contrato ? `Horarios · Contrato ${contrato.numero}` : 'Horarios'}
        description="Quién cubre cada puesto, día por día, para un rango de fechas. Se arma en borrador, se envía y se aprueba; al enviarlo se valida que cada puesto tenga los guardias mínimos."
        actions={
          canEdit && (
            <button className="auth-btn" onClick={() => setShowForm((v) => !v)}>
              <Plus size={16} /> Nuevo Horario
            </button>
          )
        }
      />
      <MovidoAConfiguracion to="/contratacion-publica/configuracion?pestana=codigos" enlace="Ir a Códigos de turno">
        «Códigos de turno» se movió del menú a Configuración.
      </MovidoAConfiguracion>

      {error && (
        <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.85rem' }}>{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleCrear} className="admin-section" style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '18px' }}>
          {!contratoId && (
            <div className="form-group" style={{ margin: 0, minWidth: 260 }}>
              <label>Contrato</label>
              <select required value={contratoElegido} onChange={(e) => setContratoElegido(e.target.value)}>
                <option value="">Elige un contrato…</option>
                {contratos.map((c) => (
                  <option key={c.id} value={c.id}>{c.numero}{c.entidad ? ` · ${c.entidad.nombre}` : ''}</option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group" style={{ margin: 0 }}>
            <label>Fecha inicio</label>
            <input type="date" required value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Fecha fin</label>
            <input type="date" required min={fechaInicio || undefined} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </div>
          <button type="submit" className="auth-btn" disabled={saving || !fechaInicio || !fechaFin || (!contratoId && !contratoElegido)}>{saving ? 'Creando...' : 'Crear Horario'}</button>
          <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
        </form>
      )}

      {horarios.length > 0 && (
        <>
          <div className="filter-bar">
            <div className="filter-bar-fields" />
            <div className="filter-bar-actions">
              <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
            </div>
          </div>
          <ChipsFiltros cf={cf} />
        </>
      )}

      <div className="admin-section">
        {loading ? (
          <div className="loading-state">Cargando horarios...</div>
        ) : horarios.length === 0 ? (
          <div className="empty-state">{contratoId ? 'No hay horarios creados para este contrato.' : 'Todavía no hay horarios. Pulsa «Nuevo Horario» y elige el contrato.'}</div>
        ) : (
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaRef}>
              <thead>
                <tr>
                  {!contratoId && <th>Contrato<ColumnFilter cf={cf} col="contrato" orden={cf.ordenDe('contrato')} /></th>}
                  {!contratoId && <th>Entidad<ColumnFilter cf={cf} col="entidad" orden={cf.ordenDe('entidad')} /></th>}
                  <th>Periodo<ColumnFilter cf={cf} col="periodo" orden={cf.ordenDe('periodo')} /></th>
                  <th>Estado<ColumnFilter cf={cf} col="estado" orden={cf.ordenDe('estado')} /></th>
                  <th className="col-acciones col-acciones--ancha" title="Acciones"><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {cf.filas.length === 0 && (
                  <FilaSinResultados columnas={columnas} mensaje="No hay horarios que coincidan con los filtros." onLimpiar={cf.limpiar} />
                )}
                {cf.filas.map((h) => (
                  <tr key={h.id}>
                    {!contratoId && <td style={{ fontWeight: 600 }}>{h.contrato?.numero ?? `#${h.contratoId}`}</td>}
                    {!contratoId && <td>{h.contrato?.entidad?.nombre ?? '—'}</td>}
                    <td style={{ fontWeight: 600 }}>{formatFechaCorta(h.fechaInicio)} – {formatFechaCorta(h.fechaFin)}</td>
                    <td>
                      <span className="status-badge" style={{ background: ESTADO_COLOR[h.estado]?.bg, color: ESTADO_COLOR[h.estado]?.fg }}>
                        {h.estado}
                      </span>
                    </td>
                    <td>
                      <div className="acciones-iconos" style={{ alignItems: 'center' }}>
                        <button type="button" className="btn-secondary" onClick={() => navigate(`/contratacion-publica/horarios/${h.id}`)}>Abrir</button>
                        {canEdit && h.estado === 'BORRADOR' ? (
                          <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Eliminar horario" aria-label="Eliminar horario" onClick={() => setConfirmandoEliminar(h)}>
                            <Trash2 size={16} />
                          </button>
                        ) : (
                          // Hueco: el botón "Abrir" queda en el mismo lugar con o sin papelera.
                          <span className="icon-btn" aria-hidden="true" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmandoEliminar && (
        <ConfirmDialog
          title="Eliminar horario"
          message={`¿Eliminar el horario del ${formatFechaCorta(confirmandoEliminar.fechaInicio)} al ${formatFechaCorta(confirmandoEliminar.fechaFin)}? Se perderán todas sus celdas.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmarEliminar}
          onCancel={() => setConfirmandoEliminar(null)}
        />
      )}
    </div>
  );
}
