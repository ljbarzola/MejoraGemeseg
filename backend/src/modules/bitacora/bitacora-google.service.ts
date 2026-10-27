import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';

export interface ResultadoSincronizacion {
  ok: boolean;
  mensaje: string;
  personas: number;
  leidos: number;
  guardados: number;
}

const SCOPE_INFORMES =
  'https://www.googleapis.com/auth/admin.reports.audit.readonly';
const HORAS_ATRAS = 48;
const MAX_PAGINAS = 20;
const APLICACIONES = ['login', 'drive'] as const;
// Eventos de Drive que cuentan como actividad de la persona.
const EVENTOS_DRIVE = new Set([
  'create',
  'edit',
  'upload',
  'view',
  'rename',
  'move',
  'delete',
  'trash',
  'download',
]);

interface FilaGoogle {
  userId: number;
  companyId: number | null;
  fuente: string;
  modulo: string;
  accion: string;
  nombre: string | null;
  externalId: string;
  ocurridoEn: Date;
}

/**
 * Lee de Google Workspace (API de informes de auditoría) los inicios de sesión y
 * la actividad en Drive SOLO de las personas a las que un administrador les
 * activó la hoja del día, y solo lo ocurrido desde el momento de la activación.
 * Pide los informes persona por persona (nunca «todos»): de quien no está activo
 * ni siquiera se descarga nada. Es solo lectura. Se vuelve a leer una ventana de
 * 48 horas cada vez porque Google tarda en publicar algunos eventos; los
 * repetidos se descartan por su identificador.
 *
 * Mientras no esté autorizado el permiso en la consola de Workspace, no falla el
 * servidor: devuelve un mensaje claro y no guarda nada.
 */
