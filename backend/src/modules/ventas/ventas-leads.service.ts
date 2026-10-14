import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../permissions/permissions.service';
import { VentasMotivosService, type MotivoInput } from './ventas-motivos.service';
import { VentasOportunidadesService } from './ventas-oportunidades.service';
import { VentasSchemaService } from './ventas-schema.service';
import {
  CANALES_LEAD,
  ETIQUETA_CANAL,
  MOTIVOS_CONTACTO,
  normalizarCorreo,
  normalizarTelefono,
  sugerirMotivoContacto,
  type CanalLead,
} from './lead-triage.util';
import { sugerirServicios } from './lead-atribucion.util';
import { ensureDefaultServices } from './ventas-servicios.util';

// Un LEAD es un contacto entrante sin calificar. Solo uno de servicio,
// calificado, se convierte en cliente + oportunidad. Un cliente NUNCA vuelve a
// ser lead: si uno que ya es cliente pide otro servicio, entra como lead nuevo
// y al convertirlo se le suma una oportunidad al mismo cliente.

const MAX_NOMBRE = 150;
const MAX_CONTACTO = 150;
const MAX_MENSAJE = 2000;
const MAX_CAMPANA = 150;

export interface EntranteInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  message?: string | null;
  channel: CanalLead;
  campaign?: string | null;
  externalId?: string | null;
  extra?: Record<string, unknown>;
  createdBy?: number | null;
}

const recortar = (v: string | null | undefined, max: number): string | null => {
  const t = (v ?? '').toString().trim();
  return t ? t.slice(0, max) : null;
};

@Injectable()
export class VentasLeadsService {
  private readonly logger = new Logger(VentasLeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
    private readonly motivos: VentasMotivosService,
    private readonly oportunidades: VentasOportunidadesService,
    private readonly esquema: VentasSchemaService,
  ) {}

  private requireCompany(companyId: number | null): number {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    return companyId;
  }

  private requireListo() {
    if (!this.esquema.isReady()) {
      throw new BadRequestException(
        'Los leads todavía no están disponibles. Intenta de nuevo en unos minutos; si sigue igual, avisa a Sistemas.',
      );
    }
  }

  // ---------------------------------------------------------------------
  // Ingreso (manual y desde webhooks)
  // ---------------------------------------------------------------------

  // Crea un lead. Es idempotente por (empresa, canal, externalId): Google y Meta
  // reintentan el aviso y no debe duplicarse. Devuelve `nuevo: false` si ya existía.
  async ingresar(companyId: number, input: EntranteInput) {
    this.requireListo();
    const name = recortar(input.name, MAX_NOMBRE);
    const email = recortar(input.email, MAX_CONTACTO);
    const phone = recortar(input.phone, MAX_CONTACTO);
    if (!name && !email && !phone) {
      throw new BadRequestException(
        'El contacto necesita al menos un nombre, un correo o un teléfono.',
      );
    }
    const externalId = recortar(input.externalId, 200);
    if (externalId) {
      const existente = await this.prisma.salesLead.findFirst({
        where: { companyId, channel: input.channel, externalId },
      });
      if (existente) return { lead: existente, nuevo: false };
    }
    const lead = await this.prisma.salesLead.create({
      data: {
        companyId,
        name: name ?? email ?? phone ?? 'Sin nombre',
        email,
        phone,
        companyName: recortar(input.companyName, MAX_NOMBRE),
        message: recortar(input.message, MAX_MENSAJE),
        channel: input.channel,
        campaign: recortar(input.campaign, MAX_CAMPANA),
        externalId,
        extra: (input.extra ?? {}) as Prisma.InputJsonValue,
        createdBy: input.createdBy ?? null,
      },
    });
    // Aviso en la campanita; un fallo acá nunca debe perder el lead ya guardado.
    await this.avisarLeadNuevo(lead);
    return { lead, nuevo: true };
  }

