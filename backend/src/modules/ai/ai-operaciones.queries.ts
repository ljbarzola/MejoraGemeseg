import { Injectable } from '@nestjs/common';
import { hoyEcuador, sumarDias } from '../bitacora/bitacora-fecha.util';
import { OperacionesPendientesService } from '../operaciones-resumen/operaciones-pendientes.service';
import {
  DIAS_CONTRATO_POR_VENCER,
  fechaCorta,
  lineasDelResumen,
  MAX_EJEMPLOS_AGENTE,
} from '../operaciones-resumen/operaciones-pendientes.util';

// Consultas de datos en vivo del Agente de Operaciones (2026-11-18). SOLO LEEN: reutilizan las mismas
// lecturas que las pantallas de Operaciones y que el resumen diario (OperacionesPendientesService),
// así el chat y el aviso de la mañana nunca se contradicen. Código determinista, nada de SQL libre: el
// modelo solo pone en palabras lo que devuelven estas funciones.

const MAX_LINEAS = 15;

const COBERTURA_TEXTO: Record<string, string> = {
  CUBIERTO: 'cubierto',
  SIN_CUBRIR: 'SIN la cobertura mínima',
  SIN_HORARIO: 'sin horario',
  HORARIO_NO_APROBADO: 'horario todavía sin aprobar',
};
const MOTIVO_TEXTO: Record<string, string> = {
  NO_AVISO: 'no avisó',
  ENFERMEDAD: 'enfermedad',
  PERMISO: 'permiso',
  OTRO: 'otro motivo',
};
const ESTADO_FALTA_TEXTO: Record<string, string> = { POR_CUBRIR: 'por cubrir', CUBIERTA: 'cubierta' };
const RESULTADO_TEXTO: Record<string, string> = {
  CONFORME: 'conformes',
  A_REVISAR: 'a revisar',
  CON_ERRORES: 'con errores',
  SIN_COMPARAR: 'sin comparar',
  SIN_REVISAR: 'sin revisar',
};