@Injectable()
export class BitacoraGoogleService {
  private readonly logger = new Logger(BitacoraGoogleService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cuenta de servicio con la delegación de dominio ya autorizada en el
   * Workspace de GEMESEG: la de CORREO (`correo-gemeseg-com@...`), no la de
   * Drive (ver AGENTS.md, «La cuenta de correo NO es la de Drive»). Mismo orden
   * de búsqueda que GmailMailService, sin caer en la de Drive porque Google la
   * rechazaría con `unauthorized_client`:
   *   1. GMAIL_SERVICE_ACCOUNT_JSON (contenido) — producción / Cloud Run.
   *   2. google-service-account-mail.json en la raíz del backend — local.
   */
  private cargarCredenciales(): Record<string, string> | null {
    if (process.env.GMAIL_SERVICE_ACCOUNT_JSON) {
      return JSON.parse(process.env.GMAIL_SERVICE_ACCOUNT_JSON) as Record<
        string,
        string
      >;
    }
    for (const base of [
      process.cwd(),
      path.join(__dirname, '..', '..', '..'),
    ]) {
      const archivo = path.join(base, 'google-service-account-mail.json');
      if (fs.existsSync(archivo)) {
        return JSON.parse(fs.readFileSync(archivo, 'utf-8')) as Record<
          string,
          string
        >;
      }
    }
    return null;
  }

  /**
   * ¿Está lista la conexión con Google en este entorno? Solo mira la
   * configuración (no llama a Google): sirve para que la pantalla de
   * Configuración diga qué falta antes de pulsar «Leer Google ahora».
   */
  configuracion(): {
    configurado: boolean;
    falta: 'administrador' | 'credenciales' | null;
  } {
    if (!process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL) {
      return { configurado: false, falta: 'administrador' };
    }
    if (!this.cargarCredenciales()) {
      return { configurado: false, falta: 'credenciales' };
    }
    return { configurado: true, falta: null };
  }

  /**
   * Lee Google ahora. Con `companyId` solo lee a las personas de esa empresa
   * (lo que pide un administrador desde Configuración); sin él, a las de todas
   * las empresas con la bitácora encendida (el job programado).
   */
  async sincronizar(companyId?: number): Promise<ResultadoSincronizacion> {
    const vacio = { personas: 0, leidos: 0, guardados: 0 };
    const admin = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL;
    if (!admin) {
      this.logger.warn('Falta la variable GOOGLE_WORKSPACE_ADMIN_EMAIL.');
      return {
        ok: false,
        mensaje:
          'Falta configurar la cuenta de administrador de Google Workspace. Avisa a Sistemas.',
        ...vacio,
      };
    }
    const credenciales = this.cargarCredenciales();
    if (!credenciales) {
      return {
        ok: false,
        mensaje: 'La conexión con Google no está configurada en este entorno.',
        ...vacio,
      };
    }

    const personas = await this.personasActivas(companyId);
    if (personas.length === 0) {
      return {
        ok: true,
        mensaje:
          'Nadie tiene la hoja del día activada, así que no se leyó nada de Google.',
        ...vacio,
      };
    }

    try {
      this.logger.log(
        `Leyendo informes de Google como "${admin}" con la cuenta ${credenciales.client_email} (client_id ${credenciales.client_id})`,
      );
      const auth = new google.auth.GoogleAuth({
        credentials: credenciales,
        scopes: [SCOPE_INFORMES],
        clientOptions: { subject: admin },
      });
      const reportes = google.admin({ version: 'reports_v1', auth });
      const filas: FilaGoogle[] = [];
      let leidos = 0;

      for (const persona of personas) {
        // Nunca antes de la activación, aunque Google guarde más historia.
        const inicio = new Date(
          Math.max(
            Date.now() - HORAS_ATRAS * 3_600_000,
            persona.desde.getTime(),
          ),
        );
        for (const aplicacion of APLICACIONES) {
          let pageToken: string | undefined;
          for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
            const res = await reportes.activities.list({
              userKey: persona.email,
              applicationName: aplicacion,
              startTime: inicio.toISOString(),
              maxResults: 1000,
              pageToken,
            });
            for (const item of res.data.items ?? []) {
              leidos++;
              const cuando = item.id?.time;
              if (!cuando || new Date(cuando) < persona.desde) continue;
              (item.events ?? []).forEach((ev, i) => {
                const nombre = ev.name ?? '';
                const cuenta =
                  aplicacion === 'login'
                    ? nombre === 'login_success'
                    : EVENTOS_DRIVE.has(nombre);
                if (!cuenta) return;
                const titulo = ev.parameters?.find(
                  (p) => p.name === 'doc_title',
                )?.value;
                filas.push({
                  userId: persona.id,
                  companyId: persona.companyId,
                  fuente: 'GOOGLE',
                  modulo: aplicacion,
                  accion: nombre,
                  nombre: titulo ? String(titulo).slice(0, 150) : null,
                  externalId: `${aplicacion}:${item.id?.uniqueQualifier ?? cuando}:${i}:${nombre}`,
                  ocurridoEn: new Date(cuando),
                });
              });
            }
            pageToken = res.data.nextPageToken ?? undefined;
            if (!pageToken) break;
          }
        }
      }

      const guardado = filas.length
        ? await this.prisma.bitacoraEvento.createMany({
            data: filas,
            skipDuplicates: true,
          })
        : { count: 0 };
      return {
        ok: true,
        mensaje: `Se leyeron ${leidos} eventos de Google de ${personas.length} persona(s) y se guardaron ${guardado.count} nuevos.`,
        personas: personas.length,
        leidos,
        guardados: guardado.count,
      };
    } catch (err) {
      const detalle = (err as Error).message ?? String(err);
      this.logger.warn(`No se pudo leer la actividad de Google: ${detalle}`);
      // Mismo criterio que GmailMailService.explicarErrorGoogle: el mensaje crudo de Google
      // no dice qué configurar, así que se traduce a lo que hay que hacer.
      const apiApagada =
        /has not been used|accessNotConfigured|SERVICE_DISABLED|is disabled/i.test(
          detalle,
        );
      const sinPermiso =
        /unauthorized_client|access_denied|insufficient|forbidden|403|401/i.test(
          detalle,
        );
      return {
        ok: false,
        mensaje: apiApagada
          ? 'Falta habilitar la API Admin SDK en Google Cloud. Avisa a Sistemas.'
          : sinPermiso
            ? 'Google no autorizó la lectura de informes. Falta autorizar el permiso en la consola de Workspace.'
            : 'No se pudo leer la actividad de Google. Inténtalo de nuevo más tarde.',
        ...vacio,
        personas: personas.length,
      };
    }
  }

  /**
   * Personas de empresas con la Bitácora encendida y con la hoja activada.
   * En desarrollo, BITACORA_GOOGLE_SOLO_EMAILS limita la lectura a esas cuentas.
   */
  private async personasActivas(companyId?: number) {
    const empresas = await this.prisma.companySection.findMany({
      where: { section: 'BITACORA', ...(companyId ? { companyId } : {}) },
      select: { companyId: true },
    });
    const soloEmails = (process.env.BITACORA_GOOGLE_SOLO_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const activaciones = await this.prisma.bitacoraActivacion.findMany({
      where: {
        activa: true,
        desde: { not: null },
        user: {
          isActive: true,
          companyId: { in: empresas.map((e) => e.companyId) },
        },
      },
      select: {
        desde: true,
        user: { select: { id: true, email: true, companyId: true } },
      },
    });
    return activaciones
      .filter(
        (a) =>
          soloEmails.length === 0 ||
          soloEmails.includes(a.user.email.toLowerCase()),
      )
      .map((a) => ({
        id: a.user.id,
        email: a.user.email,
        companyId: a.user.companyId,
        desde: a.desde as Date,
      }));
  }
}
