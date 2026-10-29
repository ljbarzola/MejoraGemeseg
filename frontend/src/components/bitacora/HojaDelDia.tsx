import { useEffect } from 'react';
import type { FilaHoja, HojaDia } from '../../services/bitacora.service';
import { duracion, hora } from '../../utils/bitacoraFechas';
import Kpi from './Kpi';
import ClearFiltersButton from '../common/ClearFiltersButton';
import ColumnFilter, { ChipsFiltros, FilaSinResultados } from '../common/ColumnFilter';
import { useColumnFilters } from '../../hooks/useColumnFilters';
import '../../styles/bitacora.css';

const CLASE_FUENTE: Record<string, string> = {
  APP: 'bit-fuente-app',
  GOOGLE: 'bit-fuente-google',
  EXTENSION: 'bit-fuente-web',
};
const ETIQUETA_FUENTE: Record<string, string> = {
  APP: 'app.gemeseg',
  GOOGLE: 'Google',
  EXTENSION: 'Navegador',
};

function rangoHora(f: FilaHoja): string {
  const inicio = hora(f.desde);
  const fin = hora(f.hasta);
  return inicio === fin ? inicio : `${inicio} – ${fin}`;
}

/** Hoja de un día: primera y última actividad, huecos largos y la lista de lo que quedó registrado. */
export default function HojaDelDia({ hoja }: { hoja: HojaDia }) {
  const largo = hoja.huecos.reduce((m, h) => Math.max(m, h.minutos), 0);
  // Una hoja puede tener decenas de movimientos: filtros en la cabecera de «Dónde» y «Qué hizo».
  const cf = useColumnFilters<FilaHoja>(hoja.filas, [
    {
      key: 'donde', etiqueta: 'Dónde', tipo: 'valores',
      getValues: (f) => (f.fuente === 'GOOGLE' ? { valor: 'Google', etiqueta: 'Google' } : { valor: `app:${f.moduloEtiqueta ?? ''}`, etiqueta: f.moduloEtiqueta ? `app.gemeseg · ${f.moduloEtiqueta}` : 'app.gemeseg' }),
    },
    { key: 'texto', etiqueta: 'Qué hizo', tipo: 'texto', getValue: (f) => f.texto },
  ]);
  // Otra persona u otro día: los filtros de la hoja anterior no valen.
  const { limpiar } = cf;
  useEffect(() => { limpiar(); }, [hoja.filas, limpiar]);
  return (
    <>
      <div className="bit-kpis">
        <Kpi etiqueta="Primera actividad" valor={hoja.primera ? hora(hoja.primera) : '—'} />
        <Kpi etiqueta="Última actividad" valor={hoja.ultima ? hora(hoja.ultima) : '—'} />
        <Kpi etiqueta="Acciones registradas" valor={hoja.totalEventos} />
        <Kpi
          etiqueta="Huecos sin actividad"
          valor={hoja.huecos.length}
          detalle={
            hoja.huecos.length
              ? `El mayor: ${duracion(largo)}`
              : `Silencios de ${duracion(hoja.huecoMinimoMinutos)} o más`
          }
        />
      </div>

      {hoja.huecos.length > 0 && (
        <div className="bit-huecos">
          Huecos de {duracion(hoja.huecoMinimoMinutos)} o más entre una acción y la siguiente:
          <ul>
            {hoja.huecos.map((h) => (
              <li key={h.desde}>
                {hora(h.desde)} a {hora(h.hasta)} ({duracion(h.minutos)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {hoja.filas.length === 0 ? (
        <p className="bit-vacio">No hay actividad registrada este día.</p>
      ) : (
        <>
        <div className="filter-bar">
          <div className="filter-bar-actions">
            <ClearFiltersButton onClear={cf.limpiar} disabled={!cf.hayFiltros} />
          </div>
        </div>
        <ChipsFiltros cf={cf} />
        <div className="tasks-table-wrapper">
          <table className="tasks-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Dónde<ColumnFilter cf={cf} col="donde" orden={cf.ordenDe('donde')} /></th>
                <th>Qué hizo<ColumnFilter cf={cf} col="texto" orden={cf.ordenDe('texto')} /></th>
              </tr>
            </thead>
            <tbody>
              {cf.filas.length === 0 && (
                <FilaSinResultados columnas={3} mensaje="No hay movimientos que coincidan con los filtros." onLimpiar={cf.limpiar} />
              )}
              {cf.filas.map((f) => (
                <tr key={`${f.desde}-${f.fuente}-${f.texto}`} className="tasks-table-row">
                  <td className="tasks-table-title">{rangoHora(f)}</td>
                  <td>
                    <span className={`bit-fuente ${CLASE_FUENTE[f.fuente] ?? 'bit-fuente-app'}`}>
                      {ETIQUETA_FUENTE[f.fuente] ?? 'app.gemeseg'}
                    </span>
                    {f.fuente === 'APP' ? f.moduloEtiqueta : ''}
                  </td>
                  <td>{f.texto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <p className="bit-nota">
        Solo aparece lo que se hace en app.gemeseg (crear, editar o eliminar), lo que Google registra de la cuenta
        (inicio de sesión y Drive) y, si la persona vinculó la extensión, los sitios web (solo el dominio) y el
        tiempo en el navegador dentro del horario. El trabajo en otros programas o fuera de línea no queda en esta hoja.
      </p>
    </>
  );
}