function sinTildes(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** «dias:7» llega como texto; solo se acepta un entero entre 1 y `max`. */
export function diasParam(v: unknown, porDefecto: number, max: number): number {
  const n = typeof v === 'string' ? Number.parseInt(v.trim(), 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return porDefecto;
  return Math.min(n, max);
}

const iso = (d: Date | string): string => (typeof d === 'string' ? d : d.toISOString()).slice(0, 10);

@Injectable()
export class AiOperacionesQueries {
  constructor(private readonly pendientes: OperacionesPendientesService) {}

  /** Panorama: todos los temas que hoy tienen algo pendiente. */
  async resumen(companyId: number): Promise<string> {
    const p = await this.pendientes.obtener(companyId, undefined, MAX_EJEMPLOS_AGENTE);
    const lineas = lineasDelResumen(p);
    if (lineas.length === 0) return `Al ${fechaCorta(p.fecha)} Operaciones no tiene nada pendiente en los temas que se vigilan.`;
    return [`Pendientes de Operaciones al ${fechaCorta(p.fecha)}:`, ...lineas].join('\n');
  }

  /** «Hoy en los puestos»: cobertura y quién trabaja, de todos los puestos o de los que coincidan con el texto. */
  async hoy(companyId: number, puesto?: string): Promise<string> {
    const { resumen, puestos } = await this.pendientes.puestosDelDia(companyId);
    if (resumen.puestos === 0) return 'No hay puestos de contratos activos para hoy.';
    const cabecera = `Hoy (${fechaCorta(resumen.fecha)}): ${resumen.puestos} puesto(s), ${resumen.sinCubrir} sin la cobertura mínima, ${resumen.sinHorario} sin horario, ${resumen.faltasSinCubrir} falta(s) sin cubrir.`;

    const texto = puesto ? sinTildes(puesto) : '';
    const elegidos = texto
      ? puestos.filter((p) => sinTildes(`${p.puestoNombre} ${p.entidadNombre} ${p.contratoNumero}`).includes(texto))
      : puestos.filter((p) => p.cobertura === 'SIN_CUBRIR' || p.cobertura === 'SIN_HORARIO' || p.ausentesSinCubrir > 0);
    if (texto && elegidos.length === 0) return `${cabecera}\nNo encontré ningún puesto que coincida con «${puesto}».`;
    if (!texto && elegidos.length === 0) return `${cabecera}\nNingún puesto tiene problemas de cobertura hoy.`;

    const lineas = [cabecera, texto ? 'Puestos que coinciden:' : 'Puestos con problemas hoy:'];
    for (const p of elegidos.slice(0, MAX_LINEAS)) {
      const trabajan = p.trabajando
        .map((g) => `${g.nombre} (${g.codigo}${g.horaInicio && g.horaFin ? ` ${g.horaInicio}-${g.horaFin}` : ''}${g.ausencia ? `, faltó: ${ESTADO_FALTA_TEXTO[g.ausencia.estado] ?? g.ausencia.estado}` : ''})`)
        .join(', ');
      lineas.push(
        `- ${p.puestoNombre} — ${p.entidadNombre}, contrato ${p.contratoNumero}: ${COBERTURA_TEXTO[p.cobertura] ?? p.cobertura} (mínimo ${p.minimo}). ` +
          (trabajan ? `Trabajan: ${trabajan}.` : 'Nadie asignado hoy.') +
          (p.ausentesSinCubrir > 0 ? ` Faltas sin cubrir: ${p.ausentesSinCubrir}.` : ''),
      );
    }
    if (elegidos.length > MAX_LINEAS) lineas.push(`… y ${elegidos.length - MAX_LINEAS} puesto(s) más.`);
    return lineas.join('\n');
  }

  /** Faltas «No llegó» de los últimos N días (7 por defecto). */
  async faltas(companyId: number, dias?: string): Promise<string> {
    const n = diasParam(dias, 7, 31);
    const hoy = hoyEcuador();
    const filas = await this.pendientes.faltas(companyId, sumarDias(hoy, -n), hoy);
    if (filas.length === 0) return `No hay faltas registradas en los últimos ${n} día(s).`;
    const porCubrir = filas.filter((f) => f.estado === 'POR_CUBRIR').length;
    const lineas = [`Faltas de los últimos ${n} día(s): ${filas.length} (${porCubrir} por cubrir, ${filas.length - porCubrir} cubiertas).`];
    for (const f of filas.slice(0, MAX_LINEAS)) {
      lineas.push(
        `- ${fechaCorta(f.fecha)}: ${f.guardiaNombre}, ${f.puestoNombre} (${f.entidadNombre}), ${MOTIVO_TEXTO[f.motivo] ?? f.motivo}, ${ESTADO_FALTA_TEXTO[f.estado] ?? f.estado}${f.reemplazoNombre ? `, lo cubre ${f.reemplazoNombre}` : ''}`,
      );
    }
    if (filas.length > MAX_LINEAS) lineas.push(`… y ${filas.length - MAX_LINEAS} más.`);
    return lineas.join('\n');
  }

  /** Bitácoras de los últimos N días (30 por defecto): cómo salieron, hallazgos abiertos y las que faltan subir. */
  async bitacoras(companyId: number, dias?: string): Promise<string> {
    const n = diasParam(dias, 30, 90);
    const hoy = hoyEcuador();
    const [rango, sinSubir] = await Promise.all([
      this.pendientes.bitacorasDelRango(companyId, sumarDias(hoy, -n), hoy),
      this.pendientes.delDia(companyId, hoy, MAX_EJEMPLOS_AGENTE),
    ]);
    const lineas: string[] = [];
    if (rango.items.length === 0) {
      lineas.push(`No hay bitácoras subidas en los últimos ${n} día(s).`);
    } else {
      const porResultado = new Map<string, number>();
      for (const b of rango.items) porResultado.set(b.resultado, (porResultado.get(b.resultado) ?? 0) + 1);
      lineas.push(
        `Bitácoras de los últimos ${n} día(s): ${rango.total} en total` +
          (rango.total > rango.items.length ? ` (se revisaron las ${rango.items.length} más recientes)` : '') +
          `. ` +
          [...porResultado].map(([r, c]) => `${c} ${RESULTADO_TEXTO[r] ?? r.toLowerCase()}`).join(', ') +
          '.',
      );
      const conHallazgos = rango.items.filter((b) => b.hallazgosAbiertos > 0);
      if (conHallazgos.length > 0) {
        lineas.push(`Con hallazgos abiertos: ${conHallazgos.length}.`);
        for (const b of conHallazgos.slice(0, 10)) {
          lineas.push(
            `- ${b.puestoNombre} (${b.entidadNombre})${b.fechaDesde ? `, desde ${fechaCorta(iso(b.fechaDesde))}` : ''}: ${b.hallazgosAbiertos} abierto(s), ${b.hallazgosAltos} de severidad alta`,
          );
        }
      } else {
        lineas.push('Ninguna tiene hallazgos abiertos.');
      }
    }
    const faltan = sinSubir.bitacorasSinSubir;
    lineas.push(
      faltan.total > 0
        ? `Puestos con bitácoras sin subir esta semana (el horario aprobado esperaba guardias): ${faltan.total}. ${faltan.ejemplos.join('; ')}`
        : 'No hay puestos con bitácoras sin subir esta semana (solo cuenta lo que esperaba un horario aprobado).',
    );
    return lineas.join('\n');
  }

  /** Visitas de supervisión planeadas de la última semana y sin registrar. */
  async supervision(companyId: number): Promise<string> {
    const r = await this.pendientes.visitasSinRegistrar(companyId, 7);
    if (r.puntos.length === 0) return 'No hay visitas de supervisión planeadas sin registrar en los últimos 7 días.';
    const lineas = [`Visitas de supervisión sin registrar (últimos ${r.ventanaDias} días): ${r.puntos.length} punto(s).`];
    for (const p of r.puntos.slice(0, MAX_LINEAS)) {
      lineas.push(
        `- ${p.puestoNombre} — ${p.entidadNombre}, contrato ${p.contratoNumero}: ${p.dias.length} día(s) (${p.dias.map((d) => fechaCorta(d)).join(', ')}), supervisa ${p.supervisorNombre ?? 'sin asignar'}`,
      );
    }
    if (r.puntos.length > MAX_LINEAS) lineas.push(`… y ${r.puntos.length - MAX_LINEAS} más.`);
    return lineas.join('\n');
  }

  /** Armas: estado general y permisos vencidos o por vencer. */
  async armas(companyId: number): Promise<string> {
    const r = await this.pendientes.resumenInventario(companyId);
    const a = r.armas;
    if (a.total === 0) return 'No hay armas registradas en el inventario.';
    const lineas = [
      `Armas vigentes: ${a.total} (${a.asignadas} asignadas, ${a.disponibles} disponibles, ${a.mantenimiento} en mantenimiento). Permisos: ${a.permisosVencidos} vencido(s), ${a.permisosPorVencer} por vencer, ${a.sinPermiso} sin permiso registrado.`,
    ];
    for (const p of r.permisos.slice(0, MAX_LINEAS)) {
      const d = p.diasParaVencer;
      const cuando = d == null ? '' : d < 0 ? `vencido hace ${-d} día(s)` : d === 0 ? 'vence hoy' : `vence en ${d} día(s)`;
      lineas.push(`- Serie ${p.serie} (${p.clase}${p.marca ? ` ${p.marca}` : ''}${p.modelo ? ` ${p.modelo}` : ''}), permiso ${p.permisoNumero ?? 'sin número'}: ${cuando}`);
    }
    if (r.permisos.length > MAX_LINEAS) lineas.push(`… y ${r.permisos.length - MAX_LINEAS} más.`);
    return lineas.join('\n');
  }

  /** Inventario de uniformes, implementos y municiones: lo que está en el mínimo o debajo. */
  async stock(companyId: number): Promise<string> {
    const r = await this.pendientes.resumenInventario(companyId);
    if (r.articulos.total === 0) return 'No hay artículos registrados en el inventario.';
    if (r.reposicion.length === 0) {
      return `Inventario: ${r.articulos.total} artículo(s) activos y ninguno está en su mínimo ni por debajo.`;
    }
    const lineas = [`Inventario: ${r.reposicion.length} de ${r.articulos.total} artículo(s) en el mínimo o debajo.`];
    for (const a of r.reposicion.slice(0, MAX_LINEAS)) {
      lineas.push(`- ${a.nombre}${a.variante ? ` ${a.variante}` : ''}: ${a.enBodega} ${a.unidad ?? ''} en bodega, mínimo ${a.stockMinimo}${a.reponer ? `, conviene reponer ${a.reponer}` : ''}`.replace(/\s+/g, ' '));
    }
    if (r.reposicion.length > MAX_LINEAS) lineas.push(`… y ${r.reposicion.length - MAX_LINEAS} más.`);
    return lineas.join('\n');
  }

  /** Contratos activos que vencen en los próximos 30 días o ya vencieron sin cerrarse (cuenta las adendas). */
  async contratos(companyId: number): Promise<string> {
    const t = await this.pendientes.contratosPorVencer(companyId, hoyEcuador(), MAX_EJEMPLOS_AGENTE);
    if (t.total === 0) return `Ningún contrato activo vence en los próximos ${DIAS_CONTRATO_POR_VENCER} días ni está vencido sin cerrar.`;
    return [`Contratos por vencer o vencidos sin cerrar (próximos ${DIAS_CONTRATO_POR_VENCER} días): ${t.total}.`, ...t.ejemplos.map((e) => `- ${e}`), ...(t.total > t.ejemplos.length ? [`… y ${t.total - t.ejemplos.length} más.`] : [])].join('\n');
  }
}
