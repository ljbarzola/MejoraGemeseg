import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  calcularCustodia,
  limpiarEntrada,
  limpiarTarifas,
  tarifasDe,
  type EntradaCustodia,
  type ResultadoCustodia,
  type TarifasCustodia,
} from './cotizador-custodia.util';

const CLAVE = 'cotizador-custodia';

// Tarifas y cálculo de la custodia móvil del Cotizador. Las tarifas son de cada empresa y viven en
// `SalesSetting` (sin tabla nueva): una empresa que nunca las guardó usa las de la hoja.
@Injectable()
export class CotizadorCustodiaService {
  constructor(private readonly prisma: PrismaService) {}

  private empresa(companyId: number | null): number {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    return companyId;
  }

  async tarifas(companyId: number | null): Promise<TarifasCustodia> {
    const id = this.empresa(companyId);
    const fila = await this.prisma.salesSetting.findUnique({
      where: { companyId_key: { companyId: id, key: CLAVE } },
    });
    return tarifasDe(fila?.value);
  }

  async guardarTarifas(companyId: number | null, userId: number, raw: unknown): Promise<TarifasCustodia> {
    const id = this.empresa(companyId);
    // Lo que no venga en la petición se conserva de lo ya guardado.
    const nuevas = limpiarTarifas(raw, await this.tarifas(id));
    await this.prisma.salesSetting.upsert({
      where: { companyId_key: { companyId: id, key: CLAVE } },
      create: { companyId: id, key: CLAVE, value: nuevas as unknown as Prisma.InputJsonValue, updatedBy: userId },
      update: { value: nuevas as unknown as Prisma.InputJsonValue, updatedBy: userId },
    });
    return nuevas;
  }

  // El cálculo se hace SIEMPRE aquí: la pantalla solo lo muestra (así hay una sola fórmula).
  async calcular(
    companyId: number | null,
    raw: unknown,
  ): Promise<{ entrada: EntradaCustodia; resultado: ResultadoCustodia }> {
    const entrada = limpiarEntrada(raw);
    return { entrada, resultado: calcularCustodia(entrada, await this.tarifas(companyId)) };
  }
}
