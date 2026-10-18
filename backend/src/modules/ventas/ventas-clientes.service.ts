import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_SUBSERVICIOS } from './ventas-subservicios.const';
import { ETAPA_GANADA, ETAPA_PERDIDA } from './stage-outcome.util';
import { parseSiguientePaso } from './siguiente-paso.util';
import { NotificationsService } from '../notifications/notifications.service';
import { GmailMailService } from '../mail/gmail-mail.service';
import { VentasOportunidadesService } from './ventas-oportunidades.service';
import { VentasSchemaService } from './ventas-schema.service';
import { VentasCicloService } from './ventas-ciclo.service';
import { DEFAULT_STAGES } from './ventas-etapas.const';
import { ETIQUETA_SUBSERVICIO } from './ventas-servicios.util';
import {
  ACTIVITY_TYPES,
  CreateReferralDto,
  ChangeSalesClientStageDto,
  CreateSalesClientActivityDto,
  CreateSalesClientStageDto,
  MarkSalesClientDoneDto,
  UpdateSalesClientActivityDto,
  UpdateSalesClientStageDto,
  SalesClientFieldOptionDto,
  CreateSalesContactDto,
  UpdateSalesContactDto,
} from './dto/client.dto';
import { nombresParecidos } from './nombre-similar.util';

// Dashboard: etapas "ganada"/"perdida" por clave (decisión de Ventas: en
// producción siempre existen ACEPTADO y RECHAZADO como etapas finales) y
// cuántos días en la misma etapa hacen a un cliente "estancado".
const DIAS_ESTANCADO = 7;
const MAX_ESTANCADOS_LISTADOS = 10;
const MAX_SEMANAS_SERIE = 12;
const DIA_MS = 24 * 60 * 60 * 1000;

