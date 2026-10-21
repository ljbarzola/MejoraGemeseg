import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, Camera, Clock, Eye, Trash2 } from 'lucide-react';
import {
  eliminarBitacora,
  getAgenteBitacoras,
  getBitacoras,
  getOpcionesBitacora,
} from '../../../services/bitacoras.service';
import type {
  BitacoraResumen,
  EstadoAgenteBitacoras,
  FiltrosBitacoras,
  OpcionPuestoBitacora,
} from '../../../types/bitacoras';
import ClearFiltersButton from '../../../components/common/ClearFiltersButton';
import ColumnPickerMenu from '../../../components/common/ColumnPickerMenu';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import DateInput from '../../../components/common/DateInput';
import { usePerm } from '../../../contexts/PermissionsContext';
import { useColumnPreferences } from '../../../hooks/useColumnPreferences';
import { useResizableColumns } from '../../../hooks/useResizableColumns';
import { useSortableTable } from '../../../hooks/useSortableTable';
import { formatFechaHoraSync } from '../../../utils/formatFechaHora';
import {
  LECTURA_LABEL,
  OPCIONES_RESULTADO,
  RESULTADO_COLOR,
  RESULTADO_LABEL,
  periodoBitacora,
  textoOrigen,
} from '../../../utils/bitacoras';
import { mensajeError } from '../../../utils/entregasCp';
import BitacorasResumen from './BitacorasResumen';
import HorasTurnoModal from './HorasTurnoModal';
import SubirBitacoraModal from './SubirBitacoraModal';

type Vista = 'resumen' | 'lista';

const COL_ENTIDAD = 'entidad';
const COL_CONTRATO = 'contrato';
const COL_SUBIDA = 'subida';
const COL_LECTURA = 'lectura';
const COL_NOVEDADES = 'novedades';
const COL_FECHA_SUBIDA = 'fechaSubida';
const DEFAULT_VISIBLE = [COL_ENTIDAD, COL_NOVEDADES];
const COLUMNAS = [
  { key: COL_ENTIDAD, label: 'Entidad' },
  { key: COL_CONTRATO, label: 'Contrato' },
  { key: COL_NOVEDADES, label: 'Novedades' },
  { key: COL_SUBIDA, label: 'Subida por' },
  { key: COL_FECHA_SUBIDA, label: 'Fecha de subida' },
  { key: COL_LECTURA, label: 'Lectura' },
];

const PAGE_SIZE = 50;

/**
 * Bitácoras de guardianía: la foto de la hoja que llenan los guardias se sube
 * aquí, el agente revisor la lee y el sistema la compara con el horario del
 * puesto. Dos vistas: el Resumen (novedades y cumplimiento) y la Lista de hojas.
 */
