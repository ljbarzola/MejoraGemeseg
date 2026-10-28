import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpdateCacaoConfigDto } from './dto/cacao-config.dto';

/**
 * Valores con los que arranca una empresa que aún no configuró nada. La pantalla
 * Cacao → Configuración los muestra y cada empresa los cambia a los suyos; no son reglas
 * del negocio de ninguna empresa en particular.
 */
export const AJUSTES_INICIALES = {
  plazoPagoDias: 30,
  plazoCobroDias: 60,
} as const;

export type AjustesCacao = {
  -readonly [K in keyof typeof AJUSTES_INICIALES]: number;
} & {
  /**
   * Precio de referencia de la bolsa (ICE) en $/T. No tiene valor inicial: cada empresa lo
   * escribe, y mientras no lo haga las fijaciones de precio le piden que lo configure.
   */
  precioIce: number | null;
  /**
   * Si es true, un pago a proveedores no se registra directo: se solicita, otra persona lo
   * autoriza y recién entonces se paga. Nace en false (como funcionaba antes) y la empresa lo activa.
   */
  pagosRequierenAutorizacion: boolean;
};

const CLAVE_PRECIO_ICE = 'precioIce';
const CLAVE_AUTORIZACION_PAGOS = 'pagosRequierenAutorizacion';

@Injectable()
export class CacaoConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get(companyId: number): Promise<AjustesCacao> {
    const filas = await this.prisma.cacaoSetting.findMany({
      where: { companyId },
    });
    const ajustes: AjustesCacao = {
      ...AJUSTES_INICIALES,
      precioIce: null,
      pagosRequierenAutorizacion: false,
    };
    for (const fila of filas) {
      if (fila.key === CLAVE_AUTORIZACION_PAGOS) {
        ajustes.pagosRequierenAutorizacion = fila.value === '1';
        continue;
      }
      if (fila.key === CLAVE_PRECIO_ICE) {
        const n = Number(fila.value);
        if (Number.isFinite(n) && n > 0) ajustes.precioIce = n;
        continue;
      }
      if (fila.key in AJUSTES_INICIALES) {
        const n = Number(fila.value);
        if (Number.isInteger(n) && n >= 0) {
          ajustes[fila.key as keyof typeof AJUSTES_INICIALES] = n;
        }
      }
    }
    return ajustes;
  }

  async plazoPago(companyId: number): Promise<number> {
    return (await this.get(companyId)).plazoPagoDias;
  }

  async plazoCobro(companyId: number): Promise<number> {
    return (await this.get(companyId)).plazoCobroDias;
  }

  async pagosRequierenAutorizacion(companyId: number): Promise<boolean> {
    return (await this.get(companyId)).pagosRequierenAutorizacion;
  }

  async update(companyId: number, dto: UpdateCacaoConfigDto) {
    for (const key of Object.keys(AJUSTES_INICIALES) as Array<
      keyof typeof AJUSTES_INICIALES
    >) {
      const valor = dto[key];
      if (valor === undefined) continue;
      await this.prisma.cacaoSetting.upsert({
        where: { companyId_key: { companyId, key } },
        update: { value: String(valor) },
        create: { companyId, key, value: String(valor) },
      });
    }
    if (dto.pagosRequierenAutorizacion !== undefined) {
      const value = dto.pagosRequierenAutorizacion ? '1' : '0';
      await this.prisma.cacaoSetting.upsert({
        where: { companyId_key: { companyId, key: CLAVE_AUTORIZACION_PAGOS } },
        update: { value },
        create: { companyId, key: CLAVE_AUTORIZACION_PAGOS, value },
      });
    }
    // El precio ICE puede quedar sin valor: mandar null lo borra y la empresa vuelve a configurarlo.
    if (dto.precioIce === null) {
      await this.prisma.cacaoSetting.deleteMany({
        where: { companyId, key: CLAVE_PRECIO_ICE },
      });
    } else if (dto.precioIce !== undefined) {
      await this.prisma.cacaoSetting.upsert({
        where: { companyId_key: { companyId, key: CLAVE_PRECIO_ICE } },
        update: { value: String(dto.precioIce) },
        create: {
          companyId,
          key: CLAVE_PRECIO_ICE,
          value: String(dto.precioIce),
        },
      });
    }
    return this.get(companyId);
  }
}
