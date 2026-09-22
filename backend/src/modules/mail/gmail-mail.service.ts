import { Injectable, Logger, BadRequestException } from '@nestjs/common';
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
  // UN cliente POR REMITENTE. La delegación de dominio funciona
  // impersonando a una persona concreta (el `subject` del cliente de auth),
  // así que enviar desde otra casilla exige otro cliente. Con un único
  // cliente cacheado, todo salía siempre desde GMAIL_SENDER_ADDRESS aunque
  // cada empresa hubiera configurado el suyo.
  private readonly clientesPorRemitente = new Map<string, any>();
  // Se guardan para poder explicar los errores de Google indicando el
  // client_id concreto que hay que autorizar (ver explicarErrorGoogle).
  private clientEmailEnUso: string | null = null;
  private clientIdEnUso: string | null = null;
  private projectIdEnUso: string | null = null;

  // El correo usa su PROPIA cuenta de servicio, distinta de la de Drive.
  //
  // Por qué: la delegación de dominio (domain-wide delegation) se autoriza en
  // Google Workspace por client_id. En GEMESEG se autorizó para
  // `correo-gemeseg-com@...` (client_id 115386168102739974811), NO para la de
  // Drive (`drive-sync@...`). Si este servicio usara la de Drive, Google
  // rechazaría el envío con `unauthorized_client` aunque todo lo demás esté
  // bien — y ese error no dice en ningún lado que el problema sea la cuenta
  // equivocada. Además es lo correcto en seguridad: la cuenta que manda
  // correo como una persona real no tiene por qué ser la misma que sincroniza
  // archivos.
  //
  // Orden de búsqueda:
  //   1. GMAIL_SERVICE_ACCOUNT_JSON (contenido) — producción / Cloud Run.
  //   2. google-service-account-mail.json en la raíz del backend — local.
  //   3. La cuenta de Drive, solo como último recurso y avisando en el log,
  //      para no romper instalaciones viejas que aún no separan las dos.
  private loadServiceAccountKey(): any {
    if (process.env.GMAIL_SERVICE_ACCOUNT_JSON) {
      this.logger.log(
        'GmailMailService: credenciales de correo cargadas de GMAIL_SERVICE_ACCOUNT_JSON',
      );
      return JSON.parse(process.env.GMAIL_SERVICE_ACCOUNT_JSON);
    }

    const rutasCorreo = this.rutasCandidatas('google-service-account-mail.json');
    for (const candidate of rutasCorreo) {
      if (fs.existsSync(candidate)) {
        this.logger.log(
          `GmailMailService: credenciales de correo cargadas de ${candidate}`,
        );
        return JSON.parse(fs.readFileSync(candidate, 'utf-8'));
      }
    }

    const rutasDrive = this.rutasCandidatas('google-service-account.json');
    for (const candidate of rutasDrive) {
      if (fs.existsSync(candidate)) {
        this.logger.warn(
          `GmailMailService: no hay cuenta de servicio propia para correo; usando la de Drive (${candidate}). Si Google responde "unauthorized_client", es porque la delegación de dominio está autorizada para OTRO client_id.`,
        );
        return JSON.parse(fs.readFileSync(candidate, 'utf-8'));
      }
    }

    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      this.logger.warn(
        'GmailMailService: usando GOOGLE_SERVICE_ACCOUNT_JSON (cuenta de Drive) para enviar correo, no una cuenta propia.',
      );
      return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    }

    throw new BadRequestException(
      'No hay cuenta de servicio configurada para enviar correo. Coloca google-service-account-mail.json en la raíz del backend, o define GMAIL_SERVICE_ACCOUNT_JSON.',
    );
  }

  // Raíz del backend en runtime, o 4 niveles arriba cuando corre compilado
  // desde dist/src/modules/personal/services.
  private rutasCandidatas(fileName: string): string[] {
    return [
      path.join(process.cwd(), fileName),
      path.join(__dirname, '..', '..', '..', '..', fileName),
    ];
  }

  /**
   * Casilla desde la que se envía. Cada empresa puede configurar la suya
   * (NotificationConfig.senderEmail); `GMAIL_SENDER_ADDRESS` queda solo como
   * valor por defecto para lo que no es de una empresa concreta.
   */
  private resolverRemitente(from?: string | null): string {
    const sender = (from || '').trim() || process.env.GMAIL_SENDER_ADDRESS?.trim();
    if (!sender) {
      throw new BadRequestException(
        'No hay una casilla de envío configurada. Defínela en "Configurar notificaciones", o pide a Sistemas que configure GMAIL_SENDER_ADDRESS en el servidor.',
      );
    }
    return sender;
  }

  // Construye (y cachea) un cliente Gmail POR REMITENTE. Se resuelve
  // perezosamente en el primer envío, no al arrancar: así una configuración
  // de correo incompleta nunca puede tumbar el arranque del backend, solo
  // falla ese envío puntual.
  private getGmailClient(senderAddress: string) {
    const cacheado = this.clientesPorRemitente.get(senderAddress);
    if (cacheado) return cacheado;

    const keyFile = this.loadServiceAccountKey();

    this.logger.log(
      `GmailMailService: enviando como "${senderAddress}" con la cuenta de servicio ${keyFile.client_email} (client_id ${keyFile.client_id})`,
    );

    const auth = new google.auth.GoogleAuth({
      credentials: keyFile,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      clientOptions: { subject: senderAddress },
    });

    const cliente = google.gmail({ version: 'v1', auth });
    this.clientesPorRemitente.set(senderAddress, cliente);
    this.clientEmailEnUso = keyFile.client_email;
    this.clientIdEnUso = keyFile.client_id;
    this.projectIdEnUso = keyFile.project_id;
    return cliente;
  }

  /**
   * Comprueba que una casilla sirva como remitente, SIN mandar ningún correo:
   * pide el token impersonándola, que es justo el paso que falla si esa
   * dirección no existe en el dominio o es un alias.
   *
   * Sirve para avisar al guardar la configuración, en vez de dejar que el
   * error aparezca recién cuando alguien intente enviar un recordatorio.
   */
  async verificarRemitente(senderAddress: string): Promise<void> {
    const sender = this.resolverRemitente(senderAddress);
    try {
      const keyFile = this.loadServiceAccountKey();
      const auth = new google.auth.GoogleAuth({
        credentials: keyFile,
        scopes: ['https://www.googleapis.com/auth/gmail.send'],
        clientOptions: { subject: sender },
      });
      const cliente = await auth.getClient();
      await cliente.getAccessToken();
    } catch (err) {
      throw new BadRequestException(this.explicarErrorGoogle(err, sender));
    }
  }

  /**
   * Traduce los errores de Google a algo que se pueda accionar. Tal como
   * vienen ("unauthorized_client", "Precondition check failed") no dicen qué
   * falta configurar, y se pierde media hora adivinando.
   */
  private explicarErrorGoogle(err: any, remitente?: string): string {
    // `response.data.error` a veces es un string ("unauthorized_client") y
    // otras un objeto {code, message, errors}. Convertirlo con String() sin
    // mirar daba literalmente "[object Object]" y escondía el motivo real.
    const errorData = err?.response?.data?.error;
    const detalle = String(
      err?.response?.data?.error_description ||
        (typeof errorData === 'string' ? errorData : errorData?.message) ||
        err?.errors?.[0]?.message ||
        err?.message ||
        err,
    );
    // Se busca sobre TODAS las piezas juntas, no solo sobre la descripción: el
    // código ("invalid_grant") y el texto ("Invalid email or User ID") vienen
    // en campos distintos según el tipo de fallo, y quedarse con uno solo hacía
    // que la traducción no reconociera el error y saliera el mensaje crudo de
    // Google, que no le dice nada a quien lo lee.
    const crudo = [
      detalle,
      typeof errorData === 'string' ? errorData : '',
      err?.message ?? '',
    ]
      .filter(Boolean)
      .join(' | ');
    const sender =
      remitente || process.env.GMAIL_SENDER_ADDRESS || '(sin definir)';

    if (/unauthorized_client/i.test(crudo)) {
      return `Google rechazó la cuenta de servicio. En el Admin de Google Workspace (Seguridad → Controles de API → Delegación de todo el dominio) debe estar autorizado el client_id ${this.clientIdEnUso ?? '(desconocido)'} con el ámbito https://www.googleapis.com/auth/gmail.send. Detalle: ${detalle}`;
    }
    if (/invalid_grant|Invalid email or User ID/i.test(crudo)) {
      return `La casilla "${sender}" no existe en tu dominio de Google Workspace, o no tiene buzón propio (los alias y los grupos no sirven como remitente). Revisa que esté bien escrita y que sea un usuario real. Detalle: ${detalle}`;
    }
    if (/Gmail API has not been used|accessNotConfigured|SERVICE_DISABLED/i.test(crudo)) {
      return `La API de Gmail no está habilitada en el proyecto de Google Cloud "${this.projectIdEnUso ?? 'agentes-504115'}". Habilítala en la consola y espera un par de minutos. Detalle: ${detalle}`;
    }
    if (/Precondition check failed/i.test(crudo)) {
      return `Google no pudo impersonar a "${sender}". Suele ser que esa casilla no existe en el dominio, o que la delegación se autorizó para otro client_id. Detalle: ${detalle}`;
    }
    return detalle;
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
    from: string;
    fromName?: string | null;
  }): string {
    // MIME simple, texto plano UTF-8. El "From" DEBE coincidir con la casilla
    // impersonada (el subject de la delegación) o Gmail rechaza el envío, por
    // eso lo recibe ya resuelto en vez de leerlo del entorno por su cuenta.
    //
    // Con nombre visible sale como: Recursos Humanos <rrhh@gemeseg.com>. El
    // nombre va codificado en base64 para que las tildes no se rompan.
    const nombre = (params.fromName || '').trim();
    const from = nombre
      ? `=?UTF-8?B?${Buffer.from(nombre, 'utf-8').toString('base64')}?= <${params.from}>`
      : params.from;
    const lines = [
      `From: ${from}`,
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
    /** Casilla desde la que se envía. Si no viene, GMAIL_SENDER_ADDRESS. */
    from?: string | null;
    /** Nombre visible del remitente ("Recursos Humanos"). */
    fromName?: string | null;
  }): Promise<void> {
    const remitente = this.resolverRemitente(params.from);
    const gmail = this.getGmailClient(remitente);
    const raw = this.buildRawMessage({ ...params, from: remitente });
    try {
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
      });
      this.logger.log(`Correo enviado a ${params.to} desde ${remitente}`);
    } catch (err: any) {
      const explicado = this.explicarErrorGoogle(err, remitente);
      this.logger.error(`No se pudo enviar el correo a ${params.to}: ${explicado}`);
      // Ese cliente quedó construido con algo que no sirve; se descarta para
      // que el siguiente intento lo reconstruya (si acaban de corregir la
      // configuración, no hace falta reiniciar el servidor).
      this.clientesPorRemitente.delete(remitente);
      throw new BadRequestException(`No se pudo enviar el correo. ${explicado}`);
    }
  }
}