export default function BitacorasPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { canWrite } = usePerm();
  const puedeEscribir = canWrite('CONTRATACION_PUBLICA');
  const tablaRef = useResizableColumns('cp-bitacoras');
  const columnPrefs = useColumnPreferences('cp-bitacoras', DEFAULT_VISIBLE);

  const vista: Vista = params.get('vista') === 'lista' ? 'lista' : 'resumen';
  const cambiarVista = (v: Vista) => {
    const p = new URLSearchParams(params);
    p.set('vista', v);
    setParams(p, { replace: true });
  };

  const [opciones, setOpciones] = useState<OpcionPuestoBitacora[]>([]);
  const [agente, setAgente] = useState<EstadoAgenteBitacoras | null>(null);
  const [filtros, setFiltros] = useState<FiltrosBitacoras>({});
  const [pagina, setPagina] = useState(1);
  const [filas, setFilas] = useState<BitacoraResumen[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [subiendo, setSubiendo] = useState(false);
  const [horasAbierto, setHorasAbierto] = useState(false);
  const [sinPermiso, setSinPermiso] = useState('');
  const [borrando, setBorrando] = useState<BitacoraResumen | null>(null);

  useEffect(() => {
    getOpcionesBitacora().then(setOpciones).catch(() => setOpciones([]));
    getAgenteBitacoras().then(setAgente).catch(() => setAgente(null));
  }, []);

  const cargar = useCallback(() => {
    setLoading(true);
    setError('');
    getBitacoras({ ...filtros, page: pagina, pageSize: PAGE_SIZE })
      .then((r) => {
        setFilas(r.items);
        setTotal(r.total);
      })
      .catch((err) => setError(mensajeError(err, 'No se pudieron cargar las bitácoras.')))
      .finally(() => setLoading(false));
  }, [filtros, pagina]);

  useEffect(() => {
    if (vista === 'lista') cargar();
  }, [vista, cargar]);

  const hayFiltros = Object.values(filtros).some(Boolean);
  const cambiarFiltro = (parcial: Partial<FiltrosBitacoras>) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, ...parcial }));
  };

  const columnasVisibles = columnPrefs.visible
    .map((key) => COLUMNAS.find((c) => c.key === key))
    .filter((c): c is (typeof COLUMNAS)[number] => !!c);
  const ver = (k: string) => columnasVisibles.some((c) => c.key === k);

  const { filas: ordenadas, thProps, SortIcon } = useSortableTable(
    filas,
    {
      periodo: (b) => b.fechaDesde,
      entidad: (b) => b.entidadNombre,
      contrato: (b) => b.contratoNumero,
      puesto: (b) => b.puestoNombre,
      novedades: (b) => b.novedades,
      subida: (b) => b.subidoPorNombre,
      fechaSubida: (b) => Date.parse(b.createdAt),
      lectura: (b) => LECTURA_LABEL[b.estadoLectura],
      resultado: (b) => RESULTADO_LABEL[b.resultado],
      hallazgos: (b) => b.hallazgosAbiertos,
    },
    'periodo',
  );

  // Puestos para filtrar, con la entidad al lado para no confundir "Garita norte" de dos contratos.
  const puestosFiltro = useMemo(
    () => opciones.flatMap((o) => o.puestos.map((p) => ({ id: p.id, texto: `${o.entidadNombre} — ${p.nombre}` }))),
    [opciones],
  );

  const pedirSubir = () => {
    if (!puedeEscribir) {
      setSinPermiso('subir bitácoras');
      return;
    }
    setSubiendo(true);
  };

  const confirmarBorrar = async () => {
    if (!borrando) return;
    const b = borrando;
    setBorrando(null);
    try {
      await eliminarBitacora(b.id);
      cargar();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo eliminar la bitácora.'));
    }
  };

  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">CONTRATACIÓN PÚBLICA · OPERACIONES</p>
            <h1>Bitácoras</h1>
          </div>
          <div className="header-actions">
            <button className="btn-secondary" onClick={() => setHorasAbierto(true)}>
              <Clock size={16} /> Horario de los turnos
            </button>
            <button className="auth-btn" onClick={pedirSubir}>
              <Camera size={16} /> Subir bitácora
            </button>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: '0.88rem', color: '#4a5568', maxWidth: 820 }}>
          Sube la foto de la hoja que llenan los guardias. El agente la lee y la compara con el horario del puesto: avisa si quien aparece no es quien debía estar, o si faltan guardias u horas.
        </p>
      </div>

      {agente && (!agente.activo || !agente.iaConfigurada) && (
        <div style={{ background: '#fffaf0', border: '1px solid #fbd38d', color: '#7b341e', borderRadius: 10, padding: '10px 14px', margin: '12px 0', fontSize: '0.85rem', display: 'flex', gap: 10, alignItems: 'center' }}>
          <Bot size={18} style={{ flexShrink: 0 }} />
          <span>
            {!agente.activo
              ? `${agente.nombre} está desactivado (Sistemas → Agentes): las fotos se guardan sin leer y hay que transcribirlas a mano.`
              : 'La lectura con IA no está configurada en este entorno: las fotos se guardan sin leer y hay que transcribirlas a mano.'}
          </span>
        </div>
      )}

      {error && <div className="form-error" style={{ margin: '12px 0' }}>{error}</div>}

      <div className="filter-bar" style={{ marginTop: 14 }}>
        <div className="filter-bar-fields">
          <select className="filter-select" value={filtros.puestoId ?? ''} onChange={(e) => cambiarFiltro({ puestoId: e.target.value })} aria-label="Puesto">
            <option value="">Todos los puestos</option>
            {puestosFiltro.map((p) => <option key={p.id} value={p.id}>{p.texto}</option>)}
          </select>
          {vista === 'lista' && (
            <select className="filter-select" value={filtros.resultado ?? ''} onChange={(e) => cambiarFiltro({ resultado: e.target.value })} aria-label="Resultado">
              {OPCIONES_RESULTADO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          <div style={{ minWidth: 150 }}>
            <DateInput value={filtros.desde ?? ''} onChange={(v) => cambiarFiltro({ desde: v })} placeholder="Desde" max={filtros.hasta || undefined} />
          </div>
          <div style={{ minWidth: 150 }}>
            <DateInput value={filtros.hasta ?? ''} onChange={(v) => cambiarFiltro({ hasta: v })} placeholder="Hasta" min={filtros.desde || undefined} />
          </div>
        </div>
        <div className="filter-bar-actions">
          {vista === 'lista' && (
            <ColumnPickerMenu
              columns={COLUMNAS}
              visible={columnPrefs.visible}
              fixedLabel="Hoja"
              onApply={async (keys) => {
                const guardado = await columnPrefs.set(keys);
                if (!guardado) setError('Se aplicó en este navegador, pero no se pudo guardar en tu cuenta.');
              }}
            />
          )}
          <ClearFiltersButton onClear={() => { setPagina(1); setFiltros({}); }} disabled={!hayFiltros} />
        </div>
      </div>

      <div className="admin-tabs" style={{ marginTop: 14 }}>
        <button className={`admin-tab ${vista === 'resumen' ? 'active' : ''}`} onClick={() => cambiarVista('resumen')}>Resumen</button>
        <button className={`admin-tab ${vista === 'lista' ? 'active' : ''}`} onClick={() => cambiarVista('lista')}>Hojas subidas</button>
      </div>

      {vista === 'resumen' ? (
        <BitacorasResumen filtros={filtros} />
      ) : (
        <div className="admin-section">
          {loading ? (
            <div className="loading-state">Cargando bitácoras…</div>
          ) : ordenadas.length === 0 ? (
            <div className="empty-state">
              {hayFiltros
                ? 'No hay bitácoras con esos filtros. Prueba quitando alguno.'
                : 'Todavía no se ha subido ninguna bitácora. Pulsa «Subir bitácora» y toma la foto de la hoja de un puesto.'}
            </div>
          ) : (
            <>
              <div className="tasks-table-wrapper">
                <table className="tasks-table resizable-table" ref={tablaRef}>
                  <thead>
                    <tr>
                      <th {...thProps('periodo')} style={{ width: '17%', minWidth: 130 }}>Hoja <SortIcon campo="periodo" /></th>
                      <th {...thProps('puesto')} style={{ width: '15%' }}>Puesto <SortIcon campo="puesto" /></th>
                      {ver(COL_ENTIDAD) && <th {...thProps('entidad')} style={{ width: '16%' }}>Entidad <SortIcon campo="entidad" /></th>}
                      {ver(COL_CONTRATO) && <th {...thProps('contrato')} style={{ width: '10%' }}>Contrato <SortIcon campo="contrato" /></th>}
                      {ver(COL_NOVEDADES) && <th {...thProps('novedades')} style={{ width: '9%' }}>Novedades <SortIcon campo="novedades" /></th>}
                      {ver(COL_SUBIDA) && <th {...thProps('subida')} style={{ width: '12%' }}>Subida por <SortIcon campo="subida" /></th>}
                      {ver(COL_FECHA_SUBIDA) && <th {...thProps('fechaSubida')} style={{ width: '12%' }}>Subida el <SortIcon campo="fechaSubida" /></th>}
                      {ver(COL_LECTURA) && <th {...thProps('lectura')} style={{ width: '10%' }}>Lectura <SortIcon campo="lectura" /></th>}
                      <th {...thProps('resultado')} style={{ width: '14%', minWidth: 110 }}>Resultado <SortIcon campo="resultado" /></th>
                      <th {...thProps('hallazgos')} style={{ width: '12%', minWidth: 90 }}>Hallazgos <SortIcon campo="hallazgos" /></th>
                      <th className="col-acciones col-acciones--ancha"><span className="visually-hidden">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenadas.map((b) => (
                      <tr key={b.id} onClick={() => navigate(`/contratacion-publica/bitacoras/${b.id}`)} style={{ cursor: 'pointer' }}>
                        <td>
                          <Link to={`/contratacion-publica/bitacoras/${b.id}`} className="enlace-tabla truncate" onClick={(e) => e.stopPropagation()} style={{ fontWeight: 700 }}>
                            {periodoBitacora(b.fechaDesde, b.fechaHasta)}
                          </Link>
                          <div style={{ fontSize: '0.72rem', color: '#718096' }}>n.º {b.id} · {textoOrigen(b.origenLectura, b.estadoLectura)}</div>
                        </td>
                        <td><span className="truncate" title={b.puestoNombre}>{b.puestoNombre}</span></td>
                        {ver(COL_ENTIDAD) && <td><span className="truncate" title={b.entidadNombre}>{b.entidadNombre}</span></td>}
                        {ver(COL_CONTRATO) && <td><span className="truncate">{b.contratoNumero}</span></td>}
                        {ver(COL_NOVEDADES) && <td>{b.novedades}</td>}
                        {ver(COL_SUBIDA) && <td><span className="truncate">{b.subidoPorNombre}</span></td>}
                        {ver(COL_FECHA_SUBIDA) && <td><span className="truncate">{formatFechaHoraSync(b.createdAt)}</span></td>}
                        {ver(COL_LECTURA) && <td><span className="truncate" title={b.mensajeLectura ?? undefined}>{LECTURA_LABEL[b.estadoLectura]}</span></td>}
                        <td>
                          <span className="status-badge" style={{ background: RESULTADO_COLOR[b.resultado].bg, color: RESULTADO_COLOR[b.resultado].fg }}>
                            {RESULTADO_LABEL[b.resultado]}
                          </span>
                        </td>
                        <td>
                          {b.hallazgosAbiertos === 0 ? '—' : (
                            <span style={{ color: b.hallazgosAltos ? '#c53030' : '#c05621', fontWeight: 700 }}>
                              {b.hallazgosAbiertos}
                              {b.hallazgosAltos > 0 && <div style={{ fontSize: '0.72rem' }}>{b.hallazgosAltos} {b.hallazgosAltos === 1 ? 'grave' : 'graves'}</div>}
                            </span>
                          )}
                        </td>
                        <td className="col-acciones col-acciones--ancha" onClick={(e) => e.stopPropagation()}>
                          <div className="acciones-iconos">
                            <Link to={`/contratacion-publica/bitacoras/${b.id}`} className="btn-secondary icon-btn" title="Abrir la bitácora" aria-label="Abrir la bitácora"><Eye size={16} /></Link>
                            {puedeEscribir ? (
                              <button type="button" className="btn-secondary icon-btn" style={{ color: '#c53030' }} title="Eliminar la bitácora" aria-label="Eliminar la bitácora" onClick={() => setBorrando(b)}>
                                <Trash2 size={16} />
                              </button>
                            ) : <span className="icon-btn" />}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {total > PAGE_SIZE && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 14, fontSize: '0.85rem' }}>
                  <button className="btn-secondary" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
                  <span>Página {pagina} de {paginas} · {total} bitácoras</span>
                  <button className="btn-secondary" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {subiendo && (
        <SubirBitacoraModal
          puestoInicial={filtros.puestoId ? Number(filtros.puestoId) : undefined}
          onClose={() => setSubiendo(false)}
          onSubida={(id) => navigate(`/contratacion-publica/bitacoras/${id}`)}
        />
      )}
      {horasAbierto && <HorasTurnoModal puedeEditar={puedeEscribir} onClose={() => setHorasAbierto(false)} />}
      {borrando && (
        <ConfirmDialog
          title="Eliminar bitácora"
          danger
          confirmLabel="Eliminar"
          message={`Se elimina la bitácora n.º ${borrando.id} de «${borrando.puestoNombre}» (${periodoBitacora(borrando.fechaDesde, borrando.fechaHasta)}) con su foto, lo leído y sus hallazgos. No se puede deshacer.`}
          onConfirm={() => void confirmarBorrar()}
          onCancel={() => setBorrando(null)}
        />
      )}
      {sinPermiso && (
        <ConfirmDialog
          title="No tienes permiso para esto"
          hideCancel
          confirmLabel="Entendido"
          message={`Tu usuario solo puede ver las bitácoras. Pide a alguien de Contratación Pública con permiso de escribir que te lo dé para poder ${sinPermiso}.`}
          onConfirm={() => setSinPermiso('')}
          onCancel={() => setSinPermiso('')}
        />
      )}
    </div>
  );
}
