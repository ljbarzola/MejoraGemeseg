import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GmailMailService } from '../mail/gmail-mail.service';
import { CustodiasService } from './custodias.service';
import { CustodiasConfigService } from './custodias-config.service';
import { CustodiasGuiaService } from './custodias-guia.service';
import { PdfService } from './pdf.service';
import { CustodiasCampoOficinaService } from './custodias-campo-oficina.service';
import { CustodiasEnlaceFotosService } from './custodias-enlace-fotos.service';
import {
  fechaEcuador,
  leerJson,
  normalizarCorreos,
  reemplazarMarcadores,
  valoresDeLista,
} from './custodias-campo.util';

const MAX_DESTINATARIOS = 20;

interface EnvioFila {
  id: number;
  custodiaId: number;
  para: unknown;
  copia: unknown;
  asunto: string;
  enviadoPor: number | null;
  enviadoPorNombre: string | null;
  enviadoEn: Date;
  ok: boolean;
  error: string | null;
}

/** Envío de la guía de custodia (PDF) al cliente por correo, con historial. */
@Injectable()
export class CustodiasEnvioService {
  private readonly logger = new Logger(CustodiasEnvioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: GmailMailService,
    private readonly custodias: CustodiasService,
    private readonly config: CustodiasConfigService,
    private readonly guias: CustodiasGuiaService,
    private readonly pdf: PdfService,
    private readonly campoOficina: CustodiasCampoOficinaService,
    private readonly enlaces: CustodiasEnlaceFotosService,
  ) {}

  private mapear(f: EnvioFila) {
    return {
      id: f.id,
      custodiaId: f.custodiaId,
      para: leerJson<string[]>(f.para, []),
      copia: leerJson<string[]>(f.copia, []),
      asunto: f.asunto,
      enviadoPor: f.enviadoPor,
      enviadoPorNombre: f.enviadoPorNombre,
      enviadoEn: f.enviadoEn,
      ok: f.ok,
      // El detalle técnico queda guardado en la base y en el registro del servidor; a la pantalla solo va algo corto.
      error: f.ok ? null : 'No se pudo enviar el correo.',
    };
  }

  async historial(custodiaId: number, companyId: number) {
    await this.custodias.findOne(custodiaId, companyId);
    const filas = await this.prisma.$queryRaw<EnvioFila[]>`
      SELECT "id", "custodiaId", "para", "copia", "asunto", "enviadoPor", "enviadoPorNombre", "enviadoEn", "ok", "error"
      FROM "CustodiaEnvio"
      WHERE "custodiaId" = ${custodiaId} AND "companyId" = ${companyId}
      ORDER BY "enviadoEn" DESC, "id" DESC`;
    return filas.map((f) => this.mapear(f));
  }

  /** Lo que la ventana «Enviar al cliente» muestra de entrada: correos sugeridos, copias, asunto y texto ya armados. */
  async sugerencia(custodiaId: number, companyId: number) {
    const viaje = await this.custodias.findOne(custodiaId, companyId);
    const cfg = await this.config.leerConfig(companyId);

    const sugeridos: { nombre: string; correo: string; origen: 'CLIENTE' | 'CONTACTO' }[] = [];
    const vistos = new Set<string>();
    const agregar = (nombre: string, correo: string, origen: 'CLIENTE' | 'CONTACTO') => {
      const c = correo.trim().toLowerCase();
      if (!c || vistos.has(c)) return;
      vistos.add(c);
      sugeridos.push({ nombre, correo: c, origen });
    };
    if (viaje.clienteId) {
      const cliente = await this.prisma.salesClient.findFirst({
        where: { id: viaje.clienteId, companyId },
        select: { name: true, email: true },
      });
      if (cliente?.email) agregar(cliente.name, cliente.email, 'CLIENTE');
      try {
        const contactos = await this.prisma.salesContact.findMany({
          where: { companyId, salesClientId: viaje.clienteId },
          orderBy: { name: 'asc' },
        });
        for (const c of contactos) for (const correo of valoresDeLista(c.emails)) agregar(c.name, correo, 'CONTACTO');
      } catch (err) {
        this.logger.warn(`No se pudieron leer los contactos del cliente: ${(err as Error).message}`);
      }
    }

    const valores = this.valoresMarcadores(viaje);
    return {
      sugeridos,
      copia: cfg.correoCopias,
      asunto: reemplazarMarcadores(cfg.correoAsunto, valores),
      texto: reemplazarMarcadores(cfg.correoTexto, valores),
      envios: await this.historial(custodiaId, companyId),
    };
  }

