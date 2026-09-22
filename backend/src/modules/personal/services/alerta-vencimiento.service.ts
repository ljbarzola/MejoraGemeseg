import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CumplimientoEntidadService,
  RequisitoConEstado,
} from './cumplimiento-entidad.service';
import { GmailMailService } from '../../mail/gmail-mail.service';
import { GuardiaContactoService } from './guardia-contacto.service';
import { WhatsAppService } from './whatsapp.service';

export type MedioRecordatorio = 'EMAIL' | 'WHATSAPP';

export interface RecordatorioResult {
  enviado: boolean;
  cantidadNotificada: number;
  message?: string;
}

@Injectable()
export class AlertaVencimientoService {
  private readonly logger = new Logger(AlertaVencimientoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cumplimientoEntidadService: CumplimientoEntidadService,
    private readonly gmailMailService: GmailMailService,
    private readonly guardiaContactoService: GuardiaContactoService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  async enviarRecordatorio(
    companyId: number,
    cedula: string,
    medio: string,
  ): Promise<RecordatorioResult> {
    if (medio !== 'EMAIL' && medio !== 'WHATSAPP') {
      throw new BadRequestException(
        'Medio de envío no válido. Usa EMAIL o WHATSAPP.',
      );
    }

    const compliance =
      await this.cumplimientoEntidadService.getComplianceForGuardia(
        companyId,
        cedula,
      );

    if (!compliance.tieneAsignacion) {
      throw new NotFoundException(
        compliance.mensaje || 'Este guardia no tiene una asignación activa.',
      );
    }

    const pendientes = compliance.requisitos.filter(
      (r) =>
        r.estado === 'FALTANTE' ||
        r.estado === 'VENCIDO' ||
        r.estado === 'POR_VENCER',
    );

    if (pendientes.length === 0) {
      return {
        enviado: false,
        cantidadNotificada: 0,
        message: 'Este guardia está al día — no hay nada que notificar.',
      };
    }

    if (medio === 'WHATSAPP') {
      return this.enviarPorWhatsApp(companyId, cedula, compliance.asignacion!.nombreGuardia, compliance.entidad!.nombre, pendientes);
    }

    // EMAIL (flujo existente)
    const config = await this.prisma.notificationConfig.findUnique({
      where: { companyId },
    });
    if (!config?.senderEmail) {
      throw new BadRequestException(
        'No hay correo de envío configurado. Ve a "Configurar notificaciones" en la página de Cumplimiento.',
      );
    }

    const contacto = await this.guardiaContactoService.get(companyId, cedula);
    if (!contacto?.email) {
      throw new BadRequestException(
        'Este guardia no tiene correo de contacto registrado. Agrégalo desde su detalle de cumplimiento antes de enviar un recordatorio.',
      );
    }
    const email = contacto.email;

    const { subject, bodyText } = this.buildEmailContent({
      nombreGuardia: compliance.asignacion!.nombreGuardia,
      entidadNombre: compliance.entidad!.nombre,
      pendientes,
    });

    // El remitente es el que la empresa configuró, no una dirección fija del
    // servidor. Hasta 2026-09-22 este `senderEmail` se exigía pero NO se
    // usaba: todo salía desde GMAIL_SENDER_ADDRESS, así que la pantalla
    // prometía algo que no cumplía y nadie podía notarlo salvo mirando el
    // correo recibido.
    await this.gmailMailService.sendMail({
      to: email,
      subject,
      bodyText,
      from: config.senderEmail,
      fromName: config.senderName,
    });

    await this.registrarAlertas(companyId, pendientes);

    return { enviado: true, cantidadNotificada: pendientes.length };
  }

  private async enviarPorWhatsApp(
    companyId: number,
    cedula: string,
    nombreGuardia: string,
    entidadNombre: string,
    pendientes: RequisitoConEstado[],
  ): Promise<RecordatorioResult> {
    const ficha = await this.prisma.guardiaFichaPersonal.findUnique({
      where: { companyId_cedula: { companyId, cedula } },
    });
    if (!ficha?.telefono) {
      throw new BadRequestException(
        'Este guardia no tiene número de teléfono registrado. Actualiza su ficha personal antes de enviar por WhatsApp.',
      );
    }

    const config = await this.prisma.notificationConfig.findUnique({
      where: { companyId },
    });
    if (!config?.whatsappFrom) {
      throw new BadRequestException(
        'No hay número de WhatsApp Business configurado. Ve a Configuración de notificaciones en Cumplimiento.',
      );
    }

    const bodyText = this.buildWhatsAppContent({
      nombreGuardia,
      entidadNombre,
      pendientes,
    });

    await this.whatsappService.sendText({
      to: ficha.telefono,
      from: config.whatsappFrom,
      body: bodyText,
    });

    await this.registrarAlertas(companyId, pendientes);

    return { enviado: true, cantidadNotificada: pendientes.length };
  }

  // Deja constancia de los ítems notificados que sí tienen un documento real
  // asociado (VENCIDO/POR_VENCER) — un FALTANTE no tiene EmployeeDocument al
  // que referenciar (el guardia nunca subió nada), así que no hay fila que
  // registrar para ese caso; el correo igual lo incluyó.
  private async registrarAlertas(
    companyId: number,
    pendientes: RequisitoConEstado[],
  ) {
    for (const r of pendientes) {
      if (!r.documento?.expiryDate) continue;
      const requisito = r.requisito as { id: number };
      try {
        await this.prisma.alertaVencimiento.upsert({
          where: {
            employeeDocumentId_requisitoDocumentoId_expiryDateAlertado: {
              employeeDocumentId: r.documento.id,
              requisitoDocumentoId: requisito.id,
              expiryDateAlertado: new Date(r.documento.expiryDate),
            },
          },
          create: {
            employeeDocumentId: r.documento.id,
            requisitoDocumentoId: requisito.id,
            expiryDateAlertado: new Date(r.documento.expiryDate),
            companyId,
            success: true,
            errorMessage: null,
          },
          update: { success: true, errorMessage: null, sentAt: new Date() },
        });
      } catch (err: any) {
        this.logger.error(
          `No se pudo registrar AlertaVencimiento: ${err.message}`,
        );
      }
    }
  }

  private buildEmailContent(params: {
    nombreGuardia: string;
    entidadNombre: string;
    pendientes: RequisitoConEstado[];
  }): { subject: string; bodyText: string } {
    const { nombreGuardia, entidadNombre, pendientes } = params;

    const lineas = pendientes.map((r) => {
      const nombre = (r.requisito as { nombre: string }).nombre;
      if (r.estado === 'FALTANTE')
        return `- ${nombre}: no se ha recibido este documento todavía.`;
      const fechaStr = r.documento?.expiryDate
        ? new Date(r.documento.expiryDate).toLocaleDateString('es-EC', {
            timeZone: 'UTC',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
        : '';
      return r.estado === 'VENCIDO'
        ? `- ${nombre}: VENCIÓ el ${fechaStr}.`
        : `- ${nombre}: vence el ${fechaStr}.`;
    });

    const subject = `Recordatorio de documentos pendientes — ${entidadNombre}`;
    const bodyText = [
      `Hola ${nombreGuardia},`,
      '',
      `Este es un recordatorio de Recursos Humanos sobre tu asignación en ${entidadNombre}. Los siguientes documentos necesitan tu atención:`,
      '',
      ...lineas,
      '',
      'Por favor gestiona la renovación o entrega de estos documentos a la brevedad y coordina con Recursos Humanos para hacerlos llegar.',
      '',
      'Este es un aviso generado por el sistema, no es necesario responder a este correo.',
    ].join('\n');

    return { subject, bodyText };
  }

  private buildWhatsAppContent(params: {
    nombreGuardia: string;
    entidadNombre: string;
    pendientes: RequisitoConEstado[];
  }): string {
    const { nombreGuardia, entidadNombre, pendientes } = params;

    const lineas = pendientes.map((r) => {
      const nombre = (r.requisito as { nombre: string }).nombre;
      if (r.estado === 'FALTANTE')
        return `- ${nombre}: pendiente`;
      const fechaStr = r.documento?.expiryDate
        ? new Date(r.documento.expiryDate).toLocaleDateString('es-EC', {
            timeZone: 'UTC',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
        : '';
      return r.estado === 'VENCIDO'
        ? `- ${nombre}: VENCIO el ${fechaStr}`
        : `- ${nombre}: vence el ${fechaStr}`;
    });

    return [
      `Hola ${nombreGuardia},`,
      ``,
      `Recordatorio de RRHH - Asignacion en ${entidadNombre}:`,
      ``,
      ...lineas,
      ``,
      `Gestiona la renovacion/entrega de estos documentos y coordina con RRHH.`,
    ].join('\n');
  }
}
