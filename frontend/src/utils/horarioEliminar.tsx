import type { ReactNode } from 'react';
import { getHorarioRelacionados } from '../services/contratacion-publica.service';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * El texto de «¿Eliminar este horario?». Un borrador lleva un aviso corto; uno que ya no lo es muestra
 * primero lo que está relacionado (informes, faltas, bitácoras) para que la persona decida con eso a la vista.
 */
export async function mensajeEliminarHorario(id: number, estado: string): Promise<ReactNode> {
  if (estado === 'BORRADOR') {
    return 'Se eliminan el horario y todos sus turnos. Esta acción no se puede deshacer.';
  }
  let lineas: string[] = [];
  try {
    const r = await getHorarioRelacionados(id);
    lineas = [
      ...r.informes.map(
        (i) => `El informe de ${MESES[i.mes - 1]} de ${i.anio} (${i.estado === 'GENERADO' ? 'ya generado' : 'borrador'}) se queda sin horario: su listado de personal saldrá vacío. El informe no se borra.`,
      ),
      ...(r.ausencias ? [`${r.ausencias} falta(s) registradas con «No llegó» en esas fechas: se conservan.`] : []),
      ...(r.bitacoras ? [`${r.bitacoras} bitácora(s) de esas fechas: se conservan, pero ya no tendrán horario con qué compararse.`] : []),
    ];
  } catch {
    lineas = ['No se pudo consultar qué está relacionado con este horario.'];
  }
  return (
    <>
      Este horario está <strong>{estado}</strong> y se eliminará con todos sus turnos.
      {lineas.length === 0 && <span style={{ display: 'block', marginTop: 8 }}>No hay informes, faltas ni bitácoras relacionados.</span>}
      {lineas.map((l, i) => (
        <span key={i} style={{ display: 'block', marginTop: 8 }}>• {l}</span>
      ))}
      <span style={{ display: 'block', marginTop: 12, fontWeight: 700 }}>¿Seguro que quieres eliminarlo? No se puede deshacer.</span>
    </>
  );
}
