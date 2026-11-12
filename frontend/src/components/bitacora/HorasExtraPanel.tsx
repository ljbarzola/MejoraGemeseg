import { useCallback, useEffect, useState } from 'react';
import ErrorBanner from '../common/ErrorBanner';
import ConfirmDialog from '../common/ConfirmDialog';
import PromptDialog from '../common/PromptDialog';
import RowActionsMenu from '../common/RowActionsMenu';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../common/ColumnFilter';
import ClearFiltersButton from '../common/ClearFiltersButton';
import AnotarHorasModal from './AnotarHorasModal';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import { useSortableTable } from '../../hooks/useSortableTable';
import {
  anularHorasDebidas,
  getHorasEquipo,
  mensajeErrorBitacora,
  resolverTiempoExtra,
  type ResumenHorasEquipo,
} from '../../services/bitacora.service';
import { diaEcuador, duracion, fechaLarga, hora } from '../../utils/bitacoraFechas';
import { claseEstadoExtra, textoCierre, textoEstadoExtra } from '../../utils/bitacoraHoras';
import '../../styles/bitacora.css';

type PersonaSaldo = ResumenHorasEquipo['personas'][number];
type ExtraEquipo = ResumenHorasEquipo['pendientes'][number];

const CAMPOS_ORDEN = {
  nombre: (p: PersonaSaldo) => p.nombre,
  abonado: (p: PersonaSaldo) => p.abonadoMinutos,
  deuda: (p: PersonaSaldo) => p.deudaMinutos,
  saldo: (p: PersonaSaldo) => p.saldoMinutos,
  pendiente: (p: PersonaSaldo) => p.pendienteMinutos,
};

/** «+2 h 10 min», «−45 min» o «Al día». */
function textoSaldo(min: number): string {
  if (min === 0) return 'Al día';
  return `${min > 0 ? '+' : '−'}${duracion(Math.abs(min))}`;
}

/**
 * Pestaña «Horas extra» de Configuración: administradores y gerentes aprueban o rechazan el tiempo
 * extra de cada persona, ven su saldo de horas y anotan (o anulan) horas que se deben.
 */
