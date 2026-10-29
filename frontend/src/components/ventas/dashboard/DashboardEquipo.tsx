import { useCallback, useEffect, useState } from 'react';
import { getAnaliticaActividad, type AnaliticaActividad } from '../../../services/ventas.service';
import { Cargando, SinDatos, Tarjeta } from './DashboardBits';

const corto = (s: string) => s.split('-').reverse().slice(0, 2).join('/');

// Actividad del equipo: cuántas notas, llamadas, reuniones y cambios de etapa
// registró cada persona, por semana. Quien no es ADMIN/MANAGER solo ve la suya.
export default function DashboardEquipo({ alcance, desde, hasta }: { alcance: string; desde: string; hasta: string }) {
  const [datos, setDatos] = useState<AnaliticaActividad | null>(null);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setError(false);
    try {
      setDatos(await getAnaliticaActividad({ alcance, desde, hasta }));
    } catch {
      setError(true);
    }
  }, [alcance, desde, hasta]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!datos) return <Cargando error={error} onReintentar={cargar} />;
  const maxSemana = Math.max(1, ...datos.vendedores.flatMap((v) => Object.values(v.porSemana)));

  return (
    <div className="dash-pila">
      <div>
        <Tarjeta titulo="Actividad por vendedor" hint="Notas, llamadas, reuniones y cambios de etapa que registró cada persona en el periodo; la barra de cada semana es relativa a la semana más activa">
          {datos.vendedores.length === 0 ? (
            <SinDatos texto="No hay actividad registrada en este periodo." />
          ) : (
            <div className="tasks-table-wrapper">
              <table className="tasks-table">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Actividades</th>
                    <th>Cambios de etapa</th>
                    <th>Total</th>
                    <th>Por semana (lunes de cada semana)</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.vendedores.map((v) => (
                    <tr key={v.id}>
                      <td className="truncate" style={{ fontWeight: 600 }}>{v.nombre}</td>
                      <td>{v.actividades}</td>
                      <td>{v.cambios}</td>
                      <td><strong>{v.total}</strong></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 34 }}>
                          {datos.semanas.map((s) => {
                            const n = v.porSemana[s] ?? 0;
                            return (
                              <div key={s} title={`Semana del ${corto(s)}: ${n}`} style={{ flex: '0 0 10px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                                <div style={{ height: `${Math.max(n > 0 ? 8 : 2, Math.round((n / maxSemana) * 100))}%`, background: n > 0 ? '#2b6cb0' : '#e2e8f0', borderRadius: 2 }} />
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
