import { ConflictException, Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VentasClientesService } from '../ventas/ventas-clientes.service';
import { CustodiasConfigService } from './custodias-config.service';
import { esCorreo, nombreNormalizado, valoresDeLista } from './custodias-campo.util';

export interface ClienteDirectorio {
  id: number;
  name: string;
  ruc: string | null;
  email: string | null;
  phone: string | null;
  contactos: { id: number; name: string; role: string | null; emails: string[]; phones: string[] }[];
}

/**
 * Clientes del Directorio de Ventas vistos desde Custodias (2026-11-24): quien arma una guía los busca y, si el
 * cliente no existe, lo crea sin pasar por Ventas. No exige el permiso de Ventas: solo el de Operaciones.
 */
@Injectable()
export class CustodiasClientesService {
  private readonly logger = new Logger(CustodiasClientesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ventasClientes: VentasClientesService,
    private readonly config: CustodiasConfigService,
  ) {}

  /** Contactos de varios clientes. Si la tabla de contactos aún no existe, se devuelven clientes sin contactos. */
  private async contactosDe(companyId: number, ids: number[]) {
    const porCliente = new Map<number, ClienteDirectorio['contactos']>();
    if (ids.length === 0) return porCliente;
    try {
      const filas = await this.prisma.salesContact.findMany({
        where: { companyId, salesClientId: { in: ids } },
        orderBy: { name: 'asc' },
      });
      for (const f of filas) {
        const lista = porCliente.get(f.salesClientId) ?? [];
        lista.push({
          id: f.id,
          name: f.name,
          role: f.role,
          emails: valoresDeLista(f.emails),
          phones: valoresDeLista(f.phones),
        });
        porCliente.set(f.salesClientId, lista);
      }
    } catch (err) {
      this.logger.warn(`No se pudieron leer los contactos del Directorio: ${(err as Error).message}`);
    }
    return porCliente;
  }

  async buscar(companyId: number | null, buscar?: string): Promise<ClienteDirectorio[]> {
    const empresa = this.config.exigirEmpresa(companyId);
    const texto = (buscar ?? '').trim().slice(0, 100);
    const clientes = await this.prisma.salesClient.findMany({
      where: {
        companyId: empresa,
        ...(texto
          ? {
              OR: [
                { name: { contains: texto, mode: 'insensitive' as const } },
                { ruc: { contains: texto, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, ruc: true, email: true, phone: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
    const contactos = await this.contactosDe(
      empresa,
      clientes.map((c) => c.id),
    );
    return clientes.map((c) => ({ ...c, contactos: contactos.get(c.id) ?? [] }));
  }

  async crear(
    companyId: number | null,
    userId: number,
    dto: { name: string; ruc?: string; email?: string; phone?: string },
  ): Promise<ClienteDirectorio> {
    const empresa = this.config.exigirEmpresa(companyId);
    const name = (dto?.name ?? '').trim();
    if (!name) throw new BadRequestException('El nombre es requerido.');
    const ruc = (dto.ruc ?? '').trim();
    const email = (dto.email ?? '').trim();
    if (email && !esCorreo(email)) throw new BadRequestException('El correo del cliente no es válido.');

    // Antes de crear: ¿ya está en el Directorio? Por RUC, o por nombre cuando no se da RUC.
    const existentes = await this.prisma.salesClient.findMany({
      where: { companyId: empresa },
      select: { id: true, name: true, ruc: true },
    });
    const repetido = ruc
      ? existentes.some((c) => (c.ruc ?? '').trim().toLowerCase() === ruc.toLowerCase())
      : existentes.some((c) => nombreNormalizado(c.name) === nombreNormalizado(name));
    if (repetido) {
      throw new ConflictException(
        `Ya existe un cliente con ese ${ruc ? 'RUC' : 'nombre'} en el Directorio.`,
      );
    }

    // Se crea como «solo datos»: queda en el Directorio sin abrir una oportunidad de venta.
    const creado = await this.ventasClientes.createClient(empresa, userId, {
      name,
      ruc: ruc || undefined,
      email: email || undefined,
      phone: (dto.phone ?? '').trim() || undefined,
      soloDatos: true,
    });
    return {
      id: creado.id,
      name: creado.name,
      ruc: creado.ruc ?? null,
      email: creado.email ?? null,
      phone: creado.phone ?? null,
      contactos: [],
    };
  }
}