export default function HorasExtraPanel() {
  const [datos, setDatos] = useState<ResumenHorasEquipo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [rechazando, setRechazando] = useState<ExtraEquipo | null>(null);
  const [anotando, setAnotando] = useState<number | 'cualquiera' | null>(null);
  const [anulando, setAnulando] = useState<ResumenHorasEquipo['deudas'][number] | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const tablaPendientes = useResizableColumns('bitacora-horas-pendientes');
  const tablaSaldos = useResizableColumns('bitacora-horas-saldos');

  const cargar = useCallback(async () => {
    try {
      setDatos(await getHorasEquipo());
    } catch (err) {
      setError(mensajeErrorBitacora(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const personas = datos?.personas ?? [];
  const cf = useColumnFilters<PersonaSaldo>(personas, [
    { key: 'nombre', etiqueta: 'Persona', tipo: 'texto', getValue: (p) => [p.nombre, p.cargo].filter(Boolean).join(' ') },
    { key: 'saldo', etiqueta: 'Saldo', tipo: 'numero', getValue: (p) => p.saldoMinutos },
  ]);
  const { filas, thProps, ordenDe } = useSortableTable(cf.filas, CAMPOS_ORDEN, 'nombre');

  const resolver = async (extra: ExtraEquipo, aprobar: boolean, nota?: string) => {
    setTrabajando(true);
    setError('');
    try {
      await resolverTiempoExtra(extra.id, aprobar, nota);
      setRechazando(null);
      await cargar();
    } catch (err) {
      setRechazando(null);
      setError(mensajeErrorBitacora(err));
    } finally {
      setTrabajando(false);
    }
  };

  const anular = async () => {
    if (!anulando) return;
    setTrabajando(true);
    setError('');
    try {
      await anularHorasDebidas(anulando.id);
      setAnulando(null);
      await cargar();
    } catch (err) {
      setAnulando(null);
      setError(mensajeErrorBitacora(err));
    } finally {
      setTrabajando(false);
    }
  };

  if (cargando) return <p className="bit-vacio">Cargando...</p>;

  const pendientes = datos?.pendientes ?? [];

  return (
    <>
      <ErrorBanner mensaje={error} />

      <p className="bit-nota" style={{ marginTop: 0 }}>
        Cada persona pulsa «Empezar tiempo extra» en su hoja del día al llegar antes o quedarse después. La bitácora
        cuenta solo los minutos con actividad real fuera del horario; aquí lo apruebas o lo rechazas antes de que entre
        a su saldo. La tolerancia y los minutos de inactividad se cambian en la pestaña «Horario».
      </p>

      <h4 className="bit-horas-subtitulo">Por aprobar</h4>
      {pendientes.length === 0 ? (
        <p className="bit-vacio">No hay tiempo extra esperando aprobación.</p>
      ) : (
        <div className="tasks-table-wrapper">
          <table className="tasks-table resizable-table" ref={tablaPendientes}>
            <thead>
              <tr>
                <th>Persona</th>
                <th>Día</th>
                <th>Horario</th>
                <th>Con actividad</th>
                <th>Cuenta</th>
                <th className="col-acciones col-acciones--ancha">
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((e) => (
                <tr key={e.id} className="tasks-table-row">
                  <td className="tasks-table-title">{e.nombre}</td>
                  <td>{fechaLarga(diaEcuador(e.inicio))}</td>
                  <td>
                    {hora(e.inicio)} a {e.fin ? hora(e.fin) : '…'}
                    <span className="bit-kpi-detalle">{textoCierre(e.cierre)}</span>
                  </td>
                  <td>{duracion(e.minutos)}</td>
                  <td>{duracion(e.minutosContados)}</td>
                  <td className="col-acciones col-acciones--ancha">
                    <div className="acciones-iconos">
                      <button type="button" className="auth-btn" disabled={trabajando} onClick={() => resolver(e, true)}>
                        Aprobar
                      </button>
                      <RowActionsMenu actions={[{ label: 'Rechazar', danger: true, onClick: () => setRechazando(e) }]} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4 className="bit-horas-subtitulo">Saldo de horas por persona</h4>
      {personas.length === 0 ? (
        <p className="bit-vacio">Todavía no hay movimientos. Aparecen aquí las personas con la hoja activada.</p>
      ) : (
        <>
          <div className="filter-bar">
            <div className="filter-bar-actions">
              <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
            </div>
          </div>
          <ChipsFiltros cf={cf} />
          <div className="tasks-table-wrapper">
            <table className="tasks-table resizable-table" ref={tablaSaldos}>
              <thead>
                <tr>
                  <th {...thProps('nombre')}>Persona <ColumnFilter cf={cf} col="nombre" orden={ordenDe('nombre')} /></th>
                  <th {...thProps('abonado')}>Tiempo extra aprobado <ColumnFilter cf={cf} col="abonado" orden={ordenDe('abonado')} /></th>
                  <th {...thProps('deuda')}>Debe <ColumnFilter cf={cf} col="deuda" orden={ordenDe('deuda')} /></th>
                  <th {...thProps('saldo')}>Saldo <ColumnFilter cf={cf} col="saldo" orden={ordenDe('saldo')} /></th>
                  <th {...thProps('pendiente')}>Por aprobar <ColumnFilter cf={cf} col="pendiente" orden={ordenDe('pendiente')} /></th>
                  <th className="col-acciones col-acciones--ancha">
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <FilaSinResultados columnas={6} mensaje="No hay personas que coincidan con los filtros." onLimpiar={cf.limpiar} />
                )}
                {filas.map((p) => (
                  <tr key={p.userId} className="tasks-table-row">
                    <td className="tasks-table-title">
                      {p.nombre}
                      {p.cargo && <span className="bit-kpi-detalle">{p.cargo}</span>}
                    </td>
                    <td>{duracion(p.abonadoMinutos)}</td>
                    <td>{duracion(p.deudaMinutos)}</td>
                    <td>
                      <strong>{textoSaldo(p.saldoMinutos)}</strong>
                    </td>
                    <td>{duracion(p.pendienteMinutos)}</td>
                    <td className="col-acciones col-acciones--ancha">
                      <RowActionsMenu actions={[{ label: 'Anotar horas que debe', onClick: () => setAnotando(p.userId) }]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {(datos?.recientes.length ?? 0) > 0 && (
        <>
          <h4 className="bit-horas-subtitulo">Resuelto en los últimos 45 días</h4>
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Día</th>
                  <th>Cuenta</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {datos?.recientes.map((e) => (
                  <tr key={e.id} className="tasks-table-row">
                    <td className="tasks-table-title">{e.nombre}</td>
                    <td>{fechaLarga(diaEcuador(e.inicio))}</td>
                    <td>{duracion(e.minutosContados)}</td>
                    <td>
                      <span className={`bit-fuente ${claseEstadoExtra(e.estado)}`}>{textoEstadoExtra(e.estado)}</span>
                      {e.notaJefe && <span className="bit-kpi-detalle">{e.notaJefe}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {(datos?.deudas.length ?? 0) > 0 && (
        <>
          <h4 className="bit-horas-subtitulo">Horas debidas anotadas (últimos 45 días)</h4>
          <div className="tasks-table-wrapper">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Día</th>
                  <th>Tiempo</th>
                  <th>Motivo</th>
                  <th>Anotada por</th>
                  <th className="col-acciones col-acciones--ancha">
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {datos?.deudas.map((d) => (
                  <tr key={d.id} className="tasks-table-row">
                    <td className="tasks-table-title">{d.nombre}</td>
                    <td>{fechaLarga(d.fecha)}</td>
                    <td>{duracion(d.minutos)}</td>
                    <td>{d.motivo}</td>
                    <td>{d.creadaPor ?? '—'}</td>
                    <td className="col-acciones col-acciones--ancha">
                      <RowActionsMenu actions={[{ label: 'Anular', danger: true, onClick: () => setAnulando(d) }]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="bit-extension-botones">
        <button type="button" className="btn-secondary" onClick={() => setAnotando('cualquiera')}>
          Anotar horas que debe una persona
        </button>
      </div>

      {rechazando && (
        <PromptDialog
          title="Rechazar tiempo extra"
          message={`Explica por qué no se suma el tiempo extra de ${rechazando.nombre}. La persona lo verá.`}
          placeholder="Motivo del rechazo"
          required
          confirmLabel="Rechazar"
          onConfirm={(nota) => resolver(rechazando, false, nota)}
          onCancel={() => setRechazando(null)}
        />
      )}

      {anulando && (
        <ConfirmDialog
          title="Anular horas debidas"
          message={`Se quitan ${duracion(anulando.minutos)} que ${anulando.nombre} debía («${anulando.motivo}»). Su saldo mejora en ese tiempo.`}
          confirmLabel="Anular"
          danger
          onConfirm={anular}
          onCancel={() => setAnulando(null)}
        />
      )}

      {anotando !== null && (
        <AnotarHorasModal
          personas={personas.map((p) => ({ userId: p.userId, nombre: p.nombre }))}
          personaInicial={typeof anotando === 'number' ? anotando : undefined}
          onCerrar={() => setAnotando(null)}
          onGuardado={() => {
            setAnotando(null);
            void cargar();
          }}
        />
      )}
    </>
  );
}