  // Avisa a todos los de Ventas con "Escribir" marcado explícitamente. No hay
  // reparto automático: el que lo ve primero lo toma. Solo campana, nunca correo.
  private async avisarLeadNuevo(lead: {
    id: number;
    companyId: number;
    name: string;
    channel: string;
    createdBy: number | null;
  }) {
    try {
      const equipo = (
        await this.permissions.getUsersWithExplicitSectionWrite(
          'VENTAS',
          lead.createdBy ?? undefined,
        )
      ).filter((u) => u.companyId === lead.companyId);
      const canal = ETIQUETA_CANAL[lead.channel as CanalLead] ?? lead.channel;
      for (const persona of equipo) {
        try {
          await this.notifications.create({
            userId: persona.id,
            companyId: persona.companyId,
            title: 'Nuevo lead',
            message: `${lead.name} escribió (${canal}). Está en la bandeja de Leads, sin asignar.`,
            link: '/ventas/leads',
          });
        } catch (err: any) {
          this.logger.error(
            `No se pudo avisar al usuario ${persona.id} del lead #${lead.id}: ${err.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(
        `No se pudo avisar del lead #${lead.id}: ${err.message}`,
        err.stack,
      );
    }
  }

  // La clave de la conexión (Google Ads, formulario web) identifica la empresa.
  async empresaDeClave(apiKey: string): Promise<number> {
    const key = await this.prisma.salesApiKey.findUnique({ where: { apiKey } });
    if (!key || !key.isActive) {
      throw new UnauthorizedException('Clave de conexión inválida o inactiva');
    }
    return key.companyId;
  }

  // Formulario de anuncio de Google Ads. Google hace un POST con los datos del
  // lead y la clave que se configuró en el formulario (`google_key`). Los
  // nombres de los campos son los de la documentación de Google; se confirman
  // con el botón de prueba del formulario antes de dar la conexión por buena.
  async ingresarDesdeGoogle(body: any) {
    const apiKey = String(body?.google_key ?? '').trim();
    if (!apiKey) throw new UnauthorizedException('Falta la clave de la conexión');
    const companyId = await this.empresaDeClave(apiKey);
    // El botón "Enviar prueba" de Google manda un lead de mentira: se responde
    // bien para que la conexión se dé por válida, pero no se guarda.
    if (body?.is_test === true || body?.is_test === 'true') {
      return { success: true, prueba: true };
    }
    const columnas: { column_id?: string; column_name?: string; string_value?: string }[] =
      Array.isArray(body?.user_column_data) ? body.user_column_data : [];
    const valor = (...ids: string[]) =>
      columnas.find((c) => ids.includes(String(c.column_id).toUpperCase()))?.string_value;
    const nombre =
      valor('FULL_NAME') ||
      [valor('FIRST_NAME'), valor('LAST_NAME')].filter(Boolean).join(' ');
    const conocidas = ['FULL_NAME', 'FIRST_NAME', 'LAST_NAME', 'EMAIL', 'PHONE_NUMBER', 'COMPANY_NAME'];
    // Preguntas propias del formulario: se guardan como texto en el mensaje.
    const preguntas = columnas
      .filter((c) => !conocidas.includes(String(c.column_id).toUpperCase()) && c.string_value)
      .map((c) => `${c.column_name || c.column_id}: ${c.string_value}`);
    const r = await this.ingresar(companyId, {
      name: nombre,
      email: valor('EMAIL'),
      phone: valor('PHONE_NUMBER'),
      companyName: valor('COMPANY_NAME'),
      message: preguntas.join('\n'),
      channel: 'GOOGLE_ADS',
      campaign: body?.campaign_id ? `Campaña ${body.campaign_id}` : null,
      externalId: body?.lead_id ? String(body.lead_id) : null,
      extra: {
        campaignId: body?.campaign_id ?? null,
        formId: body?.form_id ?? null,
        adGroupId: body?.adgroup_id ?? null,
        gclid: body?.gcl_id ?? null,
      },
    });
    return { success: true, leadId: r.lead.id, duplicado: !r.nuevo };
  }

  // ---------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------

  // Clientes de la empresa que parecen ser la misma persona (mismo correo,
  // teléfono o RUC). Se usa para sugerir «sumar una oportunidad» en vez de
  // crear un cliente repetido.
  private async coincidencias(
    companyId: number,
    lead: { email: string | null; phone: string | null; companyName?: string | null },
    ruc?: string | null,
  ) {
    const correo = normalizarCorreo(lead.email);
    const tel = normalizarTelefono(lead.phone);
    const rucLimpio = (ruc ?? '').trim();
    if (!correo && !tel && !rucLimpio) return [];
    const clientes = await this.prisma.salesClient.findMany({
      where: { companyId },
      select: { id: true, name: true, email: true, phone: true, ruc: true },
    });
    return clientes
      .filter(
        (c) =>
          (correo && normalizarCorreo(c.email) === correo) ||
          (tel && tel.length >= 7 && normalizarTelefono(c.phone) === tel) ||
          (rucLimpio && (c.ruc ?? '').trim() === rucLimpio),
      )
      .map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone }));
  }

  private conSugerencia<T extends { message: string | null; name: string; contactReason: string | null }>(l: T) {
    return {
      ...l,
      sugerenciaMotivo: l.contactReason
        ? null
        : sugerirMotivoContacto(`${l.name} ${l.message ?? ''}`),
    };
  }

  async list(
    companyId: number | null,
    f: { estado?: string; canal?: string; motivo?: string; q?: string } = {},
  ) {
    const cid = this.requireCompany(companyId);
    const where: Prisma.SalesLeadWhereInput = { companyId: cid };
    if (f.estado) where.status = f.estado;
    if (f.canal) where.channel = f.canal;
    if (f.motivo === 'SIN_CLASIFICAR') where.contactReason = null;
    else if (f.motivo) where.contactReason = f.motivo;
    const q = (f.q ?? '').trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { companyName: { contains: q, mode: 'insensitive' } },
        { message: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [filas, clientes, usuarios] = await Promise.all([
      this.prisma.salesLead.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      this.prisma.salesClient.findMany({
        where: { companyId: cid },
        select: { id: true, name: true, email: true, phone: true },
      }),
      this.prisma.user.findMany({
        where: { companyId: cid },
        select: { id: true, fullName: true },
      }),
    ]);
    const porCorreo = new Map<string, { id: number; name: string }>();
    const porTel = new Map<string, { id: number; name: string }>();
    for (const c of clientes) {
      const correo = normalizarCorreo(c.email);
      if (correo) porCorreo.set(correo, { id: c.id, name: c.name });
      const tel = normalizarTelefono(c.phone);
      if (tel.length >= 7) porTel.set(tel, { id: c.id, name: c.name });
    }
    const nombre = new Map(usuarios.map((u) => [u.id, u.fullName]));
    return filas.map((l) => {
      const tel = normalizarTelefono(l.phone);
      const clienteExistente =
        l.status === 'CONVERTIDO'
          ? null
          : (porCorreo.get(normalizarCorreo(l.email)) ??
            (tel.length >= 7 ? porTel.get(tel) : undefined) ??
            null);
      return {
        ...this.conSugerencia(l),
        assignedUserName: l.assignedUserId ? (nombre.get(l.assignedUserId) ?? null) : null,
        clienteExistente,
      };
    });
  }

  async get(companyId: number | null, id: number) {
    const cid = this.requireCompany(companyId);
    const lead = await this.prisma.salesLead.findFirst({ where: { id, companyId: cid } });
    if (!lead) throw new NotFoundException('Lead no encontrado');
    const [coincidencias, motivos] = await Promise.all([
      lead.status === 'CONVERTIDO' ? [] : this.coincidencias(cid, lead),
      this.prisma.salesReasonEntry.findMany({
        where: { companyId: cid, leadId: id },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    // Servicios que el contacto pidió en la landing (campo «servicio»): solo se
    // PRESELECCIONAN al convertir, la persona confirma.
    const servicioPedido = ((lead.extra ?? {}) as Record<string, unknown>)['servicio'];
    let serviciosSugeridos: number[] = [];
    if (typeof servicioPedido === 'string' && servicioPedido.trim()) {
      await ensureDefaultServices(this.prisma, cid);
      const catalogo = await this.prisma.salesService.findMany({
        where: { companyId: cid, isActive: true },
        select: { id: true, name: true },
      });
      serviciosSugeridos = sugerirServicios(servicioPedido, catalogo);
    }
    return { ...this.conSugerencia(lead), coincidencias, motivos, serviciosSugeridos };
  }

  // ---------------------------------------------------------------------
  // Acciones
  // ---------------------------------------------------------------------

  async crearManual(
    companyId: number | null,
    userId: number,
    dto: {
      name?: string;
      email?: string;
      phone?: string;
      companyName?: string;
      message?: string;
      channel?: string;
      campaign?: string;
    },
  ) {
    const cid = this.requireCompany(companyId);
    const canal = (CANALES_LEAD as readonly string[]).includes(dto.channel ?? '')
      ? (dto.channel as CanalLead)
      : 'MANUAL';
    const r = await this.ingresar(cid, { ...dto, channel: canal, createdBy: userId });
    return this.get(cid, r.lead.id);
  }

  async actualizar(
    companyId: number | null,
    id: number,
    dto: {
      name?: string;
      email?: string | null;
      phone?: string | null;
      companyName?: string | null;
      message?: string | null;
      contactReason?: string | null;
    },
  ) {
    const cid = this.requireCompany(companyId);
    const actual = await this.prisma.salesLead.findFirst({ where: { id, companyId: cid } });
    if (!actual) throw new NotFoundException('Lead no encontrado');
    if (actual.status === 'CONVERTIDO' || actual.status === 'DESCARTADO') {
      throw new BadRequestException('Este lead ya está cerrado: no se puede modificar.');
    }
    const data: Prisma.SalesLeadUpdateInput = {};
    if (dto.name !== undefined) {
      const n = recortar(dto.name, MAX_NOMBRE);
      if (!n) throw new BadRequestException('El nombre no puede quedar vacío.');
      data.name = n;
    }
    if (dto.email !== undefined) data.email = recortar(dto.email, MAX_CONTACTO);
    if (dto.phone !== undefined) data.phone = recortar(dto.phone, MAX_CONTACTO);
    if (dto.companyName !== undefined) data.companyName = recortar(dto.companyName, MAX_NOMBRE);
    if (dto.message !== undefined) data.message = recortar(dto.message, MAX_MENSAJE);
    if (dto.contactReason !== undefined) {
      if (dto.contactReason !== null && !(MOTIVOS_CONTACTO as readonly string[]).includes(dto.contactReason)) {
        throw new BadRequestException('El motivo del contacto no es válido.');
      }
      data.contactReason = dto.contactReason;
      data.triagedAt = dto.contactReason ? new Date() : null;
    }
    await this.prisma.salesLead.update({ where: { id }, data });
    return this.get(cid, id);
  }

  // Cada quien se asigna a sí mismo (igual que los clientes): nadie asigna a otro.
  async tomar(companyId: number | null, id: number, userId: number) {
    const cid = this.requireCompany(companyId);
    const lead = await this.prisma.salesLead.findFirst({ where: { id, companyId: cid } });
    if (!lead) throw new NotFoundException('Lead no encontrado');
    if (lead.status === 'CONVERTIDO' || lead.status === 'DESCARTADO') {
      throw new BadRequestException('Este lead ya está cerrado.');
    }
    if (lead.assignedUserId && lead.assignedUserId !== userId) {
      throw new BadRequestException('Este lead ya lo tiene otra persona.');
    }
    await this.prisma.salesLead.update({
      where: { id },
      data: { assignedUserId: userId, status: 'EN_SEGUIMIENTO' },
    });
    return this.get(cid, id);
  }

  async soltar(companyId: number | null, id: number, userId: number) {
    const cid = this.requireCompany(companyId);
    const lead = await this.prisma.salesLead.findFirst({ where: { id, companyId: cid } });
    if (!lead) throw new NotFoundException('Lead no encontrado');
    if (lead.assignedUserId !== userId) {
      throw new BadRequestException('Solo puedes soltar un lead que tienes tú.');
    }
    if (lead.status === 'CONVERTIDO' || lead.status === 'DESCARTADO') {
      throw new BadRequestException('Este lead ya está cerrado.');
    }
    await this.prisma.salesLead.update({
      where: { id },
      data: { assignedUserId: null, status: 'NUEVO' },
    });
    return this.get(cid, id);
  }

  async descartar(
    companyId: number | null,
    id: number,
    userId: number,
    motivo: MotivoInput | undefined,
  ) {
    const cid = this.requireCompany(companyId);
    const lead = await this.prisma.salesLead.findFirst({ where: { id, companyId: cid } });
    if (!lead) throw new NotFoundException('Lead no encontrado');
    if (lead.status === 'CONVERTIDO') {
      throw new BadRequestException('Este lead ya se convirtió en cliente: no se puede descartar.');
    }
    if (lead.status === 'DESCARTADO') {
      throw new BadRequestException('Este lead ya está descartado.');
    }
    await this.prisma.$transaction(async (tx) => {
      await this.motivos.registrar(tx, cid, userId, 'LEAD_DESCARTE', motivo, { leadId: id });
      await tx.salesLead.update({ where: { id }, data: { status: 'DESCARTADO' } });
    });
    return this.get(cid, id);
  }

  // Convierte un lead de servicio en cliente + oportunidad, o le suma una
  // oportunidad a un cliente que ya existe. Si se parece a un cliente existente
  // (mismo correo, teléfono o RUC) hay que elegir: sumarle la oportunidad o
  // confirmar que es otro cliente.
  async convertir(
    companyId: number | null,
    id: number,
    userId: number,
    dto: {
      salesClientId?: number;
      confirmarNuevo?: boolean;
      name?: string;
      email?: string;
      phone?: string;
      ruc?: string;
      serviceIds?: number[];
      title?: string;
    },
  ) {
    const cid = this.requireCompany(companyId);
    this.requireListo();
    const lead = await this.prisma.salesLead.findFirst({ where: { id, companyId: cid } });
    if (!lead) throw new NotFoundException('Lead no encontrado');
    if (lead.status === 'CONVERTIDO') {
      throw new BadRequestException('Este lead ya se convirtió en cliente.');
    }
    if (lead.status === 'DESCARTADO') {
      throw new BadRequestException('Este lead está descartado. Si fue un error, créalo de nuevo.');
    }
    if (lead.contactReason && lead.contactReason !== 'SERVICIO') {
      throw new BadRequestException(
        'Solo un contacto de servicio se convierte en cliente. Cambia su motivo a «Servicio» o descártalo.',
      );
    }

    const email = recortar(dto.email ?? lead.email, MAX_CONTACTO);
    const phone = recortar(dto.phone ?? lead.phone, MAX_CONTACTO);
    const ruc = recortar(dto.ruc, 50);
    const nombre = recortar(dto.name ?? lead.companyName ?? lead.name, MAX_NOMBRE);
    if (!nombre) throw new BadRequestException('El cliente necesita un nombre.');

    // Servicios de la oportunidad (del catálogo de la empresa).
    const serviceIds = [...new Set(dto.serviceIds ?? [])];
    if (serviceIds.length > 0) {
      const ok = await this.prisma.salesService.count({ where: { id: { in: serviceIds }, companyId: cid } });
      if (ok !== serviceIds.length) throw new BadRequestException('Alguno de los servicios no existe.');
    }

    let clienteExistente: { id: number; name: string } | null = null;
    if (dto.salesClientId) {
      clienteExistente = await this.prisma.salesClient.findFirst({
        where: { id: dto.salesClientId, companyId: cid },
        select: { id: true, name: true },
      });
      if (!clienteExistente) throw new NotFoundException('Cliente no encontrado');
    } else if (!dto.confirmarNuevo) {
      const parecidos = await this.coincidencias(cid, { email, phone }, ruc);
      if (parecidos.length > 0) {
        throw new BadRequestException(
          `Este contacto se parece al cliente «${parecidos[0].name}» (mismo correo, teléfono o RUC). Suma la oportunidad a ese cliente, o confirma que es otro cliente.`,
        );
      }
    }

    const inicial = await this.prisma.salesClientStage.findFirst({
      where: { companyId: cid, isInitial: true },
    });
    const canal = ETIQUETA_CANAL[lead.channel as CanalLead] ?? lead.channel;
    const nota = `Lead de ${canal}${lead.campaign ? ` (${lead.campaign})` : ''}${lead.message ? `: ${lead.message}` : '.'}`;

    const resultado = await this.prisma.$transaction(async (tx) => {
      let clienteId: number;
      let originType: 'LEAD' | 'CLIENTE_EXISTENTE';
      if (clienteExistente) {
        clienteId = clienteExistente.id;
        originType = 'CLIENTE_EXISTENTE';
      } else {
        const creado = await tx.salesClient.create({
          data: {
            companyId: cid,
            createdBy: userId,
            assignedUserId: userId,
            name: nombre,
            email,
            phone,
            ruc,
            observaciones: lead.message ? lead.message.slice(0, MAX_MENSAJE) : null,
            extra: {
              fuente: lead.channel === 'GOOGLE_ADS' || lead.channel === 'META_ADS' ? 'CAMPANA' : 'OTRO',
            },
            status: inicial?.key ?? null,
          },
        });
        clienteId = creado.id;
        originType = 'LEAD';
      }
      const opp = await this.oportunidades.crearInicial(tx, {
        companyId: cid,
        salesClientId: clienteId,
        status: inicial?.key ?? null,
        createdBy: userId,
        assignedUserId: userId,
        source: lead.channel,
        leadId: lead.id,
        originType,
        // La oportunidad empieza cuando el contacto llegó, no cuando alguien lo
        // convierte: así el tiempo de respuesta mide la atención real.
        receivedAt: lead.createdAt,
        serviceIds,
        title: recortar(dto.title, 150),
      });
      await this.oportunidades.espejarCliente(tx, clienteId);
      // Lo que el contacto escribió queda en el historial del cliente.
      await tx.salesClientActivity.create({
        data: {
          companyId: cid,
          salesClientId: clienteId,
          type: 'NOTA',
          text: nota.slice(0, 2000),
          createdBy: userId,
        },
      });
      await tx.salesLead.update({
        where: { id: lead.id },
        data: {
          status: 'CONVERTIDO',
          contactReason: 'SERVICIO',
          assignedUserId: lead.assignedUserId ?? userId,
          convertedClientId: clienteId,
          convertedOpportunityId: opp.id,
          triagedAt: lead.triagedAt ?? new Date(),
        },
      });
      return { clienteId, oportunidadId: opp.id, sumadaAClienteExistente: !!clienteExistente };
    });
    return resultado;
  }
}
