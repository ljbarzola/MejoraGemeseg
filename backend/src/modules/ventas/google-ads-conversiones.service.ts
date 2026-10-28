import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Auth } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ALCANCE_DATA_MANAGER,
  ESPERA_REINTENTO_MIN,
  ESPERA_VERIFICACION_MIN,
  MAX_INTENTOS,
  RETENCION_ESTADO_DIAS,
  URL_ESTADO,
  URL_INGEST,
  construirSolicitud,
  mensajeDeError,
  veredictoDeDestino,
  type DestinoEstadoGoogle,
  type HechoParaEnviar,
} from './google-ads-conversiones.util';
import {
  MOTIVO_GCLID_INVALIDO,
  gclidConFormato,
  gclidVigente,
  limpiarGclid,
  type TipoConversion,
} from './ventas-conversiones.util';
import { VentasConfigService } from './ventas-config.service';

export interface ResultadoEnvio {
  configurado: boolean;
  dryRun: boolean;
  validateOnly: boolean;
  candidatos: number;
  enviados: number;
  fallidos: number;
  vencidos: number;
}

export interface ResultadoVerificacion {
  revisados: number;
  aceptados: number;
  rechazados: number;
  reintentar: number;
  procesando: number;
  fallos: number;
}

// Envía a Google Ads los hechos (lead válido / cualificado / convertido) que
// VentasConversionesService dejó PENDIENTES. Los IDs de la cuenta de Ads de cada
// empresa salen de Ventas → Configuración (VentasConfigService); sin ellos, o con el
// envío desactivado, no hace nada. Se autentica SIN claves: el backend (identidad de
// Cloud Run) impersona a la cuenta dedicada de Ads con el alcance `datamanager`.
@Injectable()
export class GoogleAdsConversionesService {
  private readonly logger = new Logger(GoogleAdsConversionesService.name);
  private enCurso = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: VentasConfigService,
  ) {}

  async configurado(companyId: number): Promise<boolean> {
    return (await this.config.configGoogleAds(companyId)) !== null;
  }

  // ¿Esta empresa usa el paso intermedio «Lead válido»? Solo si el envío está listo Y guardó el ID de esa
  // conversión; si no, ese hecho ni se registra (así no se acumulan hechos que nadie va a enviar).
  async usaLeadValido(companyId: number): Promise<boolean> {
    const config = await this.config.configGoogleAds(companyId);
    return !!config?.conversiones.VALIDO;
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

  // Sin `companyId` recorre todas las empresas que tengan hechos por enviar.
  async enviarPendientes(
    opciones: { dryRun?: boolean; limite?: number; companyId?: number } = {},
  ): Promise<ResultadoEnvio> {
    const total: ResultadoEnvio = {
      configurado: false,
      dryRun: !!opciones.dryRun,
      validateOnly: false,
      candidatos: 0,
      enviados: 0,
      fallidos: 0,
      vencidos: 0,
    };
    // Un solo envío a la vez por instancia (el disparo inmediato y el cron no se pisan).
    if (this.enCurso) return total;
    this.enCurso = true;
    try {
      const empresas = opciones.companyId
        ? [opciones.companyId]
        : (
            await this.prisma.salesConversionEvent.findMany({
              where: { status: { in: ['PENDIENTE', 'FALLO'] } },
              distinct: ['companyId'],
              select: { companyId: true },
            })
          ).map((e) => e.companyId);
      for (const cid of empresas) {
        const r = await this.enviarDeEmpresa(cid, opciones);
        total.configurado = total.configurado || r.configurado;
        total.validateOnly = total.validateOnly || r.validateOnly;
        total.candidatos += r.candidatos;
        total.enviados += r.enviados;
        total.fallidos += r.fallidos;
        total.vencidos += r.vencidos;
      }
      return total;
    } finally {
      this.enCurso = false;
    }
  }

  private async enviarDeEmpresa(
    companyId: number,
    opciones: { dryRun?: boolean; limite?: number },
  ): Promise<ResultadoEnvio> {
    const config = await this.config.configGoogleAds(companyId);
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

    const ahora = new Date();
    const espera = new Date(ahora.getTime() - ESPERA_REINTENTO_MIN * 60_000);
    // «Lead válido» solo se envía si la empresa guardó el ID de esa conversión; sin él, esos hechos
    // se quedan quietos (no se descartan: si después lo configura, se envían los que sigan vigentes).
    const tipos: TipoConversion[] = config.conversiones.VALIDO
      ? ['CUALIFICADO', 'CONVERTIDO', 'VALIDO']
      : ['CUALIFICADO', 'CONVERTIDO'];
    const eventos = await this.prisma.salesConversionEvent.findMany({
      where: {
        companyId,
        kind: { in: tipos },
        OR: [
          { status: 'PENDIENTE' },
          { status: 'FALLO', attempts: { lt: MAX_INTENTOS }, updatedAt: { lt: espera } },
        ],
      },
      // Orden estable: al verificar, los destinos de la solicitud se reconstruyen en este mismo orden.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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
      // Un gclid que no es de verdad (de prueba, recortado) haría que Google rechace (INVALID_GCLID) y dejaría
      // el envío entero como «parcial»: no se manda, se anota el motivo y queda a la vista en Conexiones.
      const gclid = limpiarGclid(e.gclid);
      if (!gclidConFormato(gclid)) {
        await this.prisma.salesConversionEvent.update({
          where: { id: e.id },
          data: { status: 'RECHAZADO', googleStatus: null, lastError: MOTIVO_GCLID_INVALIDO, checkedAt: ahora },
        });
        this.logger.warn(`Hecho #${e.id} (${e.kind}) no enviado: su gclid no tiene formato de Google.`);
        base.fallidos++;
        continue;
      }
      hechos.push({
        id: e.id,
        hecho: {
          opportunityId: e.opportunityId,
          leadId: e.leadId,
          kind: e.kind as TipoConversion,
          gclid,
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
      const respuesta = await axios.post<{ requestId?: string }>(
        URL_INGEST,
        construirSolicitud(config, hechos.map((h) => h.hecho)),
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 30_000,
        },
      );
      // En modo de validación Google no cuenta nada: se deja todo PENDIENTE.
      if (!config.validateOnly) {
        // El 200 solo dice «recibido»: Google procesa después y puede rechazar. Se guarda el número de
        // solicitud para preguntarle (verificarEnvios) si de verdad lo aceptó y por qué si no.
        const requestId = respuesta.data?.requestId ?? null;
        await this.prisma.salesConversionEvent.updateMany({
          where: { id: { in: ids } },
          data: {
            status: 'ENVIADO',
            sentAt: new Date(),
            lastError: null,
            attempts: { increment: 1 },
            requestId,
            googleStatus: null,
            checkedAt: null,
          },
        });
        this.logger.log(
          `Aviso a Google Ads recibido (empresa ${companyId}, ${ids.length} hecho(s), solicitud ${requestId ?? 'sin número'}).`,
        );
        base.enviados = ids.length;
      }
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      // El detalle real solo al registro del servidor.
      this.logger.error(
        `Envío a Google Ads fallido (empresa ${companyId}, HTTP ${status ?? 'sin respuesta'}): ${
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
  }

  // Los avisos que se enviaron ANTES de guardar el número de solicitud (2026-10-27) nunca pudieron
  // comprobarse con Google. Se vuelven a poner PENDIENTES UNA sola vez (con `attempts <= 1`: al reenviarse
  // ya suman 2 y no vuelven a entrar) para que el reenvío traiga su número y se verifique. No cuenta doble:
  // cada aviso lleva siempre el mismo `transactionId`, y si Google ya lo tenía contesta «duplicado», que el
  // CRM entiende como recibido.
  async reencolarSinVerificar(): Promise<number> {
    const r = await this.prisma.salesConversionEvent.updateMany({
      where: { status: 'ENVIADO', requestId: null, googleStatus: null, attempts: { lte: 1 } },
      data: { status: 'PENDIENTE', lastError: null },
    });
    if (r.count > 0) this.logger.log(`Avisos a Google Ads vueltos a enviar para poder verificarlos: ${r.count}`);
    return r.count;
  }

  // Le pregunta a Google, por cada solicitud ya enviada (pasados 30 minutos), si procesó los avisos o los
  // rechazó. Sin esto el CRM da por bueno todo lo que Google «recibió», aunque lo descarte después (el
  // aviso real del 16/10 llevaba 10 días sin aparecer sin que nadie lo supiera).
  async verificarEnvios(): Promise<ResultadoVerificacion> {
    const total: ResultadoVerificacion = {
      revisados: 0,
      aceptados: 0,
      rechazados: 0,
      reintentar: 0,
      procesando: 0,
      fallos: 0,
    };
    const ahora = new Date();
    // Los que Google ya marcó como «parcial» (aceptó unos y rechazó otros) y cuyo gclid se ve inválido
    // pasan a rechazados con su motivo; los demás quedan aceptados.
    await this.separarInvalidosDeParciales(ahora);
    const eventos = await this.prisma.salesConversionEvent.findMany({
      where: {
        status: 'ENVIADO',
        requestId: { not: null },
        OR: [{ googleStatus: null }, { googleStatus: 'PROCESANDO' }],
        sentAt: {
          lte: new Date(ahora.getTime() - ESPERA_VERIFICACION_MIN * 60_000),
          gte: new Date(ahora.getTime() - RETENCION_ESTADO_DIAS * 86_400_000),
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    if (eventos.length === 0) return total;

    const solicitudes = new Map<string, typeof eventos>();
    for (const e of eventos) {
      const clave = `${e.companyId}|${e.requestId}`;
      solicitudes.set(clave, [...(solicitudes.get(clave) ?? []), e]);
    }
    const tokens = new Map<number, string | null>();
    for (const grupo of solicitudes.values()) {
      const { companyId, requestId } = grupo[0];
      try {
        if (!tokens.has(companyId)) {
          const config = await this.config.configGoogleAds(companyId);
          tokens.set(companyId, config ? await this.token(config.cuentaDeServicio) : null);
        }
        const token = tokens.get(companyId);
        if (!token) continue;
        const r = await axios.get<{ requestStatusPerDestination?: DestinoEstadoGoogle[] }>(URL_ESTADO, {
          params: { requestId },
          headers: { Authorization: `Bearer ${token}` },
          timeout: 30_000,
        });
        // Google contesta un estado por destino, en el mismo orden en que se mandaron (un destino por tipo).
        const tipos = [...new Set(grupo.map((e) => e.kind))];
        const destinos = r.data?.requestStatusPerDestination ?? [];
        for (const [i, kind] of tipos.entries()) {
          const v = veredictoDeDestino(destinos[i]);
          const ids = grupo.filter((e) => e.kind === kind).map((e) => e.id);
          total.revisados += ids.length;
          if (v.estado !== 'ACEPTADO' && v.estado !== 'PROCESANDO') {
            this.logger.warn(
              `Google Ads no aceptó del todo la solicitud ${requestId} (${kind}): ${v.estado} ${v.razones.join(', ')}`,
            );
          }
          const data = this.datosDeVeredicto(v.estado, v.nota, ahora);
          await this.prisma.salesConversionEvent.updateMany({ where: { id: { in: ids } }, data });
          if (v.estado === 'PARCIAL') {
            // Cuántos registros falló cada motivo (Google lo dice en `errorInfo`), solo para el registro.
            this.logger.warn(`Detalle de lo rechazado (${kind}): ${JSON.stringify(destinos[i]?.errorInfo ?? {})}`);
            await this.separarInvalidosDeParciales(ahora);
          }
          if (v.estado === 'ACEPTADO' || v.estado === 'PARCIAL') total.aceptados += ids.length;
          else if (v.estado === 'RECHAZADO') total.rechazados += ids.length;
          else if (v.estado === 'REINTENTAR') total.reintentar += ids.length;
          else total.procesando += ids.length;
        }
      } catch (err) {
        total.fallos++;
        this.logger.error(
          `No se pudo consultar a Google Ads la solicitud ${requestId}: ${
            axios.isAxiosError(err) ? JSON.stringify(err.response?.data ?? err.message) : (err as Error).message
          }`,
        );
      }
    }
    return total;
  }

  // En un envío «parcial» Google no dice CUÁLES avisos falló. Los de gclid sin formato de Google son casi
  // seguro los culpables (INVALID_GCLID): se marcan rechazados con el motivo; los demás siguen como «parcial».
  private async separarInvalidosDeParciales(ahora: Date): Promise<void> {
    const parciales = await this.prisma.salesConversionEvent.findMany({
      where: { status: 'ENVIADO', googleStatus: 'PARCIAL' },
      select: { id: true, gclid: true },
      take: 500,
    });
    if (parciales.length === 0) return;
    const invalidos = parciales.filter((p) => !gclidConFormato(limpiarGclid(p.gclid))).map((p) => p.id);
    if (invalidos.length > 0) {
      await this.prisma.salesConversionEvent.updateMany({
        where: { id: { in: invalidos } },
        data: { status: 'RECHAZADO', googleStatus: 'RECHAZADO', lastError: MOTIVO_GCLID_INVALIDO, checkedAt: ahora },
      });
      this.logger.warn(`Avisos con gclid sin formato de Google, marcados como rechazados: ${invalidos.length}`);
    }
  }

  private datosDeVeredicto(
    estado: 'PROCESANDO' | 'ACEPTADO' | 'PARCIAL' | 'RECHAZADO' | 'REINTENTAR',
    nota: string | null,
    ahora: Date,
  ) {
    switch (estado) {
      case 'ACEPTADO':
        return { googleStatus: 'ACEPTADO', checkedAt: ahora, lastError: nota };
      case 'PARCIAL':
        return { googleStatus: 'PARCIAL', checkedAt: ahora, lastError: nota };
      case 'RECHAZADO':
        return { status: 'RECHAZADO', googleStatus: 'RECHAZADO', checkedAt: ahora, lastError: nota };
      case 'REINTENTAR':
        // Google lo rechazó por algo pasajero: vuelve a la cola para que el envío lo reintente.
        return { status: 'FALLO', googleStatus: null, requestId: null, checkedAt: ahora, lastError: nota };
      default:
        return { googleStatus: 'PROCESANDO', checkedAt: ahora };
    }
  }
}
