import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CUENTA_ADS_POR_DEFECTO,
  leerConfigGoogleAds,
  type ConfigGoogleAds,
} from './google-ads-conversiones.util';
import { limpiarSlug, type LandingDef } from './lead-landing.util';

// Ajustes de Ventas por empresa (tabla SalesSetting). Antes de 2026-10-15 esto estaba
// fijo en el código (landings) o en variables de entorno (Google Ads): una empresa
// que use el CRM necesita cambiarlo sola, sin tocar código ni redesplegar.

const CLAVE_GOOGLE_ADS = 'google_ads';
const CLAVE_LANDINGS = 'landings';
const MAX_LANDINGS = 100;

export interface AjustesGoogleAds {
  customerId: string;
  conversionCualificado: string;
  conversionConvertido: string;
  // Interruptor general del envío a Google.
  activo: boolean;
  // Google solo valida cada envío y no cuenta nada: para la primera prueba.
  soloValidar: boolean;
}

const VACIO_GOOGLE_ADS: AjustesGoogleAds = {
  customerId: '',
  conversionCualificado: '',
  conversionConvertido: '',
  activo: false,
  soloValidar: true,
};

const soloDigitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '');
const texto = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max);

@Injectable()
export class VentasConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private requireCompany(companyId: number | null): number {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    return companyId;
  }

  private async leer<T>(companyId: number, key: string): Promise<T | null> {
    try {
      const fila = await this.prisma.salesSetting.findUnique({
        where: { companyId_key: { companyId, key } },
      });
      return fila ? (fila.value as unknown as T) : null;
    } catch {
      // Si la tabla aún no existe (arranque fallido) se cae a los valores de siempre.
      return null;
    }
  }

  private async guardar(companyId: number, userId: number, key: string, value: unknown) {
    await this.prisma.salesSetting.upsert({
      where: { companyId_key: { companyId, key } },
      create: { companyId, key, value: value as Prisma.InputJsonValue, updatedBy: userId },
      update: { value: value as Prisma.InputJsonValue, updatedBy: userId },
    });
  }

  // ---------------- Google Ads ----------------

  async ajustesGoogleAds(companyId: number): Promise<AjustesGoogleAds> {
    const guardado = await this.leer<Partial<AjustesGoogleAds>>(companyId, CLAVE_GOOGLE_ADS);
    if (guardado) return { ...VACIO_GOOGLE_ADS, ...guardado };
    // Sin nada guardado se respeta lo que hubiera en variables de entorno (instalaciones anteriores).
    const env = leerConfigGoogleAds();
    return env
      ? {
          customerId: env.customerId,
          conversionCualificado: env.conversiones.CUALIFICADO,
          conversionConvertido: env.conversiones.CONVERTIDO,
          activo: true,
          soloValidar: env.validateOnly,
        }
      : VACIO_GOOGLE_ADS;
  }

  // La configuración con la que se envía a Google, o null si esa empresa no lo tiene listo.
  async configGoogleAds(companyId: number): Promise<ConfigGoogleAds | null> {
    const a = await this.ajustesGoogleAds(companyId);
    if (!a.activo) return null;
    const customerId = soloDigitos(a.customerId);
    if (customerId.length !== 10 || !a.conversionCualificado || !a.conversionConvertido) return null;
    return {
      customerId,
      conversiones: {
        CUALIFICADO: soloDigitos(a.conversionCualificado),
        CONVERTIDO: soloDigitos(a.conversionConvertido),
      },
      cuentaDeServicio: (process.env.GOOGLE_ADS_SERVICE_ACCOUNT ?? '').trim() || CUENTA_ADS_POR_DEFECTO,
      validateOnly: a.soloValidar,
    };
  }

  async guardarGoogleAds(
    companyId: number | null,
    userId: number,
    dto: Partial<AjustesGoogleAds>,
  ): Promise<AjustesGoogleAds> {
    const cid = this.requireCompany(companyId);
    const customerId = soloDigitos(dto.customerId);
    const cualificado = soloDigitos(dto.conversionCualificado);
    const convertido = soloDigitos(dto.conversionConvertido);
    if (customerId && customerId.length !== 10) {
      throw new BadRequestException(
        'El ID de cliente de Google Ads tiene 10 dígitos (por ejemplo 123-456-7890).',
      );
    }
    const activo = dto.activo === true;
    if (activo && (!customerId || !cualificado || !convertido)) {
      throw new BadRequestException(
        'Para activar el envío falta el ID de cliente y el ID de las dos conversiones.',
      );
    }
    const nuevo: AjustesGoogleAds = {
      customerId,
      conversionCualificado: cualificado,
      conversionConvertido: convertido,
      activo,
      soloValidar: dto.soloValidar !== false,
    };
    await this.guardar(cid, userId, CLAVE_GOOGLE_ADS, nuevo);
    return nuevo;
  }

  // ---------------- Landings ----------------

  async landingsDe(companyId: number): Promise<LandingDef[]> {
    const guardado = await this.leer<{ landings?: LandingDef[] }>(companyId, CLAVE_LANDINGS);
    // Una empresa que no ha cargado sus landings no tiene ninguna (línea blanca): la tabla de
    // Gemeseg se copia una sola vez a su propia empresa al arrancar (VentasSchemaService).
    return Array.isArray(guardado?.landings) ? guardado.landings : [];
  }

  async guardarLandings(
    companyId: number | null,
    userId: number,
    lista: { slug: string; servicio: string; linea?: string }[],
  ): Promise<LandingDef[]> {
    const cid = this.requireCompany(companyId);
    if (lista.length > MAX_LANDINGS) {
      throw new BadRequestException(`Se admiten hasta ${MAX_LANDINGS} landings.`);
    }
    const vistos = new Set<string>();
    const limpia: LandingDef[] = [];
    for (const item of lista) {
      const slug = limpiarSlug(item.slug);
      const servicio = texto(item.servicio, 120);
      if (!slug) {
        throw new BadRequestException(
          'Cada landing necesita su dirección (por ejemplo «monitoreo-alarmas»), solo con letras, números y guiones.',
        );
      }
      if (!servicio) {
        throw new BadRequestException(`Elige el servicio de la landing «${slug}».`);
      }
      if (vistos.has(slug)) {
        throw new BadRequestException(`La landing «${slug}» está repetida.`);
      }
      vistos.add(slug);
      limpia.push({ slug, servicio, linea: texto(item.linea, 60) });
    }
    await this.guardar(cid, userId, CLAVE_LANDINGS, { landings: limpia });
    return limpia;
  }

  // ---------------- Pantalla ----------------

  async resumen(companyId: number | null) {
    const cid = this.requireCompany(companyId);
    const [googleAds, landings] = await Promise.all([
      this.ajustesGoogleAds(cid),
      this.landingsDe(cid),
    ]);
    return {
      googleAds,
      // Cuenta de servicio que hay que invitar como usuario en Google Ads (la define la
      // instalación, no cada empresa).
      cuentaDeServicio: (process.env.GOOGLE_ADS_SERVICE_ACCOUNT ?? '').trim() || CUENTA_ADS_POR_DEFECTO,
      landings,
    };
  }
}
