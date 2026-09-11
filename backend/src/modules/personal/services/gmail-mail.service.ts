import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

// Servicio de envío de correo (Fase C de Entidades/Cumplimiento) vía Gmail
// API, usando la MISMA service account que ya usa DriveService (mismo
// google-service-account.json / GOOGLE_SERVICE_ACCOUNT_JSON, misma lógica de
// resolución — copiada deliberadamente en vez de reutilizada, ver comentario
// abajo), pero con un cliente de auth SEPARADO: distinto scope (`gmail.send`
// en vez de `drive`) y `subject` (domain-wide delegation, "enviar como" una
// casilla real del Workspace). No se toca DriveService.getDriveClient() ni su
// scope para mantener este envío de correo aislado de la sincronización de Drive.
@Injectable()
export class GmailMailService {
  private readonly logger = new Logger(GmailMailService.name);
  private gmailClient: any = null;

  // Carga el service account JSON. Misma búsqueda de ruta que
  // DriveService.getDriveClient() (raíz del backend en runtime, o 4 niveles
  // arriba de dist/src/modules/personal/services en el build compilado) —
  // copiada literalmente para no acoplar este servicio a DriveService.
  private loadServiceAccountKey(): any {
    const candidates = [
      path.join(process.cwd(), 'google-service-account.json'),
      path.join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'google-service-account.json',
      ),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        this.logger.log(
          `GmailMailService: credenciales cargadas de ${candidate}`,
        );
        return JSON.parse(fs.readFileSync(candidate, 'utf-8'));
      }
    }

    // Fallback para Cloud Run, mismo criterio que DriveService.getDriveClient().
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      this.logger.log(
        'GmailMailService: credenciales cargadas de GOOGLE_SERVICE_ACCOUNT_JSON',
      );
      return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    }

    throw new Error(
      'Google Service Account no configurado. Coloca google-service-account.json en la raíz del backend o define GOOGLE_SERVICE_ACCOUNT_JSON.',
    );
  }

  // Construye (y cachea) el cliente Gmail con domain-wide delegation. A
  // diferencia de getDriveClient(), esto NO se resuelve en el constructor ni
  // al arrancar el módulo: se resuelve perezosamente en el primer envío, así
  // que la ausencia de GMAIL_SENDER_ADDRESS o del archivo de credenciales
  // nunca puede tumbar el arranque del backend — solo falla ese envío puntual.
  private getGmailClient() {
    if (this.gmailClient) return this.gmailClient;

    const senderAddress = process.env.GMAIL_SENDER_ADDRESS;
    if (!senderAddress) {
      throw new Error(
        'GMAIL_SENDER_ADDRESS no está configurado. Define esta variable de entorno con la casilla de Google Workspace que enviará los avisos (requiere domain-wide delegation habilitada para la service account) antes de poder enviar correo.',
      );
    }

    const keyFile = this.loadServiceAccountKey();

    const auth = new google.auth.GoogleAuth({
      credentials: keyFile,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      clientOptions: { subject: senderAddress },
    });

    this.gmailClient = google.gmail({ version: 'v1', auth });
    return this.gmailClient;
  }

  private encodeBase64Url(input: string): string {
    return Buffer.from(input, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private buildRawMessage(params: {
    to: string;
    subject: string;
    bodyText: string;
  }): string {
    const senderAddress = process.env.GMAIL_SENDER_ADDRESS;
    // MIME simple, texto plano UTF-8. El "From" debe coincidir con la casilla
    // impersonada (subject de la delegación) o Gmail rechaza el envío.
    const lines = [
      `From: ${senderAddress}`,
      `To: ${params.to}`,
      `Subject: =?UTF-8?B?${Buffer.from(params.subject, 'utf-8').toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      params.bodyText,
    ];
    return this.encodeBase64Url(lines.join('\r\n'));
  }

  // Deja que cualquier error se propague (credenciales faltantes, delegación
  // no configurada, dirección inválida, etc.) — el llamador (AlertaVencimientoService)
  // es responsable de capturarlo por destinatario para que un correo fallido
  // no aborte el resto del lote.
  async sendMail(params: {
    to: string;
    subject: string;
    bodyText: string;
  }): Promise<void> {
    const gmail = this.getGmailClient();
    const raw = this.buildRawMessage(params);
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
  }
}
