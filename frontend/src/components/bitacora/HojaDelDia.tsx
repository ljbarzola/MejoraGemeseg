import type { FilaHoja, HojaDia } from '../../services/bitacora.service';
import { duracion, hora } from '../../utils/bitacoraFechas';
import Kpi from './Kpi';
import '../../styles/bitacora.css';

function rangoHora(f: FilaHoja): string {
  const inicio = hora(f.desde);
  const fin = hora(f.hasta);
  return inicio === fin ? inicio : `${inicio} – ${fin}`;
}

/** Hoja de un día: primera y última actividad, huecos largos y la lista de lo que quedó registrado. */
export default function HojaDelDia({ hoja }: { hoja: HojaDia }) {
  const largo = hoja.huecos.reduce((m, h) => Math.max(m, h.minutos), 0);
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
        <div className="tasks-table-wrapper">
          <table className="tasks-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Dónde</th>
                <th>Qué hizo</th>
              </tr>
            </thead>
            <tbody>
              {hoja.filas.map((f) => (
                <tr key={`${f.desde}-${f.fuente}-${f.texto}`} className="tasks-table-row">
                  <td className="tasks-table-title">{rangoHora(f)}</td>
                  <td>
                    <span className={`bit-fuente ${f.fuente === 'GOOGLE' ? 'bit-fuente-google' : 'bit-fuente-app'}`}>
                      {f.fuente === 'GOOGLE' ? 'Google' : 'app.gemeseg'}
                    </span>
                    {f.fuente === 'GOOGLE' ? '' : f.moduloEtiqueta}
                  </td>
                  <td>{f.texto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="bit-nota">
        Solo aparece lo que se hace en app.gemeseg (crear, editar o eliminar) y lo que Google registra de la cuenta
        (inicio de sesión y Drive). El trabajo en otros programas o fuera de línea no queda en esta hoja.
      </p>
    </>
  );
}
