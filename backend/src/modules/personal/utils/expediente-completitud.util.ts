// Una sola cuenta para la tabla de candidatos y para el expediente.
// Un documento obligatorio solo suma al 100% cuando está subido y aprobado.
// Rechazado o sin revisar no llega a 100%.

export interface SlotExpediente {
  nombre: string;
  obligatorio: boolean;
  driveFileId: string | null;
  // Nombre con el que el portal lo declaró en candidato.json, aunque el
  // archivo de Drive no haya coincidido todavía con el rótulo de la vacante.
  nombreEnJson?: string | null;
}

export interface ResumenExpediente {
  completitudPercent: number;
  archivosSubidosCount: number;
  archivosRequeridosCount: number;
  documentosRechazados: number;
  documentosPendientesRevision: number;
}

export function resumirExpediente(
  slots: SlotExpediente[],
  reviews?: Map<string, string>,
): ResumenExpediente {
  let rechazados = 0;
  let pendientes = 0;
  let aprobadosObligatorios = 0;
  let presentes = 0;
  const obligatorios = slots.filter((s) => s.obligatorio);

  for (const slot of slots) {
    if (!slot.driveFileId) continue;
    presentes++;
    const status = reviews?.get(slot.driveFileId);
    if (status === 'RECHAZADO') rechazados++;
    else if (status === 'APROBADO') {
      if (slot.obligatorio) aprobadosObligatorios++;
    } else pendientes++;
  }

  const completitudPercent =
    obligatorios.length === 0
      ? slots.length === 0
        ? 0
        : 100
      : Math.min(
          100,
          Math.round((aprobadosObligatorios / obligatorios.length) * 100),
        );

  return {
    completitudPercent,
    archivosSubidosCount: presentes,
    archivosRequeridosCount: slots.length,
    documentosRechazados: rechazados,
    documentosPendientesRevision: pendientes,
  };
}
