import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Auth } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ALCANCE_DATA_MANAGER,
  ESPERA_REINTENTO_MIN,
  MAX_INTENTOS,
  URL_INGEST,
  construirSolicitud,
  leerConfigGoogleAds,
  mensajeDeError,
  type HechoParaEnviar,
} from './google-ads-conversiones.util';
import { gclidVigente, type TipoConversion } from './ventas-conversiones.util';

export interface ResultadoEnvio {
  configurado: boolean;
  dryRun: boolean;
  validateOnly: boolean;
  candidatos: number;
  enviados: number;
  fallidos: number;
  vencidos: number;
}

// Envía a Google Ads los hechos (lead cualificado / convertido) que
// VentasConversionesService dejó PENDIENTES. Sin los IDs de la cuenta de Ads
// (ver google-ads-conversiones.util.ts) no hace nada. Se autentica SIN claves:
// el backend (identidad de Cloud Run) impersona a la cuenta dedicada de Ads con
// el alcance `datamanager`.
@Injectable()
export class GoogleAdsConversionesService {
  private readonly logger = new Logger(GoogleAdsConversionesService.name);
  private enCurso = false;

  constructor(private readonly prisma: PrismaService) {}

  configurado(): boolean {
    return leerConfigGoogleAds() !== null;
  }

  private async token(cuenta: string): Promise<string> {
    const origen = new Auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const cliente = new Auth.Impersonated({
      sourceClient: await origen.getClient(),
      targetPrincipal: cuenta,
      targetScopes: [ALCANCE_DATA_MANAGER],
      lifetime: 3600,
      delegates: [],
    });
    const { token } = await cliente.getAccessToken();
    if (!token) throw new Error('Google no entregó el token');
    return token;
  }

  async enviarPendientes(
    opciones: { dryRun?: boolean; limite?: number } = {},
  ): Promise<ResultadoEnvio> {
    const config = leerConfigGoogleAds();
    const base: ResultadoEnvio = {
      configurado: config !== null,
      dryRun: !!opciones.dryRun,
      validateOnly: config?.validateOnly ?? false,
      candidatos: 0,
      enviados: 0,
      fallidos: 0,
      vencidos: 0,
    };
    if (!config) return base;
    // Un solo envío a la vez por instancia (el disparo inmediato y el cron no se pisan).
    if (this.enCurso) return base;
    this.enCurso = true;
    try {
      const ahora = new Date();
      const espera = new Date(ahora.getTime() - ESPERA_REINTENTO_MIN * 60_000);
      const eventos = await this.prisma.salesConversionEvent.findMany({
        where: {
          OR: [
            { status: 'PENDIENTE' },
            { status: 'FALLO', attempts: { lt: MAX_INTENTOS }, updatedAt: { lt: espera } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: opciones.limite ?? 50,
      });
      base.candidatos = eventos.length;
      if (eventos.length === 0 || opciones.dryRun) return base;

      // El clic se aproxima por la llegada del lead: si ya pasaron 90 días, Google no lo acepta.
      const leads = await this.prisma.salesLead.findMany({
        where: { id: { in: [...new Set(eventos.map((e) => e.leadId))] } },
        select: { id: true, createdAt: true },
      });
      const llegada = new Map(leads.map((l) => [l.id, l.createdAt]));

      const hechos: { id: number; hecho: HechoParaEnviar }[] = [];
      for (const e of eventos) {
        const cuando = llegada.get(e.leadId);
        if (cuando && !gclidVigente(cuando, ahora)) {
          await this.prisma.salesConversionEvent.update({
            where: { id: e.id },
            data: {
              status: 'VENCIDO',
              lastError: 'El clic tiene más de 90 días: Google ya no lo acepta.',
            },
          });
          base.vencidos++;
          continue;
        }
        hechos.push({
          id: e.id,
          hecho: {
            opportunityId: e.opportunityId,
            kind: e.kind as TipoConversion,
            gclid: e.gclid,
            occurredAt: e.occurredAt,
            value: e.value === null ? null : Number(e.value),
            currency: e.currency,
          },
        });
      }
      if (hechos.length === 0) return base;

      const ids = hechos.map((h) => h.id);
      try {
        const token = await this.token(config.cuentaDeServicio);
        await axios.post(URL_INGEST, construirSolicitud(config, hechos.map((h) => h.hecho)), {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 30_000,
        });
        // En modo de validación Google no cuenta nada: se deja todo PENDIENTE.
        if (!config.validateOnly) {
          await this.prisma.salesConversionEvent.updateMany({
            where: { id: { in: ids } },
            data: { status: 'ENVIADO', sentAt: new Date(), lastError: null, attempts: { increment: 1 } },
          });
          base.enviados = ids.length;
        }
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        // El detalle real solo al registro del servidor.
        this.logger.error(
          `Envío a Google Ads fallido (HTTP ${status ?? 'sin respuesta'}): ${
            axios.isAxiosError(err) ? JSON.stringify(err.response?.data ?? err.message) : (err as Error).message
          }`,
        );
        if (!config.validateOnly) {
          await this.prisma.salesConversionEvent.updateMany({
            where: { id: { in: ids } },
            data: { status: 'FALLO', lastError: mensajeDeError(status), attempts: { increment: 1 } },
          });
        }
        base.fallidos = ids.length;
      }
      return base;
    } finally {
      this.enCurso = false;
    }
  }
}
