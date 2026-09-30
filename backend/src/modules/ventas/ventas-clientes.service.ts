import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GmailMailService } from '../mail/gmail-mail.service';
import {
  CreateReferralDto,
  ChangeSalesClientStageDto,
  CreateSalesClientStageDto,
  UpdateSalesClientStageDto,
  SalesClientFieldOptionDto,
} from './dto/client.dto';

export const CORE_CLIENT_FIELDS = [
  { key: 'name', label: 'Nombre / Razón social', fieldType: 'TEXT' },
  { key: 'email', label: 'Email', fieldType: 'EMAIL' },
  { key: 'phone', label: 'Teléfono', fieldType: 'TEXT' },
  { key: 'ruc', label: 'Cédula / RUC', fieldType: 'TEXT' },
  { key: 'address', label: 'Dirección', fieldType: 'TEXT' },
  {
    key: 'fuente',
    label: 'Fuente',
    fieldType: 'SELECT',
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
    fieldType: 'SELECT',
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

const DEFAULT_STAGES = [
  {
    key: 'RECIBIDO',
    label: 'Recibido',
    color: '#718096',
    order: 0,
    isInitial: true,
    isFinal: false,
  },
  {
    key: 'LEIDO',
    label: 'Leído',
    color: '#1d4ed8',
    order: 1,
    isInitial: false,
    isFinal: false,
  },
  {
    key: 'COTIZADO',
    label: 'Cotizado',
    color: '#6b46c1',
    order: 2,
    isInitial: false,
    isFinal: false,
  },
  {
    key: 'ACEPTADO',
    label: 'Aceptado',
    color: '#276749',
    order: 3,
    isInitial: false,
    isFinal: true,
  },
  {
    key: 'RECHAZADO',
    label: 'Rechazado',
    color: '#c53030',
    order: 4,
    isInitial: false,
    isFinal: true,
  },
] as const;

const MAX_BLOCKING_CLIENTS_LISTED = 20;

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
  ) {}

  // ---------- Campos personalizables ----------

  // Idempotente: además de crear los campos núcleo que falten, corrige
  // `order`/`fieldType`/`allowOther` de los que ya existen para que siempre
  // respeten CORE_CLIENT_FIELDS (Nombre, Email, Teléfono, RUC, Dirección,
  // Fuente, Servicio requerido, Observaciones) — así un campo nuevo que
  // Ventas agregue siempre queda después de Observaciones (order = max + 1),
  // sin importar en qué momento se sembró cada campo núcleo para esta
  // empresa. OJO: `label` y `options` NO se resincronizan nunca — esos sí
  // son contenido que Ventas edita (renombrar el campo, agregar/quitar
  // opciones), y machacarlos acá borraría esa personalización.
  async ensureCoreFields(companyId: number) {
    const existing = await this.prisma.salesClientField.findMany({
      where: { companyId, isCore: true },
    });
    const byKey = new Map(existing.map((f) => [f.key, f]));
    for (let i = 0; i < CORE_CLIENT_FIELDS.length; i++) {
      const core = CORE_CLIENT_FIELDS[i];
      const current = byKey.get(core.key);
      const allowOther = 'allowOther' in core ? core.allowOther : false;
      if (!current) {
        await this.prisma.salesClientField.create({
          data: {
            companyId,
            key: core.key,
            label: core.label,
            fieldType: core.fieldType,
            options: 'options' in core ? [...core.options] : [],
            allowOther,
            isCore: true,
            order: i,
          },
        });
      } else if (
        current.order !== i ||
        current.fieldType !== core.fieldType ||
        current.allowOther !== allowOther
      ) {
        await this.prisma.salesClientField.update({
          where: { id: current.id },
          data: { order: i, fieldType: core.fieldType, allowOther },
        });
      }
    }
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

    return this.prisma.$transaction(async (tx) => {
      if (data.isInitial) {
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
          isInitial: data.isInitial ?? false,
          isFinal: data.isFinal ?? false,
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

  async changeStage(
    id: number,
    dto: ChangeSalesClientStageDto,
    companyId: number,
    userId: number,
  ) {
    const client = await this.prisma.salesClient.findFirst({
      where: { id, companyId },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (client.status === dto.toStatus) {
      throw new BadRequestException('El cliente ya está en esa etapa');
    }

    const targetStage = await this.prisma.salesClientStage.findFirst({
      where: { companyId, key: dto.toStatus },
    });
    if (!targetStage) {
      throw new BadRequestException(
        `La etapa "${dto.toStatus}" no existe en esta empresa`,
      );
    }

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
        data: { status: dto.toStatus },
      }),
    ]);

    if (client.referredByUserId) {
      await this.notificarReferidor(
        client.id,
        client.name,
        client.referredByUserId,
        companyId,
        targetStage.label,
      );
    }

    return updated;
  }

  // Se ejecuta después de confirmado el cambio de etapa. Un fallo acá
  // (correo caído, config incompleta) nunca debe deshacer ni bloquear el
  // cambio de etapa que ya se guardó — solo se registra en el servidor.
  private async notificarReferidor(
    clientId: number,
    clientNombre: string,
    referredByUserId: number,
    companyId: number,
    etapaLabel: string,
  ) {
    const mensaje = `Tu referido "${clientNombre}" pasó a la etapa "${etapaLabel}".`;

    try {
      await this.notificationsService.create({
        userId: referredByUserId,
        companyId,
        title: 'Actualización de tu referido',
        message: mensaje,
        link: '/dashboard?abrirReferidos=1',
      });
    } catch (err: any) {
      this.logger.error(
        `No se pudo crear la notificación in-app del cliente #${clientId}: ${err.message}`,
        err.stack,
      );
    }

    try {
      const referrer = await this.prisma.user.findUnique({
        where: { id: referredByUserId },
        select: { email: true },
      });
      if (!referrer?.email) return;

      // Este aviso lo manda Sistemas, no el remitente que RRHH configuró
      // para sus propios recordatorios (`NotificationConfig`, pensado para
      // avisos de cumplimiento) — mismo remitente fijo que ya usa la
      // recuperación de contraseña (ver AuthService.REMITENTE_CONTRASENA).
      await this.gmailMailService.sendMail({
        to: referrer.email,
        subject: 'Actualización de tu referido',
        bodyText: `${mensaje}\n\nPuedes ver el estado de tus referidos ingresando a la app, en "Mis Referidos".`,
        from: 'sistemas@gemeseg.com',
        fromName: 'Sistemas',
      });
    } catch (err: any) {
      this.logger.error(
        `No se pudo enviar el correo de notificación del cliente #${clientId}: ${err.message}`,
      );
    }
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
    if (dto.servicioRequerido) extra.servicio_requerido = dto.servicioRequerido;

    return this.prisma.salesClient.create({
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
    return clients.map((c) => ({
      ...c,
      stage: c.status ? (stageByKey.get(c.status) ?? null) : null,
    }));
  }

  async getClient(companyId: number | null, id: number) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    const client = await this.prisma.salesClient.findFirst({
      where: { id, companyId },
      include: CLIENT_INCLUDE,
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  async createClient(companyId: number | null, createdBy: number, dto: any) {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    if (!dto?.name?.trim())
      throw new BadRequestException('El nombre es requerido');
    await this.ensureCoreFields(companyId);
    await this.ensureDefaultStages(companyId);
    const initialStage = await this.prisma.salesClientStage.findFirst({
      where: { companyId, isInitial: true },
    });
    return this.prisma.salesClient.create({
      data: {
        companyId,
        createdBy,
        // Quien crea un cliente a mano en Ventas es, por defecto, quien lo
        // atiende — a diferencia de un referido (creado por cualquier
        // empleado vía /referir), que queda sin responsable hasta que
        // alguien de Ventas se lo asigne (ver asignarme()).
        assignedUserId: createdBy,
        name: dto.name.trim(),
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        ruc: dto.ruc?.trim() || null,
        address: dto.address?.trim() || null,
        observaciones: dto.observaciones?.trim() || null,
        extra: dto.extra || {},
        status: initialStage?.key ?? null,
      },
      include: CLIENT_INCLUDE,
    });
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
      throw new BadRequestException('Este cliente no está asignado a ti.');
    }
    return this.prisma.salesClient.update({
      where: { id },
      data: { assignedUserId: null },
      include: CLIENT_INCLUDE,
    });
  }

  async updateClient(companyId: number | null, id: number, dto: any) {
    await this.getClient(companyId, id);
    const data: any = {};
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
    if (dto.extra !== undefined) data.extra = dto.extra;
    return this.prisma.salesClient.update({
      where: { id },
      data,
      include: CLIENT_INCLUDE,
    });
  }

  async deleteClient(companyId: number | null, id: number) {
    await this.getClient(companyId, id);
    await this.prisma.salesClient.delete({ where: { id } });
    return { success: true };
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
