import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PermissionsService } from '../../permissions/permissions.service';
import {
  CreateComplaintPublicOptionDto,
  SubmitPublicComplaintDto,
} from '../dto/complaint-externa.dto';

export const SEDES_INICIALES = ['Guayaquil', 'Loja'];
export const TIPOS_INICIALES = [
  'Trato del instructor o del personal',
  'Instalaciones o condiciones del lugar',
  'Contenido o duración de la inducción',
  'Acoso o discriminación',
  'Otro',
];

export const ENLACE_QUEJAS_GESTION = '/rrhh/quejas/gestion';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONO = /^[0-9+()\-\s]{7,20}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Hoy en Ecuador (UTC-5, sin horario de verano), como 'YYYY-MM-DD'.
function hoyEcuador(ahora = new Date()): string {
  return new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Quejas de quien recibe la inducción (personal nuevo o en reinducción) por el
 * formulario público quejas.gemeseg.com. Caen en el MISMO tablero de RRHH que las
 * internas (tabla Complaint) con origen 'EXTERNA': ningún sistema paralelo.
 */
@Injectable()
export class ComplaintExternaService {
  private readonly logger = new Logger(ComplaintExternaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
  ) {}

  // ---------- Público (sin sesión) ----------

  /** La empresa que recibe las quejas externas, o null si el formulario no está activo. */
  private async empresaActiva(): Promise<number | null> {
    const fila = await this.prisma.complaintPublicSetting.findFirst({
      where: { enabled: true },
      select: { companyId: true },
    });
    return fila?.companyId ?? null;
  }

  /** Opciones que muestra el formulario. Solo devuelve etiquetas: nada de la empresa. */
  async formularioPublico() {
    const companyId = await this.empresaActiva();
    if (!companyId) {
      throw new NotFoundException(
        'El formulario de quejas no está disponible por ahora.',
      );
    }
    const opciones = await this.prisma.complaintPublicOption.findMany({
      where: { companyId },
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
    return {
      tipos: opciones.filter((o) => o.kind === 'TIPO').map((o) => o.label),
      sedes: opciones.filter((o) => o.kind === 'SEDE').map((o) => o.label),
    };
  }

  async enviar(dto: SubmitPublicComplaintDto) {
    // Un robot rellena todos los campos; una persona nunca ve este. Se responde
    // «ok» igual para no darle pistas, pero no se guarda nada.
    if (dto.sitioWeb && dto.sitioWeb.trim()) return { ok: true };

    const companyId = await this.empresaActiva();
    if (!companyId) {
      throw new NotFoundException(
        'El formulario de quejas no está disponible por ahora.',
      );
    }

    if (dto.aceptaPrivacidad !== true) {
      throw new BadRequestException(
        'Debes aceptar la política de privacidad para enviar tu queja.',
      );
    }

    const opciones = await this.prisma.complaintPublicOption.findMany({
      where: { companyId },
    });
    const tipo = opciones.find((o) => o.kind === 'TIPO' && o.label === dto.tipo);
    const sede = opciones.find((o) => o.kind === 'SEDE' && o.label === dto.sede);
    if (!tipo) throw new BadRequestException('Elige un tipo de queja de la lista.');
    if (!sede) throw new BadRequestException('Elige una sede de la lista.');

    if (!FECHA.test(dto.fechaInduccion) || Number.isNaN(Date.parse(dto.fechaInduccion))) {
      throw new BadRequestException('Indica la fecha de tu inducción.');
    }
    const hoy = hoyEcuador();
    if (dto.fechaInduccion > hoy) {
      throw new BadRequestException('La fecha de la inducción no puede ser futura.');
    }
    // Más de 5 años atrás es casi seguro un error al teclear el año.
    if (dto.fechaInduccion < `${Number(hoy.slice(0, 4)) - 5}${hoy.slice(4)}`) {
      throw new BadRequestException('Revisa el año de la fecha de tu inducción.');
    }

    const description = dto.description.trim();
    if (description.length < 5) {
      throw new BadRequestException('Describe lo ocurrido con al menos 5 caracteres.');
    }

    // Anónima: no se guarda NINGÚN dato de contacto, aunque el formulario lo mande.
    let contactoNombre: string | null = null;
    let contactoEmail: string | null = null;
    let contactoTelefono: string | null = null;
    if (!dto.anonima) {
      contactoNombre = dto.contactoNombre?.trim() || null;
      contactoEmail = dto.contactoEmail?.trim().toLowerCase() || null;
      contactoTelefono = dto.contactoTelefono?.trim() || null;
      if (!contactoEmail && !contactoTelefono) {
        throw new BadRequestException(
          'Deja un correo o un teléfono para que Recursos Humanos pueda comunicarse contigo, o envía la queja de forma anónima.',
        );
      }
      if (contactoEmail && !EMAIL.test(contactoEmail)) {
        throw new BadRequestException('El correo no parece válido.');
      }
      if (contactoTelefono && !TELEFONO.test(contactoTelefono)) {
        throw new BadRequestException('El teléfono no parece válido.');
      }
    }

    const etapaInicial = await this.prisma.complaintStage.findFirst({
      where: { companyId, isInitial: true },
    });
    if (!etapaInicial) {
      this.logger.error(
        `Queja externa rechazada: la empresa ${companyId} no tiene etapa inicial de quejas.`,
      );
      throw new BadRequestException(
        'No pudimos recibir tu queja en este momento. Inténtalo más tarde.',
      );
    }

    const creada = await this.prisma.complaint.create({
      data: {
        description,
        isAnonymous: dto.anonima,
        submittedBy: null,
        companyId,
        status: etapaInicial.key,
        origen: 'EXTERNA',
        tipo: tipo.label,
        sede: sede.label,
        fechaInduccion: dto.fechaInduccion,
        personasInvolucradas: dto.personasInvolucradas?.trim() || null,
        contactoNombre,
        contactoEmail,
        contactoTelefono,
      },
    });

    await this.avisarARrhh(companyId, tipo.label, sede.label);
    return { ok: true, id: creada.id };
  }

  // La campana es un extra: si falla, la queja ya quedó guardada y no se pierde.
  private async avisarARrhh(companyId: number, tipo: string, sede: string) {
    try {
      const destinatarios =
        await this.permissions.getCompanyUserIdsWithWriteAccess(companyId, 'RRHH');
      for (const userId of destinatarios) {
        await this.notifications.create({
          userId,
          companyId,
          title: 'Nueva queja externa',
          message: `Llegó una queja del formulario público (${tipo} · ${sede}).`,
          link: ENLACE_QUEJAS_GESTION,
        });
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo avisar a RRHH de la queja externa: ${(err as Error).message}`,
      );
    }
  }

  // ---------- Configuración (RRHH) ----------

  async getConfig(companyId: number) {
    const [setting, opciones, otraActiva] = await Promise.all([
      this.prisma.complaintPublicSetting.findUnique({ where: { companyId } }),
      this.prisma.complaintPublicOption.findMany({
        where: { companyId },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.complaintPublicSetting.findFirst({
        where: { enabled: true, companyId: { not: companyId } },
        select: { companyId: true },
      }),
    ]);
    return {
      enabled: setting?.enabled ?? false,
      otraEmpresaActiva: !!otraActiva,
      tipos: opciones.filter((o) => o.kind === 'TIPO'),
      sedes: opciones.filter((o) => o.kind === 'SEDE'),
    };
  }

  async setEnabled(companyId: number, enabled: boolean) {
    if (enabled) {
      const otra = await this.prisma.complaintPublicSetting.findFirst({
        where: { enabled: true, companyId: { not: companyId } },
      });
      if (otra) {
        throw new ConflictException(
          'Otra empresa ya recibe las quejas de quejas.gemeseg.com. Solo una empresa puede tenerlo activo.',
        );
      }
      const etapaInicial = await this.prisma.complaintStage.findFirst({
        where: { companyId, isInitial: true },
      });
      if (!etapaInicial) {
        throw new BadRequestException(
          'Antes de activarlo, la empresa necesita una etapa inicial en el tablero de quejas.',
        );
      }
      // Primera vez: deja la lista base para que el formulario no salga vacío.
      const hay = await this.prisma.complaintPublicOption.count({
        where: { companyId },
      });
      if (hay === 0) {
        await this.prisma.complaintPublicOption.createMany({
          data: [
            ...SEDES_INICIALES.map((label, order) => ({
              companyId,
              kind: 'SEDE',
              label,
              order,
            })),
            ...TIPOS_INICIALES.map((label, order) => ({
              companyId,
              kind: 'TIPO',
              label,
              order,
            })),
          ],
          skipDuplicates: true,
        });
      }
    }
    await this.prisma.complaintPublicSetting.upsert({
      where: { companyId },
      create: { companyId, enabled },
      update: { enabled },
    });
    return this.getConfig(companyId);
  }

  async addOption(companyId: number, dto: CreateComplaintPublicOptionDto) {
    const label = dto.label.trim();
    const ya = await this.prisma.complaintPublicOption.findFirst({
      where: { companyId, kind: dto.kind, label: { equals: label, mode: 'insensitive' } },
    });
    if (ya) throw new ConflictException('Ya existe una opción con ese nombre.');
    const ultimo = await this.prisma.complaintPublicOption.findFirst({
      where: { companyId, kind: dto.kind },
      orderBy: { order: 'desc' },
    });
    return this.prisma.complaintPublicOption.create({
      data: { companyId, kind: dto.kind, label, order: (ultimo?.order ?? -1) + 1 },
    });
  }

  // Las quejas ya recibidas guardan el texto, no el id: quitar una opción no
  // borra ni cambia ninguna queja.
  async removeOption(companyId: number, id: number) {
    const opcion = await this.prisma.complaintPublicOption.findFirst({
      where: { id, companyId },
    });
    if (!opcion) throw new NotFoundException('Opción no encontrada.');
    await this.prisma.complaintPublicOption.delete({ where: { id } });
    return { id };
  }
}
