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
};

@Injectable()
export class CacaoConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get(companyId: number): Promise<AjustesCacao> {
    const filas = await this.prisma.cacaoSetting.findMany({
      where: { companyId },
    });
    const ajustes: AjustesCacao = { ...AJUSTES_INICIALES };
    for (const fila of filas) {
      if (fila.key in AJUSTES_INICIALES) {
        const n = Number(fila.value);
        if (Number.isInteger(n) && n >= 0) {
          ajustes[fila.key as keyof AjustesCacao] = n;
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

  async update(companyId: number, dto: UpdateCacaoConfigDto) {
    for (const key of Object.keys(AJUSTES_INICIALES) as Array<
      keyof AjustesCacao
    >) {
      const valor = dto[key];
      if (valor === undefined) continue;
      await this.prisma.cacaoSetting.upsert({
        where: { companyId_key: { companyId, key } },
        update: { value: String(valor) },
        create: { companyId, key, value: String(valor) },
      });
    }
    return this.get(companyId);
  }
}