  private valoresMarcadores(viaje: {
    numeroGuia: string;
    cliente: string;
    fechaHoraSalida: Date | null;
    createdAt: Date;
  }) {
    return {
      guia: viaje.numeroGuia,
      cliente: (viaje.cliente ?? '').trim(),
      fecha: fechaEcuador(viaje.fechaHoraSalida ?? viaje.createdAt),
    };
  }

  /** El PDF de la guía de un viaje (el mismo que se descarga). */
  async pdfDeViaje(custodiaId: number, companyId: number) {
    const viaje = await this.custodias.findOne(custodiaId, companyId);
    const contexto = await this.guias.contextoPdf(companyId, viaje);
    // Recorrido, firmas reales y fotos de campo (Fase 2); si algo falla, la guía sale igual, sin ellos.
    const campo = await this.campoOficina.datosParaPdf(custodiaId, companyId).catch((err) => {
      this.logger.warn(`No se pudo leer lo de campo para el PDF de la guía ${viaje.numeroGuia}: ${(err as Error).message}`);
      return null;
    });
    const buffer = await this.pdf.generarPdfOrdenCustodia(viaje, { ...contexto, campo });
    return { viaje, buffer };
  }

  async enviar(
    custodiaId: number,
    companyId: number,
    user: { userId: number },
    dto: { para: unknown; copia?: unknown; asunto: string; texto: string },
  ) {
    const para = normalizarCorreos(dto.para, { max: MAX_DESTINATARIOS, min: 1, etiqueta: 'los destinatarios' });
    // Quien ya va en «Para» no se repite en copia.
    const copia = normalizarCorreos(dto.copia ?? [], { max: MAX_DESTINATARIOS, etiqueta: 'las copias' }).filter(
      (c) => !para.includes(c),
    );
    const asunto = (dto.asunto ?? '').trim();
    let texto = (dto.texto ?? '').trim();
    if (!asunto) throw new BadRequestException('Escribe el asunto del correo.');
    if (!texto) throw new BadRequestException('Escribe el texto del correo.');

    const { viaje, buffer } = await this.pdfDeViaje(custodiaId, companyId);
    const nombreUsuario = await this.prisma.user
      .findUnique({ where: { id: user.userId }, select: { fullName: true } })
      .then((u) => u?.fullName ?? null)
      .catch(() => null);

    // Si el viaje tiene fotos, el correo lleva el enlace público para verlas (vence a los N días de la configuración).
    try {
      const cfg = await this.config.leerConfig(companyId);
      const enlace = await this.enlaces.crear(custodiaId, cfg.diasEnlaceFotos);
      if (enlace) {
        const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
        texto += `\n\nFotos del recorrido: ${base}/guia-fotos/${enlace.token} (disponible hasta ${fechaEcuador(enlace.expiraEn)})`;
      }
    } catch (err) {
      // Sin el enlace el correo sale igual: la guía en PDF ya lleva las fotos principales.
      this.logger.warn(`No se pudo crear el enlace de fotos de la guía ${viaje.numeroGuia}: ${(err as Error).message}`);
    }

    // Remitente: el que la empresa configuró en «Configurar notificaciones», como el resto de correos del sistema.
    const notif = await this.prisma.notificationConfig.findUnique({ where: { companyId } });
    const archivo = `Guia-${String(viaje.numeroGuia).replace(/[^a-zA-Z0-9_.-]/g, '_')}.pdf`;

    let ok = true;
    let detalle: string | null = null;
    try {
      await this.mail.sendMail({
        to: para,
        cc: copia.length ? copia : undefined,
        subject: asunto,
        bodyText: texto,
        attachments: [{ filename: archivo, contentType: 'application/pdf', content: buffer }],
        from: notif?.senderEmail ?? null,
        fromName: notif?.senderName ?? null,
      });
    } catch (err) {
      ok = false;
      detalle = ((err as Error)?.message ?? 'Error desconocido').slice(0, 1000);
      this.logger.error(`No se pudo enviar la guía ${viaje.numeroGuia} al cliente: ${detalle}`);
    }

    const filas = await this.prisma.$queryRaw<EnvioFila[]>`
      INSERT INTO "CustodiaEnvio"
        ("custodiaId", "companyId", "para", "copia", "asunto", "enviadoPor", "enviadoPorNombre", "ok", "error")
      VALUES (${custodiaId}, ${companyId}, ${JSON.stringify(para)}::jsonb, ${JSON.stringify(copia)}::jsonb, ${asunto},
              ${user.userId}, ${nombreUsuario}, ${ok}, ${detalle})
      RETURNING "id", "custodiaId", "para", "copia", "asunto", "enviadoPor", "enviadoPorNombre", "enviadoEn", "ok", "error"`;

    if (!ok) {
      throw new HttpException(
        'No se pudo enviar el correo. Revisa las direcciones e intenta de nuevo.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return this.mapear(filas[0]);
  }
}
