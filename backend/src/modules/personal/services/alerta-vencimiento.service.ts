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
import { GmailMailService } from './gmail-mail.service';
import { GuardiaContactoService } from './guardia-contacto.service';

export type MedioRecordatorio = 'EMAIL';

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
  ) {}

  // Envío manual y personalizado (reemplaza el antiguo cron diario que
  // avisaba en bulk a todos los guardias): RRHH decide, guardia por guardia,
  // cuándo notificar. Junta en un solo correo todo lo FALTANTE/VENCIDO/POR_VENCER
  // de ese guardia — no un correo por requisito.
  async enviarRecordatorio(
    companyId: number,
    cedula: string,
    medio: string,
  ): Promise<RecordatorioResult> {
    if (medio !== 'EMAIL') {
      throw new BadRequestException(
        'Este medio de envío todavía no está disponible.',
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

    await this.gmailMailService.sendMail({ to: email, subject, bodyText });

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
}