const esDiaValido = (s?: string): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00.000Z`));
const diaUtc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const aDia = (d: Date) => d.toISOString().slice(0, 10);
// Lunes (UTC) de la semana de un día 'YYYY-MM-DD'.
function lunesDe(dia: string): Date {
  const d = diaUtc(dia);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DIA_MS);
}

const MAX_ACTIVITY_TEXT = 2000;
const MAX_ACTIVITY_OTHER_LABEL = 40;

// Valida y normaliza el tipo de una actividad. `OTRO` exige una etiqueta; en
// cualquier otro tipo la etiqueta se descarta.
function normalizarTipoActividad(
  type: string | undefined,
  otherLabel: string | undefined,
): { type: string; otherLabel: string | null } {
  const tipo = (type || '').trim().toUpperCase();
  if (!(ACTIVITY_TYPES as readonly string[]).includes(tipo)) {
    throw new BadRequestException('Elige un tipo de actividad válido.');
  }
  if (tipo !== 'OTRO') return { type: tipo, otherLabel: null };
  const etiqueta = (otherLabel || '').trim();
  if (!etiqueta) {
    throw new BadRequestException('Escribe cómo quieres llamar a esta actividad.');
  }
  if (etiqueta.length > MAX_ACTIVITY_OTHER_LABEL) {
    throw new BadRequestException(
      `El nombre de la actividad no puede pasar de ${MAX_ACTIVITY_OTHER_LABEL} caracteres.`,
    );
  }
  return { type: tipo, otherLabel: etiqueta };
}

function normalizarTextoActividad(text: string | undefined): string {
  const limpio = (text || '').trim();
  if (!limpio) throw new BadRequestException('Escribe qué se hizo.');
  if (limpio.length > MAX_ACTIVITY_TEXT) {
    throw new BadRequestException(
      `El texto no puede pasar de ${MAX_ACTIVITY_TEXT} caracteres.`,
    );
  }
  return limpio;
}

export const SERVICIO_KEY = 'servicio_requerido';
export const SUBSERVICIOS_KEY = 'subservicios_requeridos';
// Lista desplegable cuyas opciones pueden traer casillas (children).
// La opción elegida vive en extra[key]; las casillas, en extra[key__sub].
export const LISTA_SUBOPCIONES = 'LISTA_SUBOPCIONES';

export function subopcionesKey(fieldKey: string): string {
  return `${fieldKey}__sub`;
}

type OpcionConHijos = {
  key: string;
  label: string;
  children?: { key: string; label: string }[];
};

export { DEFAULT_SUBSERVICIOS };

// Devuelve las opciones con los sub-servicios por defecto en las que aún no
// tienen `children`, y si algo cambió (para no escribir en BD sin necesidad).
export function conSubserviciosPorDefecto(options: OpcionConHijos[]): {
  options: OpcionConHijos[];
  changed: boolean;
} {
  let changed = false;
  const result = options.map((o) => {
    if (o.children === undefined && DEFAULT_SUBSERVICIOS[o.key]) {
      changed = true;
      return { ...o, children: DEFAULT_SUBSERVICIOS[o.key].map((c) => ({ ...c })) };
    }
    return o;
  });
  return { options: result, changed };
}

// Valida casillas hijas contra la opción padre elegida. Siempre opcional:
// vacío es válido y devuelve ''. Devuelve las keys unidas por coma.
function normalizarHijos(
  options: OpcionConHijos[],
  padre: string | undefined,
  raw: string[] | string | undefined | null,
  mensaje: string,
): string {
  const keys = (Array.isArray(raw) ? raw : (raw || '').split(','))
    .map((k) => k.trim())
    .filter(Boolean);
  if (keys.length === 0) return '';
  const permitidas = new Set(
    (options.find((o) => o.key === padre)?.children || []).map((c) => c.key),
  );
  if (permitidas.size === 0 || keys.some((k) => !permitidas.has(k))) {
    throw new BadRequestException(mensaje);
  }
  return [...new Set(keys)].join(',');
}

// Formato histórico de extra.subservicios_requeridos. Las casillas de Servicio
// requerido ahora viven en extra.servicio_requerido__sub (LISTA_SUBOPCIONES).
export function normalizarSubservicios(
  servicioOptions: OpcionConHijos[],
  servicio: string | undefined,
  raw: string[] | string | undefined | null,
): string {
  return normalizarHijos(
    servicioOptions,
    servicio,
    raw,
    'Los sub-servicios elegidos no corresponden al servicio requerido. Vuelve a seleccionarlos.',
  );
}

// Formato de extra[clave__sub] en un campo LISTA_SUBOPCIONES.
export function normalizarSubopciones(
  options: OpcionConHijos[],
  opcion: string | undefined,
  raw: string[] | string | undefined | null,
): string {
  return normalizarHijos(
    options,
    opcion,
    raw,
    'Las subopciones elegidas no corresponden a la opción seleccionada. Vuelve a seleccionarlas.',
  );
}

// El campo aparte "Sub-servicios" se retiró: sus casillas son las subopciones
// de Servicio requerido. Copia el valor viejo a extra.servicio_requerido__sub
// si todavía no hay uno, y quita la clave vieja.
export function trasladarSubserviciosLegado(
  extra: Record<string, string>,
): Record<string, string> {
  if (!(SUBSERVICIOS_KEY in extra)) return extra;
  const next = { ...extra };
  const viejo = (next[SUBSERVICIOS_KEY] || '').trim();
  const subKey = subopcionesKey(SERVICIO_KEY);
  if (viejo && !next[subKey]) next[subKey] = viejo;
  delete next[SUBSERVICIOS_KEY];
  return next;
}

// Fecha de ingreso ('YYYY-MM-DD') -> instante a guardar en createdAt.
// Mediodía UTC = 07:00 en Ecuador, el mismo día en ambos husos (misma idea
// que parseSiguientePaso: que el día no se corra por zona horaria).
const ECUADOR_OFFSET_MS = 5 * 60 * 60 * 1000;
const diaEcuador = (d: Date) => new Date(d.getTime() - ECUADOR_OFFSET_MS).toISOString().slice(0, 10);

export function parseFechaIngreso(raw: string | undefined | null, ahora: Date = new Date()): Date | undefined {
  const dia = (raw || '').trim();
  if (!dia) return undefined;
  const fecha = new Date(`${dia}T12:00:00.000Z`);
  // Además de leerse, el día tiene que existir: según la versión de Node,
  // "2026-02-31" se lee como una fecha válida y se corre a marzo en silencio.
  // Si al volver a escribirla no da el mismo día, no es una fecha real.
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dia) ||
    Number.isNaN(fecha.getTime()) ||
    fecha.toISOString().slice(0, 10) !== dia
  ) {
    throw new BadRequestException('La fecha de ingreso no es válida.');
  }
  if (dia > diaEcuador(ahora)) {
    throw new BadRequestException('La fecha de ingreso no puede ser futura.');
  }
  return new Date(`${dia}T12:00:00.000Z`);
}

// En edición solo se reescribe si el DÍA cambió respecto al guardado, para
// no perder la hora original al guardar otros cambios.
export function fechaIngresoParaEditar(
  raw: string | undefined | null,
  actual: Date,
  ahora: Date = new Date(),
): Date | undefined {
  const nueva = parseFechaIngreso(raw, ahora);
  if (!nueva) return undefined;
  return diaEcuador(nueva) === diaEcuador(actual) ? undefined : nueva;
}

export const CORE_CLIENT_FIELDS = [
  { key: 'name', label: 'Nombre / Razón social', fieldType: 'TEXT' },
  { key: 'email', label: 'Email', fieldType: 'EMAIL' },
  { key: 'phone', label: 'Teléfono', fieldType: 'TEXT' },
  { key: 'ruc', label: 'Cédula / RUC', fieldType: 'TEXT' },
  { key: 'address', label: 'Dirección', fieldType: 'TEXT' },
  {
    key: 'fuente',
    label: 'Fuente',
    fieldType: LISTA_SUBOPCIONES,
    options: [
      { key: 'REFERIDO', label: 'Referido' },
      { key: 'CAMPANA', label: 'Campaña' },
      { key: 'OTRO', label: 'Otro' },
    ],
    // "Otro" con texto libre — igual que SalesTemplateField.allowOther en
    // Contratos: el valor tipeado se guarda literal en extra.fuente, sin
    // prefijo ni key especial (ver ClienteFormModal.tsx ExtraField).
    allowOther: true,
  },
  {
    key: 'servicio_requerido',
    label: 'Servicio requerido',
    fieldType: LISTA_SUBOPCIONES,
    options: [
      { key: 'MONITOREO', label: 'Monitoreo' },
      { key: 'SOLUCIONES_TECNOLOGICAS', label: 'Soluciones Tecnológicas' },
      { key: 'SEGURIDAD_FISICA', label: 'Seguridad Física' },
    ],
  },
  // Antes era un <textarea> aparte, fuera del sistema de campos — ahora es
  // un campo núcleo más, para que el formulario y el picker de columnas lo
  // traten igual que a cualquier otro (ver ClienteFormModal.tsx).
  { key: 'observaciones', label: 'Observaciones', fieldType: 'TEXTAREA' },
] as const;

const MAX_BLOCKING_CLIENTS_LISTED = 20;

// parseSiguientePaso vive en siguiente-paso.util.ts (lo comparten clientes y
// oportunidades); se re-exporta para no romper a quien lo importaba de aquí.
export { parseSiguientePaso };

// `creator` = quién creó el registro (auditoría, puede ser un empleado
// cualquiera que refirió). `assignedUser` = "Responsable", quién de Ventas
// atiende la venta. `referredBy` = a quién se le da crédito/se notifica si
// la fuente es un referido. Los tres son conceptos distintos, ver el
// comentario en SalesClient.assignedUserId en schema.prisma.
const CLIENT_INCLUDE = {
  creator: { select: { id: true, fullName: true } },
  assignedUser: { select: { id: true, fullName: true } },
  referredBy: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class VentasClientesService {
  private readonly logger = new Logger(VentasClientesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly gmailMailService: GmailMailService,
    private readonly oportunidades: VentasOportunidadesService,
    private readonly esquema: VentasSchemaService,
    private readonly ciclos: VentasCicloService,
  ) {}

  // ---------- Campos personalizables ----------

  // Idempotente: además de crear los campos núcleo que falten, corrige
  // `order`/`fieldType` de los que ya existen para que siempre respeten
  // CORE_CLIENT_FIELDS (Nombre, Email, Teléfono, RUC, Dirección, Fuente,
  // Servicio requerido, Observaciones) — así un campo nuevo que
  // Ventas agregue siempre queda después de Observaciones (order = max + 1),
  // sin importar en qué momento se sembró cada campo núcleo para esta
  // empresa. OJO: `label`, `options` y `allowOther` NO se resincronizan
  // nunca — son contenido que Ventas edita (renombrar el campo, agregar/quitar
  // opciones, el checkbox "Permitir Otro"), y machacarlos acá borraría esa
  // personalización (así el checkbox dejó de funcionar en Fuente y Servicio
  // requerido hasta 2026-10-02). `allowOther` de fábrica solo se usa al crear.
  async ensureCoreFields(companyId: number) {
    const existing = await this.prisma.salesClientField.findMany({
      where: { companyId, isCore: true },
    });
    const byKey = new Map(existing.map((f) => [f.key, f]));
    for (let i = 0; i < CORE_CLIENT_FIELDS.length; i++) {
      const core = CORE_CLIENT_FIELDS[i];
      const current = byKey.get(core.key);
      const allowOther = 'allowOther' in core ? core.allowOther : false;
      const baseOptions = 'options' in core ? [...core.options] : [];
      if (!current) {
        await this.prisma.salesClientField.create({
          data: {
            companyId,
            key: core.key,
            label: core.label,
            fieldType: core.fieldType,
            options: (core.key === SERVICIO_KEY
              ? conSubserviciosPorDefecto(baseOptions).options
              : baseOptions) as any,
            allowOther,
            isCore: true,
            order: i,
          },
        });
      } else {
        // Empresas que ya tenían "Servicio requerido": se les siembran los
        // sub-servicios solo en las opciones que aún no tienen `children`.
        const sembrado =
          core.key === SERVICIO_KEY
            ? conSubserviciosPorDefecto(
                (Array.isArray(current.options) ? current.options : []) as OpcionConHijos[],
              )
            : null;
        if (
          current.order !== i ||
          current.fieldType !== core.fieldType ||
          sembrado?.changed
        ) {
          await this.prisma.salesClientField.update({
            where: { id: current.id },
            data: {
              order: i,
              fieldType: core.fieldType,
              ...(sembrado?.changed ? { options: sembrado.options as any } : {}),
            },
          });
        }
      }
    }
    await this.retirarCampoSubservicios(companyId);
  }

  // "Sub-servicios" era un campo núcleo aparte. Sus casillas ya viven dentro
  // de cada opción de Servicio requerido, así que el campo se borra y el
  // valor guardado en los clientes pasa a extra.servicio_requerido__sub.
  // Corre una sola vez por empresa: cuando la fila ya no existe, no hace nada.
  private async retirarCampoSubservicios(companyId: number) {
    const campo = await this.prisma.salesClientField.findFirst({
      where: { companyId, key: SUBSERVICIOS_KEY },
    });
    if (!campo) return;
    const clientes = await this.prisma.salesClient.findMany({
      where: { companyId },
      select: { id: true, extra: true },
    });
    for (const cliente of clientes) {
      const actual =
        cliente.extra && typeof cliente.extra === 'object' && !Array.isArray(cliente.extra)
          ? (cliente.extra as Record<string, string>)
          : {};
      if (!(SUBSERVICIOS_KEY in actual)) continue;
      await this.prisma.salesClient.update({
        where: { id: cliente.id },
        data: { extra: trasladarSubserviciosLegado(actual) },
      });
    }
    await this.prisma.salesClientField.deleteMany({ where: { id: campo.id } });
  }

  // Etapas por defecto del pipeline de Clientes — misma idea que
  // ensureCoreFields: se siembran solas la primera vez que hacen falta, no
  // hace falta backfill manual ni tocar la creación de empresa.
  async ensureDefaultStages(companyId: number) {
    const count = await this.prisma.salesClientStage.count({
      where: { companyId },
    });
    if (count > 0) return;
    await this.prisma.salesClientStage.createMany({
      data: DEFAULT_STAGES.map((s) => ({ companyId, ...s })),
    });
  }

  async listFields(companyId: number | null) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    await this.ensureCoreFields(companyId);
    return this.prisma.salesClientField.findMany({
      where: { companyId },
      orderBy: [{ isCore: 'desc' }, { order: 'asc' }, { id: 'asc' }],
    });
  }

  async addField(
    companyId: number | null,
    dto: {
      label: string;
      key?: string;
      fieldType?: string;
      order?: number;
      options?: SalesClientFieldOptionDto[];
      allowOther?: boolean;
    },
  ) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    await this.ensureCoreFields(companyId);
    const label = (dto.label || '').trim();
    if (!label) throw new BadRequestException('La etiqueta es requerida');
    const key =
      (dto.key || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') ||
      label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 40);
    if (!key)
      throw new BadRequestException(
        'No se pudo generar una clave para el campo',
      );
    const exists = await this.prisma.salesClientField.findFirst({
      where: { companyId, key },
    });
    if (exists)
      throw new BadRequestException(`Ya existe un campo con la clave "${key}"`);
    const maxOrder = await this.prisma.salesClientField.aggregate({
      where: { companyId },
      _max: { order: true },
    });
    return this.prisma.salesClientField.create({
      data: {
        companyId,
        key,
        label,
        fieldType: dto.fieldType || 'TEXT',
        options: dto.options ? (dto.options as any) : [],
        allowOther: dto.allowOther ?? false,
        isCore: false,
        order: dto.order ?? (maxOrder._max.order ?? 0) + 1,
      },
    });
  }

  async updateField(
    companyId: number | null,
    fieldId: number,
    dto: {
      label?: string;
      options?: SalesClientFieldOptionDto[];
      allowOther?: boolean;
      order?: number;
    },
  ) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    const field = await this.prisma.salesClientField.findFirst({
      where: { id: fieldId, companyId },
    });
    if (!field) throw new NotFoundException('Campo no encontrado');
    return this.prisma.salesClientField.update({
      where: { id: fieldId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.options !== undefined ? { options: dto.options as any } : {}),
        ...(dto.allowOther !== undefined ? { allowOther: dto.allowOther } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
  }

  async deleteField(companyId: number | null, fieldId: number) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    const field = await this.prisma.salesClientField.findFirst({
      where: { id: fieldId, companyId },
    });
    if (!field) throw new NotFoundException('Campo no encontrado');
    if (field.isCore)
      throw new BadRequestException('No se puede eliminar un campo núcleo');
    await this.prisma.salesClientField.delete({ where: { id: field.id } });
    return { success: true };
  }

  // ---------- Etapas del pipeline ----------

  async listStages(companyId: number) {
    await this.ensureDefaultStages(companyId);
    return this.prisma.salesClientStage.findMany({
      where: { companyId },
      orderBy: { order: 'asc' },
    });
  }

  // Reglas de integridad del pipeline, comunes a cualquier módulo con
  // etapas editables (mismo chequeo se aplica en ComplaintStageService):
  // una etapa no puede ser inicial y final a la vez, y la inicial nunca
  // puede quedar en el mismo lugar o después de una final — si no, un
  // cliente nuevo "nacería" ya cerrado o después de haberse cerrado.
  // Corre DENTRO de la transacción que hizo el cambio: si algo no cuadra,
  // lanza y el `$transaction` revierte todo el escrito.
  private async validarIntegridadEtapas(
    tx: Prisma.TransactionClient,
    companyId: number,
  ) {
    const stages = await tx.salesClientStage.findMany({ where: { companyId } });
    if (stages.length === 0) return;

    const iniciales = stages.filter((s) => s.isInitial);
    const finales = stages.filter((s) => s.isFinal);

    const ambas = iniciales.find((s) => s.isFinal);
    if (ambas) {
      throw new BadRequestException(
        `La etapa "${ambas.label}" no puede ser inicial y final al mismo tiempo.`,
      );
    }

    if (iniciales.length === 0) {
      throw new BadRequestException(
        'Debe existir una etapa inicial. Marca alguna etapa como inicial.',
      );
    }

    if (finales.length > 0) {
      const ordenInicial = iniciales[0].order;
      const ordenMinimoFinal = Math.min(...finales.map((s) => s.order));
      if (ordenInicial >= ordenMinimoFinal) {
        throw new BadRequestException(
          'La etapa inicial no puede ir después (ni en el mismo lugar) de una etapa final.',
        );
      }
    }
  }

  async createStage(companyId: number, data: CreateSalesClientStageDto) {
    const existing = await this.prisma.salesClientStage.findFirst({
      where: { companyId, key: data.key },
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe una etapa con la clave "${data.key}"`,
      );
    }
    if (data.isInitial && data.isFinal) {
      throw new BadRequestException(
        'Una etapa no puede ser inicial y final al mismo tiempo.',
      );
    }
    const count = await this.prisma.salesClientStage.count({
      where: { companyId },
    });

    // La primera etapa de la empresa es siempre la inicial (si no, la
    // validación la rechazaría por falta de etapa inicial).
    const esPrimera = count === 0;
    const isInitial = esPrimera ? true : (data.isInitial ?? false);
    const isFinal = esPrimera ? false : (data.isFinal ?? false);

    return this.prisma.$transaction(async (tx) => {
      if (isInitial) {
        await tx.salesClientStage.updateMany({
          where: { companyId, isInitial: true },
          data: { isInitial: false },
        });
      }
      const created = await tx.salesClientStage.create({
        data: {
          companyId,
          key: data.key,
          label: data.label.trim(),
          color: data.color || '#718096',
          order: data.order ?? count,
          isInitial,
          isFinal,
        },
      });
      await this.validarIntegridadEtapas(tx, companyId);
      return created;
    });
  }

  async updateStage(
    id: number,
    companyId: number,
    data: UpdateSalesClientStageDto,
  ) {
    const stage = await this.prisma.salesClientStage.findFirst({
      where: { id, companyId },
    });
    if (!stage) throw new NotFoundException('Etapa no encontrada');
    if (
      (data.isInitial ?? stage.isInitial) &&
      (data.isFinal ?? stage.isFinal)
    ) {
      throw new BadRequestException(
        'Una etapa no puede ser inicial y final al mismo tiempo.',
      );
    }
    if (data.isInitial === false && stage.isInitial) {
      throw new BadRequestException(
        'No se puede quitar la etapa inicial. Marca otra etapa como inicial en su lugar.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (data.isInitial) {
        await tx.salesClientStage.updateMany({
          where: { companyId, isInitial: true, id: { not: id } },
          data: { isInitial: false },
        });
      }
      const updated = await tx.salesClientStage.update({
        where: { id },
        data: {
          ...(data.label !== undefined ? { label: data.label.trim() } : {}),
          ...(data.color !== undefined ? { color: data.color } : {}),
          ...(data.order !== undefined ? { order: data.order } : {}),
          ...(data.isFinal !== undefined ? { isFinal: data.isFinal } : {}),
          ...(data.isInitial !== undefined
            ? { isInitial: data.isInitial }
            : {}),
        },
      });
      await this.validarIntegridadEtapas(tx, companyId);
      return updated;
    });
  }

  async deleteStage(id: number, companyId: number) {
    const stage = await this.prisma.salesClientStage.findFirst({
      where: { id, companyId },
    });
    if (!stage) throw new NotFoundException('Etapa no encontrada');

    const otras = await this.prisma.salesClientStage.count({
      where: { companyId, id: { not: id } },
    });
    if (stage.isInitial && otras > 0) {
      throw new BadRequestException(
        'No se puede eliminar la etapa inicial. Marca otra etapa como inicial antes de eliminar esta.',
      );
    }

    const blockingCount = await this.prisma.salesClient.count({
      where: { companyId, status: stage.key },
    });
    // Las oportunidades también guardan su etapa por clave (sin FK): una que
    // quede apuntando a una etapa borrada se vería «sin etapa» sin explicación.
    const oppsEnEtapa = this.esquema.isReady()
      ? await this.prisma.salesOpportunity.count({
          where: { companyId, status: stage.key },
        })
      : 0;
    if (oppsEnEtapa > 0 && blockingCount === 0 && otras > 0) {
      throw new BadRequestException(
        `No se puede eliminar la etapa "${stage.label}": hay ${oppsEnEtapa} oportunidad(es) en ella. Muévelas a otra etapa antes de eliminarla.`,
      );
    }
    if (oppsEnEtapa > 0 && otras === 0) {
      await this.prisma.salesOpportunity.updateMany({
        where: { companyId, status: stage.key },
        data: { status: null },
      });
    }
    if (blockingCount > 0 && otras === 0) {
      await this.prisma.salesClient.updateMany({
        where: { companyId, status: stage.key },
        data: { status: null },
      });
    } else if (blockingCount > 0) {
      const blocking = await this.prisma.salesClient.findMany({
        where: { companyId, status: stage.key },
        take: MAX_BLOCKING_CLIENTS_LISTED,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true },
      });
      const items = blocking.map((c) => `#${c.id} — ${c.name}`);
      const extra = blockingCount - blocking.length;
      const suffix = extra > 0 ? ` y ${extra} más` : '';
      throw new BadRequestException(
        `No se puede eliminar la etapa "${stage.label}": hay ${blockingCount} cliente(s) en ella. ` +
          `Muévelos a otra etapa antes de eliminarla: ${items.join('; ')}${suffix}.`,
      );
    }

    return this.prisma.salesClientStage.delete({ where: { id } });
  }

  // Desde 2026-10-07 la etapa vive en la oportunidad: esta ruta (que sigue
  // existiendo para no romper pestañas abiertas ni enlaces) cambia la etapa de
  // la oportunidad principal del cliente. Si por alguna razón las tablas nuevas
  // no están listas, se conserva el comportamiento de antes.
  async changeStage(
    id: number,
    dto: ChangeSalesClientStageDto,
    companyId: number,
    userId: number,
  ) {
    if (this.esquema.isReady()) {
      return this.oportunidades.cambiarEtapaDeCliente(id, dto, companyId, userId);
    }
    return this.changeStageSinOportunidades(id, dto, companyId, userId);
  }

  private async changeStageSinOportunidades(
    id: number,
    dto: ChangeSalesClientStageDto,
    companyId: number,
    userId: number,
  ) {
    const client = await this.prisma.salesClient.findFirst({
      where: { id, companyId },
    });
    if (!client) throw new NotFoundException('No se encontró en el Directorio');
    if (client.status === dto.toStatus) {
      throw new BadRequestException('Ya está en esa etapa');
    }

    const targetStage = await this.prisma.salesClientStage.findFirst({
      where: { companyId, key: dto.toStatus },
    });
    if (!targetStage) {
      throw new BadRequestException(
        `La etapa "${dto.toStatus}" no existe en esta empresa`,
      );
    }

    // En una etapa final (aceptado/rechazado) ya no hay nada que dar
    // seguimiento: se borra el siguiente paso aunque venga uno en el body.
    const siguientePaso = targetStage.isFinal
      ? { nextActionText: null, nextActionDate: null }
      : parseSiguientePaso(dto);

    const [, updated] = await this.prisma.$transaction([
      this.prisma.salesClientStageChange.create({
        data: {
          salesClientId: id,
          fromStatus: client.status,
          toStatus: dto.toStatus,
          notes: dto.notes?.trim() || null,
          changedBy: userId,
          companyId,
        },
      }),
      this.prisma.salesClient.update({
        where: { id },
        data: { status: dto.toStatus, ...siguientePaso },
      }),
    ]);

    if (client.referredByUserId) {
      await this.oportunidades.notificarReferidor(
        client.id,
        client.name,
        client.referredByUserId,
        companyId,
        targetStage.label,
      );
    }

    return updated;
  }

  // ---------- Referidos (formulario abierto) ----------

  async createReferral(
    dto: CreateReferralDto,
    companyId: number,
    userId: number,
  ) {
    if (!dto.nombre?.trim() || dto.nombre.trim().length < 3) {
      throw new BadRequestException('Escribe el nombre completo del referido.');
    }
    await this.ensureCoreFields(companyId);
    await this.ensureDefaultStages(companyId);

    const initialStage = await this.prisma.salesClientStage.findFirst({
      where: { companyId, isInitial: true },
    });

    const extra: Record<string, string> = { fuente: 'REFERIDO' };
    if (dto.servicioRequerido) extra[SERVICIO_KEY] = dto.servicioRequerido;
    if (dto.subserviciosRequeridos?.length) {
      extra[subopcionesKey(SERVICIO_KEY)] = dto.subserviciosRequeridos.join(',');
    }
    await this.validarSubopcionesDeExtra(companyId, extra);

    const serviceIds = this.esquema.isReady()
      ? await this.oportunidades.idsServiciosDesdeExtra(companyId, extra)
      : [];
    return this.prisma.$transaction(async (tx) => {
      const cliente = await tx.salesClient.create({
        data: {
          companyId,
          createdBy: userId,
          name: dto.nombre.trim(),
          phone: dto.celular?.trim() || null,
          email: dto.correo?.trim() || null,
          observaciones: dto.nota?.trim() || null,
          extra,
          referredByUserId: userId,
          status: initialStage?.key ?? null,
        },
      });
      // Un referido entra directo como cliente + oportunidad (ya viene
      // recomendado por alguien de la empresa, no necesita pasar por Leads).
      if (this.esquema.isReady()) {
        await this.oportunidades.crearInicial(tx, {
          companyId,
          salesClientId: cliente.id,
          status: cliente.status,
          createdBy: userId,
          referredByUserId: userId,
          source: 'REFERIDO',
          originType: 'REFERIDO',
          serviceIds,
        });
      }
      return cliente;
    });
  }

  async listMyReferrals(userId: number, companyId: number) {
    const clients = await this.prisma.salesClient.findMany({
      where: { referredByUserId: userId, companyId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const stages = await this.prisma.salesClientStage.findMany({
      where: { companyId },
    });
    const stageByKey = new Map(stages.map((s) => [s.key, s]));
    return clients.map((c) => ({
      ...c,
      stage: c.status ? (stageByKey.get(c.status) ?? null) : null,
    }));
  }

  // ---------- Clientes ----------

  async listClients(companyId: number | null) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    await this.ensureCoreFields(companyId);
    await this.ensureDefaultStages(companyId);
    const clients = await this.prisma.salesClient.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      include: CLIENT_INCLUDE,
    });
    const stages = await this.prisma.salesClientStage.findMany({
      where: { companyId },
    });
    const stageByKey = new Map(stages.map((s) => [s.key, s]));
    // Ciclo de vida calculado (Prospecto / Cliente / En riesgo / Ex-cliente /
    // Perdido). Si las tablas nuevas no están listas, se omite y la pantalla no
    // lo muestra, en vez de fallar.
    const ciclos = this.esquema.isReady()
      ? await this.ciclos.calcular(companyId)
      : null;
    return clients.map((c) => ({
      ...c,
      stage: c.status ? (stageByKey.get(c.status) ?? null) : null,
      ciclo: ciclos?.get(c.id)?.ciclo ?? null,
      cicloRazones: ciclos?.get(c.id)?.razones ?? [],
      contratoPendiente: ciclos?.get(c.id)?.contratoPendiente ?? false,
      oportunidadesAbiertas: ciclos?.get(c.id)?.oportunidadesAbiertas ?? 0,
    }));
  }

  async getClient(companyId: number | null, id: number) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    const client = await this.prisma.salesClient.findFirst({
      where: { id, companyId },
      include: CLIENT_INCLUDE,
    });
    if (!client) throw new NotFoundException('No se encontró en el Directorio');
    return client;
  }

  // Cada campo LISTA_SUBOPCIONES guarda las casillas en extra[clave__sub].
  // Siempre opcionales. Reescribe el valor ya normalizado (sin duplicados).
  private async validarSubopcionesDeExtra(
    companyId: number,
    extra: Record<string, string>,
  ) {
    await this.ensureCoreFields(companyId);
    const campos = await this.prisma.salesClientField.findMany({
      where: { companyId, fieldType: LISTA_SUBOPCIONES },
    });
    for (const campo of campos) {
      const subKey = subopcionesKey(campo.key);
      if (!extra[subKey]) continue;
      const opciones = (Array.isArray(campo.options) ? campo.options : []) as OpcionConHijos[];
      extra[subKey] = normalizarSubopciones(opciones, extra[campo.key], extra[subKey]);
    }
  }

  async createClient(companyId: number | null, createdBy: number, dto: any) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    if (!dto?.name?.trim())
      throw new BadRequestException('El nombre es requerido');
    await this.ensureCoreFields(companyId);
    await this.ensureDefaultStages(companyId);
    const soloDatos = dto.soloDatos === true;
    const yaEsCliente = !soloDatos && dto.yaEsCliente === true;
    // Solo datos: sin etapa (la etapa es de la oportunidad). Un cliente que ya
    // contrataba nace en la etapa ganada; uno nuevo, en la inicial.
    const initialStage = soloDatos
      ? null
      : yaEsCliente
      ? ((await this.prisma.salesClientStage.findFirst({
          where: { companyId, key: ETAPA_GANADA },
        })) ??
        (await this.prisma.salesClientStage.findFirst({
          where: { companyId, isInitial: true },
        })))
      : await this.prisma.salesClientStage.findFirst({
          where: { companyId, isInitial: true },
        });
    const extra = trasladarSubserviciosLegado({ ...(dto.extra || {}) });
    await this.validarSubopcionesDeExtra(companyId, extra);
    const fechaIngreso = parseFechaIngreso(dto.fechaIngreso);
    const serviceIds = this.esquema.isReady()
      ? await this.oportunidades.idsServiciosDesdeExtra(companyId, extra)
      : [];
    // Aviso blando por nombre parecido (Fase 2, no bloquea el guardado): capaz
    // ya está escrita distinto ("Textiles del Valle" vs "Textiles Valle").
    const candidatosNombre = await this.prisma.salesClient.findMany({
      where: { companyId },
      select: { id: true, name: true },
    });
    const posiblesDuplicados = nombresParecidos(dto.name.trim(), candidatosNombre);
    const cliente = await this.prisma.$transaction(async (tx) => {
      const cliente = await tx.salesClient.create({
      data: {
        companyId,
        createdBy,
        ...(fechaIngreso ? { createdAt: fechaIngreso } : {}),
        // Quien crea un cliente a mano en Ventas es, por defecto, quien lo
        // atiende — a diferencia de un referido (creado por cualquier
        // empleado vía /referir), que queda sin responsable hasta que
        // alguien de Ventas se lo asigne (ver asignarme()). En «solo datos» el
        // responsable es de la oportunidad, no de la empresa o persona.
        assignedUserId: soloDatos ? null : createdBy,
        name: dto.name.trim(),
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        ruc: dto.ruc?.trim() || null,
        address: dto.address?.trim() || null,
        observaciones: dto.observaciones?.trim() || null,
        extra,
        status: initialStage?.key ?? null,
      },
      include: CLIENT_INCLUDE,
      });
      // El cliente nace con su primera oportunidad (misma fecha de ingreso,
      // mismo responsable y mismos servicios que eligió en la ficha).
      if (this.esquema.isReady() && !soloDatos) {
        await this.oportunidades.crearInicial(tx, {
          companyId,
          salesClientId: cliente.id,
          status: cliente.status,
          createdBy,
          assignedUserId: createdBy,
          source: (extra as Record<string, string>)['fuente'] ?? null,
          originType: yaEsCliente ? 'HISTORICO' : 'MANUAL',
          receivedAt: fechaIngreso ?? undefined,
          serviceIds,
          ...(yaEsCliente
            ? { outcome: 'GANADA' as const, closedAt: fechaIngreso ?? new Date() }
            : {}),
        });
      }
      return cliente;
    });
    return { ...cliente, posiblesDuplicados };
  }

  async asignarme(companyId: number | null, id: number, userId: number) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    await this.getClient(companyId, id);
    return this.prisma.salesClient.update({
      where: { id },
      data: { assignedUserId: userId },
      include: CLIENT_INCLUDE,
    });
  }

  // Solo se puede quitar a sí mismo — nadie reasigna ni libera el cliente
  // de otra persona desde acá (decisión: autoasignación simple, sin un
  // selector de personas).
  async quitarme(companyId: number | null, id: number, userId: number) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    const client = await this.getClient(companyId, id);
    if (client.assignedUserId !== userId) {
      throw new BadRequestException('No está asignado a ti.');
    }
    return this.prisma.salesClient.update({
      where: { id },
      data: { assignedUserId: null },
      include: CLIENT_INCLUDE,
    });
  }

  async updateClient(companyId: number | null, id: number, dto: any) {
    const actual = await this.getClient(companyId, id);
    const data: any = {};
    const fechaIngreso = fechaIngresoParaEditar(dto.fechaIngreso, actual.createdAt);
    if (fechaIngreso) data.createdAt = fechaIngreso;
    if (dto.name !== undefined) data.name = String(dto.name).trim();
    if (dto.email !== undefined)
      data.email = dto.email ? String(dto.email).trim() : null;
    if (dto.phone !== undefined)
      data.phone = dto.phone ? String(dto.phone).trim() : null;
    if (dto.ruc !== undefined)
      data.ruc = dto.ruc ? String(dto.ruc).trim() : null;
    if (dto.address !== undefined)
      data.address = dto.address ? String(dto.address).trim() : null;
    if (dto.observaciones !== undefined)
      data.observaciones = dto.observaciones
        ? String(dto.observaciones).trim()
        : null;
    if (dto.extra !== undefined) {
      const extra = trasladarSubserviciosLegado({ ...dto.extra });
      await this.validarSubopcionesDeExtra(companyId as number, extra);
      data.extra = extra;
    }
    Object.assign(data, parseSiguientePaso(dto));
    return this.prisma.salesClient.update({
      where: { id },
      data,
      include: CLIENT_INCLUDE,
    });
  }

  async deleteClient(companyId: number | null, id: number) {
    await this.getClient(companyId, id);
    // Los contratos comerciales cuelgan del cliente (se borrarían en cascada):
    // mejor pedir que se eliminen a propósito que perder el historial sin querer.
    const contratos = await this.prisma.salesAgreement.count({
      where: { salesClientId: id },
    });
    if (contratos > 0) {
      throw new BadRequestException(
        `Este cliente tiene ${contratos} contrato(s). Elimínalos primero en Ventas → Contratos si de verdad quieres borrar al cliente.`,
      );
    }
    // Los motivos de cierre del cliente (sin FK) se van con él.
    await this.prisma.$transaction([
      this.prisma.salesReasonEntry.deleteMany({ where: { salesClientId: id } }),
      this.prisma.salesClient.delete({ where: { id } }),
    ]);
    return { success: true };
  }

  // ---------- Ficha del cliente: línea de tiempo y actividades ----------

  // Une en una sola lista, lo más reciente primero: la creación del cliente,
  // sus cambios de etapa, las notas/actividades registradas a mano y los
  // hitos de sus contratos (creado, enviado a firma, firmado). Los cambios de
  // etapa solo existen desde que se empezó a guardarlos, y los contratos solo
  // aparecen si fueron vinculados al cliente al crearlos.
  // Línea de tiempo de la ficha. Desde 2026-10-08 los cambios de etapa se leen de
  // las OPORTUNIDADES (cada uno dice de cuál negociación y de qué servicio es);
  // la tabla vieja de cambios de etapa del cliente solo se usa si las tablas
  // nuevas no están listas. Así dejan de mezclarse dos cadenas de etapas.
  async getTimeline(companyId: number | null, clientId: number) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    const client = await this.getClient(companyId, clientId);
    const nuevo = this.esquema.isReady();

    const [stages, activities, contracts, campos] = await Promise.all([
      this.prisma.salesClientStage.findMany({ where: { companyId } }),
      this.prisma.salesClientActivity.findMany({
        where: { salesClientId: clientId, companyId },
        include: { author: { select: { id: true, fullName: true } } },
      }),
      this.prisma.salesContract.findMany({
        where: { salesClientId: clientId, companyId },
        select: {
          id: true,
          contractNumber: true,
          createdAt: true,
          sentAt: true,
          signedAt: true,
          template: { select: { name: true } },
          creator: { select: { fullName: true } },
        },
      }),
      this.prisma.salesClientField.findMany({
        where: { companyId, key: { in: ['servicio_requerido', 'fuente'] } },
      }),
    ]);

    const changes = nuevo
      ? []
      : await this.prisma.salesClientStageChange.findMany({
          where: { salesClientId: clientId, companyId },
          include: { changer: { select: { id: true, fullName: true } } },
        });
    const oportunidades = nuevo
      ? await this.prisma.salesOpportunity.findMany({
          where: { salesClientId: clientId, companyId },
          include: {
            services: { include: { service: { select: { name: true } } } },
            stageChanges: true,
          },
        })
      : [];
    const acuerdos = nuevo
      ? await this.prisma.salesAgreement.findMany({
          where: { salesClientId: clientId, companyId },
          include: { services: { include: { service: { select: { name: true } } } } },
        })
      : [];

    // Quién hizo cada cambio de etapa de una oportunidad (solo se guarda el id).
    const idsUsuario = [
      ...new Set([
        ...oportunidades.flatMap((o) => o.stageChanges.map((c) => c.changedBy)),
        ...oportunidades.map((o) => o.createdBy),
        ...acuerdos.map((x) => x.createdBy),
      ]),
    ];
    const usuarios = idsUsuario.length
      ? await this.prisma.user.findMany({
          where: { id: { in: idsUsuario } },
          select: { id: true, fullName: true },
        })
      : [];
    const nombreUsuario = new Map(usuarios.map((u) => [u.id, u.fullName]));

    const etapaPorClave = new Map(stages.map((s) => [s.key, s]));
    // Una etapa borrada (ya sin fila) se muestra con su clave tal cual.
    const infoEtapa = (key: string | null) => {
      if (!key) return null;
      const s = etapaPorClave.get(key);
      return { label: s?.label ?? key, color: s?.color ?? '#718096' };
    };

    // Servicio por el que llegó el cliente: lo que eligió en la ficha (o en el
    // formulario de referidos) y, si no hay, los servicios de su primera
    // oportunidad.
    const extra = (client.extra ?? {}) as Record<string, string>;
    const etiquetaDeLista = (key: string) => {
      const campo = campos.find((c) => c.key === key);
      const opciones = (campo?.options ?? []) as {
        key: string;
        label: string;
        children?: { key: string; label: string }[];
      }[];
      const valor = extra[key];
      if (!valor) return { principal: null as string | null, subs: [] as string[] };
      const opcion = opciones.find((o) => o.key === valor);
      const principal = opcion?.label ?? valor;
      const subs = (extra[`${key}__sub`] ?? '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
        .map((k) => opcion?.children?.find((c) => c.key === k)?.label ?? ETIQUETA_SUBSERVICIO[k] ?? k);
      return { principal, subs };
    };
    const servicioElegido = etiquetaDeLista('servicio_requerido');
    const primera = [...oportunidades].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())[0];
    const serviciosDeEntrada =
      servicioElegido.subs.length > 0
        ? servicioElegido.subs
        : servicioElegido.principal
          ? [servicioElegido.principal]
          : (primera?.services.map((x) => x.service.name) ?? []);
    const fuenteElegida = etiquetaDeLista('fuente').principal;

    const nombreOportunidad = (o: { id: number; title: string | null; services: { service: { name: string } }[] }) =>
      o.title || o.services.map((x) => x.service.name).join(', ') || `Oportunidad #${o.id}`;

    type Evento = { kind: string; at: Date; [k: string]: unknown };
    const eventos: Evento[] = [];

    eventos.push({
      kind: 'creado',
      id: `creado-${client.id}`,
      at: client.createdAt,
      authorName: client.creator?.fullName ?? null,
      referredByName: client.referredBy?.fullName ?? null,
      servicios: serviciosDeEntrada,
      fuente: fuenteElegida,
    });

    for (const c of changes) {
      eventos.push({
        kind: 'etapa',
        id: `etapa-${c.id}`,
        at: c.createdAt,
        authorName: c.changer?.fullName ?? null,
        from: infoEtapa(c.fromStatus),
        to: infoEtapa(c.toStatus),
        notes: c.notes,
      });
    }

    for (const o of oportunidades) {
      const nombre = nombreOportunidad(o);
      eventos.push({
        kind: 'oportunidad',
        id: `oportunidad-${o.id}`,
        opportunityId: o.id,
        at: o.receivedAt,
        authorName: nombreUsuario.get(o.createdBy) ?? null,
        nombre,
        servicios: o.services.map((x) => x.service.name),
        originType: o.originType,
        source: o.source,
      });
      for (const c of o.stageChanges) {
        eventos.push({
          kind: 'etapa',
          id: `etapa-opp-${c.id}`,
          at: c.createdAt,
          authorName: nombreUsuario.get(c.changedBy) ?? null,
          from: infoEtapa(c.fromStatus),
          to: infoEtapa(c.toStatus),
          notes: c.notes,
          opportunityId: o.id,
          opportunityName: nombre,
        });
      }
    }

    for (const x of acuerdos) {
      const base = {
        kind: 'acuerdo',
        agreementId: x.id,
        title: x.title,
        producto: x.kind === 'PRODUCTO',
        servicios: x.services.map((s) => s.service.name),
      };
      eventos.push({
        ...base,
        id: `acuerdo-${x.id}-creado`,
        step: x.renewedFromId ? 'renovado' : 'creado',
        at: x.createdAt,
        authorName: nombreUsuario.get(x.createdBy) ?? null,
        startDate: x.startDate.toISOString().slice(0, 10),
        endDate: x.endDate ? x.endDate.toISOString().slice(0, 10) : null,
      });
      if (x.cancelledAt) {
        eventos.push({ ...base, id: `acuerdo-${x.id}-cancelado`, step: 'cancelado', at: x.cancelledAt });
      }
    }

    for (const a of activities) {
      eventos.push({
        kind: 'actividad',
        id: `actividad-${a.id}`,
        activityId: a.id,
        at: a.createdAt,
        authorId: a.author?.id ?? null,
        authorName: a.author?.fullName ?? null,
        type: a.type,
        otherLabel: a.otherLabel,
        text: a.text,
        // Editada si se tocó después de crearla (margen para el propio insert).
        edited: a.updatedAt.getTime() - a.createdAt.getTime() > 2000,
      });
    }

    for (const k of contracts) {
      const base = {
        kind: 'contrato',
        contractId: k.id,
        contractNumber: k.contractNumber,
        templateName: k.template?.name ?? null,
      };
      eventos.push({
        ...base,
        id: `contrato-${k.id}-creado`,
        step: 'creado',
        at: k.createdAt,
        authorName: k.creator?.fullName ?? null,
      });
      if (k.sentAt) {
        eventos.push({ ...base, id: `contrato-${k.id}-enviado`, step: 'enviado', at: k.sentAt });
      }
      if (k.signedAt) {
        eventos.push({ ...base, id: `contrato-${k.id}-firmado`, step: 'firmado', at: k.signedAt });
      }
    }

    return eventos.sort((a, b) => b.at.getTime() - a.at.getTime());
  }

  // ---------------------------------------------------------------------
  // Contactos (Fase 2 del CRM, 2026-10-18): varias personas por cliente, cada
  // una con varios teléfonos/correos etiquetados.
  // ---------------------------------------------------------------------

  private limpiarValores(
    valores: { label?: string; value?: string }[] | undefined,
  ): { label: string; value: string }[] {
    if (!Array.isArray(valores)) return [];
    return valores
      .map((v) => ({ label: (v?.label ?? '').trim() || 'Otro', value: (v?.value ?? '').trim() }))
      .filter((v) => v.value);
  }

  async listContacts(companyId: number | null, clientId: number) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    await this.getClient(companyId, clientId);
    return this.prisma.salesContact.findMany({
      where: { companyId, salesClientId: clientId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createContact(
    companyId: number | null,
    clientId: number,
    userId: number,
    dto: CreateSalesContactDto,
  ) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    if (!dto?.name?.trim()) throw new BadRequestException('El nombre del contacto es requerido');
    await this.getClient(companyId, clientId);
    return this.prisma.salesContact.create({
      data: {
        companyId,
        salesClientId: clientId,
        name: dto.name.trim(),
        role: dto.role?.trim() || null,
        phones: this.limpiarValores(dto.phones),
        emails: this.limpiarValores(dto.emails),
        notes: dto.notes?.trim() || null,
        createdBy: userId,
      },
    });
  }

  private async getContact(companyId: number, contactId: number) {
    const contacto = await this.prisma.salesContact.findFirst({
      where: { id: contactId, companyId },
    });
    if (!contacto) throw new NotFoundException('Contacto no encontrado');
    return contacto;
  }

  async updateContact(
    companyId: number | null,
    contactId: number,
    dto: UpdateSalesContactDto,
  ) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    await this.getContact(companyId, contactId);
    const data: Prisma.SalesContactUpdateInput = {};
    if (dto.name !== undefined) {
      const n = dto.name.trim();
      if (!n) throw new BadRequestException('El nombre del contacto no puede quedar vacío.');
      data.name = n;
    }
    if (dto.role !== undefined) data.role = dto.role.trim() || null;
    if (dto.phones !== undefined) data.phones = this.limpiarValores(dto.phones);
    if (dto.emails !== undefined) data.emails = this.limpiarValores(dto.emails);
    if (dto.notes !== undefined) data.notes = dto.notes.trim() || null;
    return this.prisma.salesContact.update({ where: { id: contactId }, data });
  }

  async deleteContact(companyId: number | null, contactId: number) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    await this.getContact(companyId, contactId);
    await this.prisma.salesContact.delete({ where: { id: contactId } });
    return { ok: true };
  }

  async addActivity(
    companyId: number | null,
    clientId: number,
    userId: number,
    dto: CreateSalesClientActivityDto,
  ) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    await this.getClient(companyId, clientId);
    const { type, otherLabel } = normalizarTipoActividad(dto.type, dto.otherLabel);
    return this.prisma.salesClientActivity.create({
      data: {
        companyId,
        salesClientId: clientId,
        createdBy: userId,
        type,
        otherLabel,
        text: normalizarTextoActividad(dto.text),
      },
    });
  }

  // Solo quien la escribió o un administrador puede corregir o borrar una
  // actividad (decisión de Ventas). El resto del equipo la ve pero no la toca.
  private async actividadEditable(
    companyId: number | null,
    activityId: number,
    user: { userId: number; role: string },
  ) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    const actividad = await this.prisma.salesClientActivity.findFirst({
      where: { id: activityId, companyId },
    });
    if (!actividad) throw new NotFoundException('Actividad no encontrada');
    if (actividad.createdBy !== user.userId && user.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo quien la escribió o un administrador puede cambiar esta actividad.',
      );
    }
    return actividad;
  }

  async updateActivity(
    companyId: number | null,
    activityId: number,
    user: { userId: number; role: string },
    dto: UpdateSalesClientActivityDto,
  ) {
    const actual = await this.actividadEditable(companyId, activityId, user);
    const data: { type?: string; otherLabel?: string | null; text?: string } = {};
    if (dto.type !== undefined || dto.otherLabel !== undefined) {
      Object.assign(
        data,
        normalizarTipoActividad(
          dto.type ?? actual.type,
          dto.otherLabel ?? actual.otherLabel ?? undefined,
        ),
      );
    }
    if (dto.text !== undefined) data.text = normalizarTextoActividad(dto.text);
    return this.prisma.salesClientActivity.update({
      where: { id: activityId },
      data,
    });
  }

  async deleteActivity(
    companyId: number | null,
    activityId: number,
    user: { userId: number; role: string },
  ) {
    await this.actividadEditable(companyId, activityId, user);
    await this.prisma.salesClientActivity.delete({ where: { id: activityId } });
    return { success: true };
  }

  // ---------- Dashboard de Ventas (a partir de Clientes) ----------

  // Todo sale de SalesClient (más sus contratos y cambios de etapa), no del
  // módulo antiguo de Leads/Visitas. `responsable`: 'mine' (por defecto),
  // 'all' o el id de un vendedor — este último solo lo respeta si quien
  // consulta es ADMIN/MANAGER; para el resto equivale a 'mine'. `hoy` es el
  // día local de quien consulta ('YYYY-MM-DD'): nextActionDate es solo-día y
  // compararlo contra el "hoy" del servidor (UTC) correría los vencimientos.
  // El rango desde/hasta solo afecta a "nuevos" y "referidos"; el resto es
  // una foto de cómo está todo ahora.
  async getDashboard(
    companyId: number | null,
    user: { userId: number; role: string },
    query: { desde?: string; hasta?: string; responsable?: string; hoy?: string },
  ) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    await this.ensureDefaultStages(companyId);

    const esManager = user.role === 'ADMIN' || user.role === 'MANAGER';
    const hoy = esDiaValido(query.hoy) ? query.hoy : aDia(new Date());
    const hoyFecha = diaUtc(hoy);
    const hasta = esDiaValido(query.hasta) ? query.hasta : hoy;
    const desde = esDiaValido(query.desde)
      ? query.desde
      : `${hoy.slice(0, 8)}01`; // por defecto, desde el 1 del mes
    if (desde > hasta) {
      throw new BadRequestException('La fecha "desde" no puede ser posterior a "hasta".');
    }
    const desdeFecha = diaUtc(desde);
    const hastaExclusivo = new Date(diaUtc(hasta).getTime() + DIA_MS);

    // Alcance
    let responsable: string = 'mine';
    const where: Prisma.SalesClientWhereInput = { companyId };
    if (query.responsable === 'all') {
      responsable = 'all';
    } else if (esManager && query.responsable && /^\d+$/.test(query.responsable)) {
      responsable = query.responsable;
      where.assignedUserId = Number(query.responsable);
    } else {
      where.assignedUserId = user.userId;
    }

    const stages = await this.prisma.salesClientStage.findMany({
      where: { companyId },
      orderBy: { order: 'asc' },
    });
    const finales = new Set(stages.filter((s) => s.isFinal).map((s) => s.key));
    const ganada = stages.find((s) => s.key === ETAPA_GANADA && s.isFinal)?.key ?? null;
    const perdida = stages.find((s) => s.key === ETAPA_PERDIDA && s.isFinal)?.key ?? null;
    const esActivo = (status: string | null) => !status || !finales.has(status);

    const clientes = await this.prisma.salesClient.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        assignedUserId: true,
        assignedUser: { select: { fullName: true } },
        nextActionDate: true,
        createdAt: true,
        referredByUserId: true,
        referredBy: { select: { fullName: true } },
      },
    });

    // Seguimientos (solo clientes activos)
    let vencidos = 0;
    let paraHoy = 0;
    let sinFecha = 0;
    let activos = 0;
    for (const c of clientes) {
      if (!esActivo(c.status)) continue;
      activos++;
      if (!c.nextActionDate) sinFecha++;
      else if (c.nextActionDate < hoyFecha) vencidos++;
      else if (c.nextActionDate.getTime() === hoyFecha.getTime()) paraHoy++;
    }

    // Embudo por etapa (en el orden y color que definió la empresa)
    const porEtapa = new Map<string | null, number>();
    for (const c of clientes) {
      const k = c.status && stages.some((s) => s.key === c.status) ? c.status : null;
      porEtapa.set(k, (porEtapa.get(k) ?? 0) + 1);
    }
    const embudo = [
      ...stages.map((s) => ({
        key: s.key as string | null,
        label: s.label,
        color: s.color,
        isFinal: s.isFinal,
        count: porEtapa.get(s.key) ?? 0,
      })),
      ...(porEtapa.get(null)
        ? [{ key: null, label: 'Sin etapa', color: '#a0aec0', isFinal: false, count: porEtapa.get(null)! }]
        : []),
    ];

    // Por responsable
    const resp = new Map<number | null, { nombre: string; activos: number; vencidos: number; aceptados: number }>();
    for (const c of clientes) {
      const k = c.assignedUserId ?? null;
      const fila = resp.get(k) ?? {
        nombre: c.assignedUser?.fullName ?? 'Sin responsable',
        activos: 0,
        vencidos: 0,
        aceptados: 0,
      };
      if (esActivo(c.status)) {
        fila.activos++;
        if (c.nextActionDate && c.nextActionDate < hoyFecha) fila.vencidos++;
      }
      if (ganada && c.status === ganada) fila.aceptados++;
      resp.set(k, fila);
    }
    const porResponsable = [...resp.entries()]
      .map(([userId, v]) => ({ userId, ...v }))
      .sort((a, b) => {
        if (a.userId === null) return -1; // "Sin responsable" arriba: es una cola sin dueño
        if (b.userId === null) return 1;
        return b.activos - a.activos || a.nombre.localeCompare(b.nombre, 'es');
      });

    // Nuevos clientes y referidos (dentro del rango). Se compara el
    // instante de creación en UTC contra el día pedido: un cliente creado de
    // noche en Ecuador puede caer en el día siguiente.
    const enRango = clientes.filter((c) => c.createdAt >= desdeFecha && c.createdAt < hastaExclusivo);
    const semanas = new Map<string, number>();
    for (let d = lunesDe(desde); d < hastaExclusivo; d = new Date(d.getTime() + 7 * DIA_MS)) {
      semanas.set(aDia(d), 0);
    }
    for (const c of enRango) {
      const k = aDia(lunesDe(aDia(c.createdAt)));
      semanas.set(k, (semanas.get(k) ?? 0) + 1);
    }
    const porSemana = [...semanas.entries()]
      .map(([inicio, total]) => ({ inicio, total }))
      .slice(-MAX_SEMANAS_SERIE);

    const referidosRango = enRango.filter((c) => c.referredByUserId);
    const topReferidores = new Map<number, { nombre: string; total: number }>();
    for (const c of referidosRango) {
      const id = c.referredByUserId!;
      const fila = topReferidores.get(id) ?? { nombre: c.referredBy?.fullName ?? 'Sin nombre', total: 0 };
      fila.total++;
      topReferidores.set(id, fila);
    }
    const referidos = {
      recibidos: referidosRango.length,
      sinAtender: referidosRango.filter((c) => !c.assignedUserId && esActivo(c.status)).length,
      aceptados: ganada ? referidosRango.filter((c) => c.status === ganada).length : 0,
      rechazados: perdida ? referidosRango.filter((c) => c.status === perdida).length : 0,
      top: [...topReferidores.entries()]
        .map(([userId, v]) => ({ userId, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5),
    };

    // Estancados: clientes activos que llevan más de DIAS_ESTANCADO días en
    // su etapa. Desde cuándo está en ella sale de su último cambio de etapa
    // (esa tabla solo existe desde que se empezó a guardar); sin cambios, se
    // usa la fecha de creación. Es una aproximación honesta, no un dato exacto.
    const activosRows = clientes.filter((c) => esActivo(c.status));
    const ultimoCambio = activosRows.length
      ? await this.prisma.salesClientStageChange.findMany({
          where: { companyId, salesClientId: { in: activosRows.map((c) => c.id) } },
          orderBy: { createdAt: 'desc' },
          distinct: ['salesClientId'],
          select: { salesClientId: true, createdAt: true },
        })
      : [];
    const desdeCuando = new Map(ultimoCambio.map((u) => [u.salesClientId, u.createdAt]));
    const etapaPorClave = new Map(stages.map((s) => [s.key, s]));
    const estancadosTodos = activosRows
      .map((c) => {
        const entro = desdeCuando.get(c.id) ?? c.createdAt;
        // Días calendario entre el día en que entró a la etapa y hoy.
        const dias = Math.max(0, Math.round((hoyFecha.getTime() - diaUtc(aDia(entro)).getTime()) / DIA_MS));
        const etapa = c.status ? etapaPorClave.get(c.status) : undefined;
        return {
          id: c.id,
          name: c.name,
          etapa: etapa?.label ?? 'Sin etapa',
          color: etapa?.color ?? '#a0aec0',
          dias,
          responsable: c.assignedUser?.fullName ?? null,
        };
      })
      .filter((c) => c.dias >= DIAS_ESTANCADO)
      .sort((a, b) => b.dias - a.dias);

    // Aceptación (foto actual, no por rango: sin historial confiable)
    const nGanados = ganada ? clientes.filter((c) => c.status === ganada).length : 0;
    const nPerdidos = perdida ? clientes.filter((c) => c.status === perdida).length : 0;

    // Contratos de estos clientes
    const clientesFiltro: Prisma.SalesContractWhereInput =
      where.assignedUserId !== undefined
        ? { salesClient: { is: { assignedUserId: where.assignedUserId as number } } }
        : { salesClientId: { not: null } };
    const [contratosPorEstado, aceptadosSinContrato, sinClienteVinculado] = await Promise.all([
      this.prisma.salesContract.groupBy({
        by: ['status'],
        where: { companyId, ...clientesFiltro },
        _count: { _all: true },
      }),
      ganada
        ? this.prisma.salesClient.count({ where: { ...where, status: ganada, contracts: { none: {} } } })
        : Promise.resolve(0),
      this.prisma.salesContract.count({
        where: { companyId, salesClientId: null, status: { not: 'CANCELLED' } },
      }),
    ]);
    const nContratos = (...estados: string[]) =>
      contratosPorEstado.filter((e) => estados.includes(e.status)).reduce((s, e) => s + e._count._all, 0);

    // Vendedores entre los que un gerente puede elegir (quienes ya tienen
    // clientes asignados). Los demás usuarios no ven ese selector.
    let responsables: { id: number; nombre: string }[] = [];
    if (esManager) {
      const asignados = await this.prisma.salesClient.groupBy({
        by: ['assignedUserId'],
        where: { companyId, assignedUserId: { not: null } },
      });
      const usuarios = await this.prisma.user.findMany({
        where: { id: { in: asignados.map((a) => a.assignedUserId!) } },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      });
      responsables = usuarios.map((u) => ({ id: u.id, nombre: u.fullName }));
    }

    return {
      alcance: { responsable, desde, hasta, hoy, esManager },
      responsables,
      seguimientos: { vencidos, hoy: paraHoy, sinFecha, activos },
      embudo,
      porResponsable,
      nuevos: { total: enRango.length, referidos: referidosRango.length, porSemana },
      referidos,
      estancados: {
        dias: DIAS_ESTANCADO,
        total: estancadosTodos.length,
        lista: estancadosTodos.slice(0, MAX_ESTANCADOS_LISTADOS),
      },
      aceptacion: {
        aceptados: nGanados,
        rechazados: nPerdidos,
        tasa: ganada && perdida && nGanados + nPerdidos > 0
          ? Math.round((nGanados / (nGanados + nPerdidos)) * 100)
          : null,
      },
      contratos: {
        borrador: nContratos('DRAFT', 'GENERATING', 'READY'),
        enFirma: nContratos('SENT'),
        firmados: nContratos('SIGNED'),
        aceptadosSinContrato,
        sinClienteVinculado,
      },
    };
  }

  // "Hecho" de la vista Hoy: guarda lo que se hizo (si se escribió algo) en la
  // línea de tiempo y deja el nuevo siguiente paso, en una sola transacción.
  async markDone(
    companyId: number | null,
    clientId: number,
    userId: number,
    dto: MarkSalesClientDoneDto,
  ) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    await this.getClient(companyId, clientId);
    const siguiente = parseSiguientePaso(dto);
    const queHizo = dto.text?.trim();
    const actividad = queHizo
      ? {
          ...normalizarTipoActividad(dto.type || 'NOTA', dto.otherLabel),
          text: normalizarTextoActividad(queHizo),
        }
      : null;

    return this.prisma.$transaction(async (tx) => {
      if (actividad) {
        await tx.salesClientActivity.create({
          data: {
            companyId,
            salesClientId: clientId,
            createdBy: userId,
            ...actividad,
          },
        });
      }
      return tx.salesClient.update({
        where: { id: clientId },
        data: siguiente,
        include: CLIENT_INCLUDE,
      });
    });
  }

  static valueOf(
    client: {
      name: string;
      email: string | null;
      phone: string | null;
      ruc: string | null;
      address: string | null;
      observaciones: string | null;
      extra: any;
    },
    key: string,
  ): string {
    if (key === 'name') return client.name || '';
    if (key === 'email') return client.email || '';
    if (key === 'phone') return client.phone || '';
    if (key === 'ruc') return client.ruc || '';
    if (key === 'address') return client.address || '';
    if (key === 'observaciones') return client.observaciones || '';
    const extra =
      client.extra && typeof client.extra === 'object' ? client.extra : {};
    return extra[key] != null ? String(extra[key]) : '';
  }
}
