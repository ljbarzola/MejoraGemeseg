import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ensureDefaultServices } from './ventas-servicios.util';
import { graciaSugerida } from './client-lifecycle.util';
import { VentasMotivosService, type MotivoInput } from './ventas-motivos.service';
import {
  calcularEstadoContrato,
  calcularEstadoGarantia,
  esProducto,
  hoyEcuador,
  parseDiaContrato,
  sumarDias,
} from './agreement-status.util';
import {
  CreateSalesAgreementDto,
  CreateSalesServiceDto,
  RenewSalesAgreementDto,
  UpdateSalesAgreementDto,
  UpdateSalesServiceDto,
} from './dto/agreement.dto';

// "Contrato" en la pantalla de Ventas = SalesAgreement: el acuerdo comercial de
// un cliente (servicios, vigencia, renovaciones). SalesContract es el
// DOCUMENTO que se genera y firma (pantalla "Documentos y firma"); un contrato puede
// tener varios documentos colgando de él (SalesAgreementDocument).

const MAX_TITULO = 150;
const MAX_NOTAS = 2000;
const MAX_SERVICIO = 100;

const norm = (s: string | null | undefined) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const incluirContrato = {
  salesClient: { select: { id: true, name: true } },
  services: { include: { service: { select: { id: true, name: true } } } },
  _count: { select: { documents: true } },
} satisfies Prisma.SalesAgreementInclude;

type ContratoConRelaciones = Prisma.SalesAgreementGetPayload<{
  include: typeof incluirContrato;
}>;

@Injectable()
export class VentasAcuerdosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly motivos: VentasMotivosService,
  ) {}

  private requireCompany(companyId: number | null): number {
    if (!companyId) throw new BadRequestException('Se requiere una empresa');
    return companyId;
  }

  // ---------------------------------------------------------------------
  // Catálogo de servicios
  // ---------------------------------------------------------------------

  async listServices(companyId: number | null, incluirInactivos = false) {
    const cid = this.requireCompany(companyId);
    await ensureDefaultServices(this.prisma, cid);
    const servicios = await this.prisma.salesService.findMany({
      where: {
        companyId: cid,
        ...(incluirInactivos ? {} : { isActive: true }),
      },
      include: { _count: { select: { agreements: true } } },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
    return servicios.map(({ _count, ...s }) => ({
      ...s,
      contratos: _count.agreements,
    }));
  }

  private limpiarNombreServicio(raw: string | undefined): string {
    const name = (raw || '').trim();
    if (!name) throw new BadRequestException('Escribe el nombre del servicio.');
    if (name.length > MAX_SERVICIO) {
      throw new BadRequestException(
        `El nombre no puede pasar de ${MAX_SERVICIO} caracteres.`,
      );
    }
    return name;
  }

  async createService(companyId: number | null, dto: CreateSalesServiceDto) {
    const cid = this.requireCompany(companyId);
    const name = this.limpiarNombreServicio(dto.name);
    const existe = await this.prisma.salesService.findFirst({
      where: { companyId: cid, name: { equals: name, mode: 'insensitive' } },
    });
    if (existe) {
      throw new BadRequestException('Ya existe un servicio con ese nombre.');
    }
    const ultimo = await this.prisma.salesService.aggregate({
      where: { companyId: cid },
      _max: { order: true },
    });
    return this.prisma.salesService.create({
      data: {
        companyId: cid,
        name,
        description: dto.description?.trim() || null,
        order: (ultimo._max.order ?? -1) + 1,
      },
    });
  }

  async updateService(
    companyId: number | null,
    id: number,
    dto: UpdateSalesServiceDto,
  ) {
    const cid = this.requireCompany(companyId);
    const actual = await this.prisma.salesService.findFirst({
      where: { id, companyId: cid },
    });
    if (!actual) throw new NotFoundException('Servicio no encontrado');
    const data: Prisma.SalesServiceUpdateInput = {};
    if (dto.name !== undefined) {
      const name = this.limpiarNombreServicio(dto.name);
      const repetido = await this.prisma.salesService.findFirst({
        where: {
          companyId: cid,
          id: { not: id },
          name: { equals: name, mode: 'insensitive' },
        },
      });
      if (repetido) {
        throw new BadRequestException('Ya existe un servicio con ese nombre.');
      }
      data.name = name;
    }
    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.salesService.update({ where: { id }, data });
  }

  async deleteService(companyId: number | null, id: number) {
    const cid = this.requireCompany(companyId);
    const actual = await this.prisma.salesService.findFirst({
      where: { id, companyId: cid },
      include: { _count: { select: { agreements: true } } },
    });
    if (!actual) throw new NotFoundException('Servicio no encontrado');
    if (actual._count.agreements > 0) {
      throw new BadRequestException(
        `Este servicio está en ${actual._count.agreements} contrato(s). Desactívalo en lugar de eliminarlo: deja de ofrecerse en los nuevos pero no se pierde de los que ya lo tienen.`,
      );
    }
    await this.prisma.salesService.delete({ where: { id } });
    return { success: true };
  }

  // ---------------------------------------------------------------------
  // Contratos comerciales
  // ---------------------------------------------------------------------

  private formatear(c: ContratoConRelaciones) {
    const { services, _count, monthlyValue, totalValue, ...resto } = c;
    return {
      ...resto,
      monthlyValue: monthlyValue === null ? null : Number(monthlyValue),
      totalValue: totalValue === null ? null : Number(totalValue),
      garantia: esProducto(c) ? calcularEstadoGarantia(c.warrantyUntil) : null,
      services: services.map((s) => s.service),
      documentos: _count.documents,
      estado: calcularEstadoContrato(c),
    };
  }

  async listAgreements(
    companyId: number | null,
    filters: {
      clientId?: number;
      estado?: string;
      serviceId?: number;
      q?: string;
      kind?: string;
    } = {},
  ) {
    const cid = this.requireCompany(companyId);
    const where: Prisma.SalesAgreementWhereInput = { companyId: cid };
    if (filters.kind === 'SERVICIO' || filters.kind === 'PRODUCTO') {
      where.kind = filters.kind;
    }
    if (filters.clientId) where.salesClientId = filters.clientId;
    if (filters.serviceId) {
      where.services = { some: { serviceId: filters.serviceId } };
    }
    const filas = await this.prisma.salesAgreement.findMany({
      where,
      include: incluirContrato,
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
    });
    // Motivo del último cierre registrado (cancelación o vencimiento sin
    // renovar), para saber de un vistazo cuáles contratos aún no lo explican.
    const cierres = await this.prisma.salesReasonEntry.findMany({
      where: {
        companyId: cid,
        agreementId: { in: filas.map((f) => f.id) },
        kind: { in: ['CONTRATO_CANCELADO', 'CONTRATO_NO_RENOVADO'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { agreementId: true, reasonLabel: true },
    });
    const motivoPorContrato = new Map<number, string>();
    for (const e of cierres) {
      if (e.agreementId && !motivoPorContrato.has(e.agreementId)) {
        motivoPorContrato.set(e.agreementId, e.reasonLabel);
      }
    }
    const q = norm(filters.q);
    return filas
      .map((c) => ({
        ...this.formatear(c),
        motivoCierre: motivoPorContrato.get(c.id) ?? null,
      }))
      .filter((c) => !filters.estado || c.estado === filters.estado)
      .filter(
        (c) =>
          !q ||
          norm(c.salesClient.name).includes(q) ||
          norm(c.title).includes(q) ||
          c.services.some((s) => norm(s.name).includes(q)),
      );
  }

  async getAgreement(companyId: number | null, id: number) {
    const cid = this.requireCompany(companyId);
    const c = await this.prisma.salesAgreement.findFirst({
      where: { id, companyId: cid },
      include: {
        ...incluirContrato,
        renewedFrom: {
          select: { id: true, title: true, startDate: true, endDate: true },
        },
        renewals: {
          select: { id: true, title: true, startDate: true, endDate: true },
        },
        documents: {
          include: {
            contract: {
              select: {
                id: true,
                contractNumber: true,
                status: true,
                createdAt: true,
                signedAt: true,
                template: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!c) throw new NotFoundException('Contrato no encontrado');
    const motivos = await this.prisma.salesReasonEntry.findMany({
      where: { companyId: cid, agreementId: id },
      orderBy: { createdAt: 'desc' },
    });
    return { ...this.formatear(c), motivos };
  }

  private fechasValidas(
    startRaw: string | undefined,
    endRaw: string | undefined,
  ): { startDate: Date; endDate: Date | null } {
    const startDate = parseDiaContrato(startRaw);
    if (!startDate) {
      throw new BadRequestException('La fecha de inicio no es válida.');
    }
    let endDate: Date | null = null;
    if ((endRaw || '').trim()) {
      endDate = parseDiaContrato(endRaw);
      if (!endDate) {
        throw new BadRequestException('La fecha de fin no es válida.');
      }
      if (endDate.getTime() < startDate.getTime()) {
        throw new BadRequestException(
          'La fecha de fin no puede ser anterior a la de inicio.',
        );
      }
    }
    return { startDate, endDate };
  }

  private textoOpcional(raw: string | undefined, max: number, nombre: string) {
    const t = (raw || '').trim();
    if (t.length > max) {
      throw new BadRequestException(
        `${nombre} no puede pasar de ${max} caracteres.`,
      );
    }
    return t || null;
  }

  // Valor mensual: null/undefined = no registrado.
  private valorMensual(v: number | null | undefined): number | null | undefined {
    if (v === undefined || v === null) return v;
    if (!Number.isFinite(v) || v < 0) {
      throw new BadRequestException('El valor mensual no es válido.');
    }
    return v;
  }

  private valorTotal(v: number | null | undefined): number | null | undefined {
    if (v === undefined || v === null) return v;
    if (!Number.isFinite(v) || v < 0) {
      throw new BadRequestException('El valor total no es válido.');
    }
    return v;
  }

  // Fin de garantía de un producto: vacío = sin garantía; no puede ser anterior a
  // la fecha de la venta.
  private garantiaValida(raw: string | undefined, venta: Date): Date | null {
    if (!(raw || '').trim()) return null;
    const d = parseDiaContrato(raw);
    if (!d) throw new BadRequestException('La fecha de fin de la garantía no es válida.');
    if (d.getTime() < venta.getTime()) {
      throw new BadRequestException(
        'La garantía no puede terminar antes de la fecha de la venta.',
      );
    }
    return d;
  }

  private diasDeGracia(v: number | undefined, sugerido: number): number {
    if (v === undefined) return sugerido;
    if (!Number.isInteger(v) || v < 0 || v > 365) {
      throw new BadRequestException(
        'Los días de gracia deben ser un número entero entre 0 y 365.',
      );
    }
    return v;
  }

  // Los servicios deben ser de la empresa. Al CREAR además tienen que estar
  // activos; al editar se conservan los que el contrato ya tenía aunque se
  // hayan desactivado después (`yaAsignados`).
  private async validarServicios(
    companyId: number,
    serviceIds: number[] | undefined,
    yaAsignados: number[] = [],
  ): Promise<number[]> {
    const ids = [...new Set(serviceIds || [])];
    if (ids.length === 0) {
      throw new BadRequestException('Elige al menos un servicio.');
    }
    const encontrados = await this.prisma.salesService.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true, isActive: true },
    });
    if (encontrados.length !== ids.length) {
      throw new BadRequestException('Alguno de los servicios no existe.');
    }
    const inactivoNuevo = encontrados.find(
      (s) => !s.isActive && !yaAsignados.includes(s.id),
    );
    if (inactivoNuevo) {
      throw new BadRequestException(
        'Alguno de los servicios está desactivado. Actívalo primero o quítalo.',
      );
    }
    return ids;
  }

  // ¿Este contrato renueva con menos que el anterior? Menos servicios, o un
  // valor mensual menor (en seguridad lo común es bajar guardias u horas sin
  // quitar el servicio, y eso solo se ve en el valor). Si es así, hay que
  // explicar por qué.
  private detectarReduccion(
    anterior: {
      services: { serviceId: number; service?: { name: string } }[];
      monthlyValue: Prisma.Decimal | number | null;
    },
    nuevosServicios: number[],
    nuevoValor: number | null,
  ) {
    const quitados = anterior.services.filter(
      (s) => !nuevosServicios.includes(s.serviceId),
    );
    const valorAnterior =
      anterior.monthlyValue === null ? null : Number(anterior.monthlyValue);
    const valorBaja =
      valorAnterior !== null && nuevoValor !== null && nuevoValor < valorAnterior;
    return {
      hay: quitados.length > 0 || valorBaja,
      quitados,
      valorAnterior,
      valorNuevo: nuevoValor,
    };
  }

  private async cargarAnterior(companyId: number, id: number) {
    const a = await this.prisma.salesAgreement.findFirst({
      where: { id, companyId },
      include: {
        services: { include: { service: { select: { name: true } } } },
      },
    });
    if (!a) throw new NotFoundException('Contrato no encontrado');
    return a;
  }

  async createAgreement(
    companyId: number | null,
    userId: number,
    dto: CreateSalesAgreementDto,
    renovacion?: { anterior: Awaited<ReturnType<VentasAcuerdosService['cargarAnterior']>> },
  ) {
    const cid = this.requireCompany(companyId);
    const cliente = await this.prisma.salesClient.findFirst({
      where: { id: dto.salesClientId, companyId: cid },
      select: { id: true },
    });
    if (!cliente) throw new NotFoundException('Cuenta no encontrada');
    const producto = dto.kind === 'PRODUCTO';
    if (producto && renovacion) {
      throw new BadRequestException('Una venta de producto no se renueva.');
    }
    // Una venta de producto no tiene fecha de fin: solo la fecha de la venta.
    const { startDate, endDate } = this.fechasValidas(
      dto.startDate,
      producto ? undefined : dto.endDate,
    );
    const serviceIds = await this.validarServicios(cid, dto.serviceIds);
    const title = this.textoOpcional(dto.title, MAX_TITULO, 'El título');
    const notes = this.textoOpcional(dto.notes, MAX_NOTAS, 'Las notas');
    const monthlyValue = producto ? null : (this.valorMensual(dto.monthlyValue) ?? null);
    const totalValue = producto ? (this.valorTotal(dto.totalValue) ?? null) : null;
    const warrantyUntil = producto ? this.garantiaValida(dto.warrantyUntil, startDate) : null;
    const graceDays = this.diasDeGracia(
      dto.graceDays,
      graciaSugerida(startDate, endDate),
    );

    if (dto.opportunityId) {
      const opp = await this.prisma.salesOpportunity.findFirst({
        where: {
          id: dto.opportunityId,
          companyId: cid,
          salesClientId: dto.salesClientId,
        },
        select: { id: true },
      });
      if (!opp) {
        throw new BadRequestException(
          'Esa oportunidad no existe o es de otro cliente.',
        );
      }
    }

    const reduccion = renovacion
      ? this.detectarReduccion(renovacion.anterior, serviceIds, monthlyValue)
      : null;
    if (reduccion?.hay && !dto.motivo?.reasonId) {
      throw new BadRequestException(
        'Esta renovación baja los servicios o el valor mensual respecto al contrato anterior: indica el motivo.',
      );
    }

    return this.prisma
      .$transaction(async (tx) => {
        const creado = await tx.salesAgreement.create({
          data: {
            companyId: cid,
            salesClientId: dto.salesClientId,
            title,
            notes,
            startDate,
            endDate,
            monthlyValue,
            graceDays,
            kind: producto ? 'PRODUCTO' : 'SERVICIO',
            status: producto ? 'POR_ENTREGAR' : 'ACTIVO',
            totalValue,
            warrantyUntil,
            opportunityId: dto.opportunityId ?? null,
            renewedFromId: renovacion?.anterior.id ?? null,
            createdBy: userId,
            services: {
              create: serviceIds.map((serviceId) => ({ serviceId })),
            },
          },
          select: { id: true },
        });
        if (renovacion) {
          await tx.salesAgreement.update({
            where: { id: renovacion.anterior.id },
            data: { status: 'RENOVADO' },
          });
          if (reduccion?.hay) {
            await this.motivos.registrar(
              tx,
              cid,
              userId,
              'CONTRATO_REDUCCION',
              dto.motivo,
              {
                agreementId: creado.id,
                salesClientId: dto.salesClientId,
                detail: {
                  contratoAnterior: renovacion.anterior.id,
                  serviciosQuitados: reduccion.quitados.map(
                    (s) => s.service?.name ?? `#${s.serviceId}`,
                  ),
                  valorAnterior: reduccion.valorAnterior,
                  valorNuevo: reduccion.valorNuevo,
                },
              },
            );
          }
        }
        return creado;
      })
      .then((r) => this.getAgreement(cid, r.id));
  }

  async updateAgreement(
    companyId: number | null,
    userId: number,
    id: number,
    dto: UpdateSalesAgreementDto,
  ) {
    const cid = this.requireCompany(companyId);
    const actual = await this.prisma.salesAgreement.findFirst({
      where: { id, companyId: cid },
      include: { services: { select: { serviceId: true } } },
    });
    if (!actual) throw new NotFoundException('Contrato no encontrado');

    const producto = esProducto(actual);
    if (producto && (dto.endDate ?? '').trim()) {
      throw new BadRequestException('Una venta de producto no tiene fecha de fin.');
    }

    const data: Prisma.SalesAgreementUpdateInput = {};
    let inicioNuevo = actual.startDate;
    let finNuevo = actual.endDate;
    if (dto.startDate !== undefined || (!producto && dto.endDate !== undefined)) {
      const inicio =
        dto.startDate !== undefined
          ? dto.startDate
          : actual.startDate.toISOString().slice(0, 10);
      const fin =
        dto.endDate !== undefined
          ? dto.endDate
          : (actual.endDate?.toISOString().slice(0, 10) ?? '');
      const { startDate, endDate } = this.fechasValidas(inicio, fin);
      data.startDate = startDate;
      data.endDate = endDate;
      inicioNuevo = startDate;
      finNuevo = endDate;
    }
    if (dto.title !== undefined) {
      data.title = this.textoOpcional(dto.title, MAX_TITULO, 'El título');
    }
    if (dto.notes !== undefined) {
      data.notes = this.textoOpcional(dto.notes, MAX_NOTAS, 'Las notas');
    }
    if (!producto && dto.monthlyValue !== undefined) {
      data.monthlyValue = this.valorMensual(dto.monthlyValue);
    }
    if (producto) {
      if (dto.totalValue !== undefined) {
        data.totalValue = this.valorTotal(dto.totalValue);
      }
      if (dto.warrantyUntil !== undefined || dto.startDate !== undefined) {
        const garantia =
          dto.warrantyUntil !== undefined
            ? dto.warrantyUntil
            : (actual.warrantyUntil?.toISOString().slice(0, 10) ?? '');
        data.warrantyUntil = this.garantiaValida(garantia, inicioNuevo);
      }
    }
    if (!producto && dto.graceDays !== undefined) {
      data.graceDays = this.diasDeGracia(
        dto.graceDays,
        graciaSugerida(inicioNuevo, finNuevo),
      );
    }
    if (dto.status !== undefined && producto) {
      // Venta de producto: Por entregar <-> Entregado (también reactiva un
      // producto cancelado). Cancelar sigue teniendo su ruta, que pide el motivo.
      if (dto.status !== 'POR_ENTREGAR' && dto.status !== 'ENTREGADO') {
        throw new BadRequestException(
          'Para cancelar usa «Cancelar contrato», que pide el motivo.',
        );
      }
      data.status = dto.status;
      data.cancelledAt = null;
      if (dto.status === 'ENTREGADO') {
        const entregado = (dto.deliveredAt ?? '').trim()
          ? parseDiaContrato(dto.deliveredAt)
          : parseDiaContrato(hoyEcuador());
        if (!entregado) {
          throw new BadRequestException('La fecha de entrega no es válida.');
        }
        data.deliveredAt = entregado;
      } else {
        data.deliveredAt = null;
      }
    } else if (dto.status !== undefined) {
      // Cancelar tiene su propia ruta porque exige el motivo (POST :id/cancelar);
      // por aquí solo se puede reactivar un contrato cancelado.
      if (dto.status !== 'ACTIVO') {
        throw new BadRequestException(
          'Para cancelar un contrato usa «Cancelar contrato», que pide el motivo. "Renovado" lo pone la renovación.',
        );
      }
      if (actual.status === 'RENOVADO') {
        throw new BadRequestException(
          'Este contrato ya fue renovado. Cambia el contrato que lo sigue.',
        );
      }
      data.status = 'ACTIVO';
      data.cancelledAt = null;
    }

    const nuevosServicios =
      dto.serviceIds !== undefined
        ? await this.validarServicios(
            cid,
            dto.serviceIds,
            actual.services.map((s) => s.serviceId),
          )
        : null;

    // Si este contrato es la renovación de otro y se le quitan servicios o se
    // baja su valor frente al anterior, hay que explicarlo igual que al renovar.
    let reduccion: ReturnType<VentasAcuerdosService['detectarReduccion']> | null = null;
    if (actual.renewedFromId && (nuevosServicios || dto.monthlyValue !== undefined)) {
      const anterior = await this.cargarAnterior(cid, actual.renewedFromId);
      const valorNuevo =
        dto.monthlyValue !== undefined
          ? (this.valorMensual(dto.monthlyValue) ?? null)
          : actual.monthlyValue === null
            ? null
            : Number(actual.monthlyValue);
      reduccion = this.detectarReduccion(
        anterior,
        nuevosServicios ?? actual.services.map((s) => s.serviceId),
        valorNuevo,
      );
      if (reduccion.hay && !dto.motivo?.reasonId) {
        throw new BadRequestException(
          'Este cambio deja el contrato con menos servicios o menor valor que el anterior: indica el motivo.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.salesAgreement.update({ where: { id }, data });
      if (nuevosServicios) {
        await tx.salesAgreementService.deleteMany({
          where: { agreementId: id },
        });
        await tx.salesAgreementService.createMany({
          data: nuevosServicios.map((serviceId) => ({
            agreementId: id,
            serviceId,
          })),
        });
      }
      if (reduccion?.hay) {
        await this.motivos.registrar(
          tx,
          cid,
          userId,
          'CONTRATO_REDUCCION',
          dto.motivo,
          {
            agreementId: id,
            salesClientId: actual.salesClientId,
            detail: {
              contratoAnterior: actual.renewedFromId,
              serviciosQuitados: reduccion.quitados.map(
                (s) => s.service?.name ?? `#${s.serviceId}`,
              ),
              valorAnterior: reduccion.valorAnterior,
              valorNuevo: reduccion.valorNuevo,
            },
          },
        );
      }
    });
    return this.getAgreement(cid, id);
  }

  // Cancelar un contrato: exige el motivo (queda en el expediente del cliente
  // para que el agente de ventas pueda explicar la baja).
  async cancelAgreement(
    companyId: number | null,
    userId: number,
    id: number,
    dto: { date?: string; motivo?: MotivoInput },
  ) {
    const cid = this.requireCompany(companyId);
    const actual = await this.prisma.salesAgreement.findFirst({
      where: { id, companyId: cid },
      select: { id: true, status: true, salesClientId: true },
    });
    if (!actual) throw new NotFoundException('Contrato no encontrado');
    if (actual.status === 'CANCELADO') {
      throw new BadRequestException('Este contrato ya está cancelado.');
    }
    if (actual.status === 'RENOVADO') {
      throw new BadRequestException(
        'Este contrato ya fue renovado. Cancela el contrato que lo sigue.',
      );
    }
    let cancelledAt = new Date();
    if (dto.date?.trim()) {
      const d = parseDiaContrato(dto.date);
      if (!d) throw new BadRequestException('La fecha de cancelación no es válida.');
      cancelledAt = d;
    }
    await this.prisma.$transaction(async (tx) => {
      await this.motivos.registrar(
        tx,
        cid,
        userId,
        'CONTRATO_CANCELADO',
        dto.motivo,
        { agreementId: id, salesClientId: actual.salesClientId },
      );
      await tx.salesAgreement.update({
        where: { id },
        data: { status: 'CANCELADO', cancelledAt },
      });
    });
    return this.getAgreement(cid, id);
  }

  // Explica por qué un contrato venció sin renovarse. No cambia su estado (que
  // sigue calculándose con las fechas): solo deja el motivo registrado.
  async registrarCierre(
    companyId: number | null,
    userId: number,
    id: number,
    motivo: MotivoInput | undefined,
  ) {
    const cid = this.requireCompany(companyId);
    const actual = await this.prisma.salesAgreement.findFirst({
      where: { id, companyId: cid },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        kind: true,
        salesClientId: true,
      },
    });
    if (!actual) throw new NotFoundException('Contrato no encontrado');
    if (calcularEstadoContrato(actual) !== 'VENCIDO') {
      throw new BadRequestException(
        'Solo se puede explicar el cierre de un contrato vencido que no se renovó.',
      );
    }
    await this.motivos.registrar(
      this.prisma,
      cid,
      userId,
      'CONTRATO_NO_RENOVADO',
      motivo,
      { agreementId: id, salesClientId: actual.salesClientId },
    );
    return this.getAgreement(cid, id);
  }

  async deleteAgreement(companyId: number | null, id: number) {
    const cid = this.requireCompany(companyId);
    const actual = await this.prisma.salesAgreement.findFirst({
      where: { id, companyId: cid },
      select: { id: true, renewedFromId: true },
    });
    if (!actual) throw new NotFoundException('Contrato no encontrado');
    await this.prisma.$transaction(async (tx) => {
      // Si este contrato era la renovación de otro, el anterior vuelve a
      // quedar activo (su vigencia se vuelve a calcular con sus fechas).
      if (actual.renewedFromId) {
        const otras = await tx.salesAgreement.count({
          where: { renewedFromId: actual.renewedFromId, id: { not: id } },
        });
        if (otras === 0) {
          await tx.salesAgreement.updateMany({
            where: { id: actual.renewedFromId, status: 'RENOVADO' },
            data: { status: 'ACTIVO' },
          });
        }
      }
      await tx.salesReasonEntry.deleteMany({
        where: { companyId: cid, agreementId: id },
      });
      await tx.salesAgreement.delete({ where: { id } });
    });
    return { success: true };
  }

  async renewAgreement(
    companyId: number | null,
    userId: number,
    id: number,
    dto: RenewSalesAgreementDto,
  ) {
    const cid = this.requireCompany(companyId);
    const anterior = await this.cargarAnterior(cid, id);
    if (esProducto(anterior)) {
      throw new BadRequestException(
        'Una venta de producto no se renueva. Si el cliente compra otra vez, registra una venta nueva.',
      );
    }
    if (anterior.status === 'RENOVADO') {
      throw new BadRequestException('Este contrato ya fue renovado.');
    }
    if (anterior.status === 'CANCELADO') {
      throw new BadRequestException(
        'Un contrato cancelado no se renueva. Crea uno nuevo para el cliente.',
      );
    }
    const inicio =
      dto.startDate ||
      (anterior.endDate
        ? sumarDias(anterior.endDate, 1).toISOString().slice(0, 10)
        : '');
    if (!inicio) {
      throw new BadRequestException(
        'Este contrato no tiene fecha de fin: indica desde cuándo empieza la renovación.',
      );
    }
    return this.createAgreement(
      cid,
      userId,
      {
        salesClientId: anterior.salesClientId,
        title: dto.title ?? anterior.title ?? undefined,
        startDate: inicio,
        endDate: dto.endDate,
        notes: dto.notes,
        serviceIds: dto.serviceIds ?? anterior.services.map((s) => s.serviceId),
        // Si no se indica, la renovación conserva el valor y la gracia del
        // anterior (así no aparece como una reducción que nadie pidió).
        monthlyValue:
          dto.monthlyValue !== undefined
            ? dto.monthlyValue
            : anterior.monthlyValue === null
              ? null
              : Number(anterior.monthlyValue),
        graceDays: dto.graceDays ?? anterior.graceDays,
        motivo: dto.motivo,
      },
      { anterior },
    );
  }

  // ---------------------------------------------------------------------
  // Documentos (SalesContract) colgados de un contrato
  // ---------------------------------------------------------------------

  async linkDocument(
    companyId: number | null,
    agreementId: number,
    contractId: number,
  ) {
    const cid = this.requireCompany(companyId);
    const [contrato, documento] = await Promise.all([
      this.prisma.salesAgreement.findFirst({
        where: { id: agreementId, companyId: cid },
        select: { id: true, salesClientId: true },
      }),
      this.prisma.salesContract.findFirst({
        where: { id: contractId, companyId: cid },
        select: { id: true, salesClientId: true },
      }),
    ]);
    if (!contrato) throw new NotFoundException('Contrato no encontrado');
    if (!documento) throw new NotFoundException('Documento no encontrado');
    if (
      documento.salesClientId &&
      documento.salesClientId !== contrato.salesClientId
    ) {
      throw new BadRequestException(
        'Ese documento pertenece a otro cliente. Solo se pueden vincular documentos del mismo cliente.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      // Un documento sin cliente toma el del contrato al que se vincula.
      if (!documento.salesClientId) {
        await tx.salesContract.update({
          where: { id: contractId },
          data: { salesClientId: contrato.salesClientId },
        });
      }
      await tx.salesAgreementDocument.upsert({
        where: { contractId },
        create: { contractId, agreementId },
        update: { agreementId },
      });
    });
    return this.getAgreement(cid, agreementId);
  }

  async unlinkDocument(
    companyId: number | null,
    agreementId: number,
    contractId: number,
  ) {
    const cid = this.requireCompany(companyId);
    const contrato = await this.prisma.salesAgreement.findFirst({
      where: { id: agreementId, companyId: cid },
      select: { id: true },
    });
    if (!contrato) throw new NotFoundException('Contrato no encontrado');
    await this.prisma.salesAgreementDocument.deleteMany({
      where: { contractId, agreementId },
    });
    return this.getAgreement(cid, agreementId);
  }

  // Documentos ya generados que quedaron sin cliente (antes el vínculo era
  // opcional). Los enlaza solo cuando hay UNA coincidencia clara por correo y,
  // si no, por nombre exacto (sin importar tildes ni mayúsculas); lo ambiguo o
  // sin coincidencia no se toca, para revisarlo a mano.
  async vincularDocumentosSinCliente(companyId: number | null) {
    const cid = this.requireCompany(companyId);
    const [documentos, clientes] = await Promise.all([
      this.prisma.salesContract.findMany({
        where: { companyId: cid, salesClientId: null },
        select: { id: true, clientName: true, clientEmail: true },
      }),
      this.prisma.salesClient.findMany({
        where: { companyId: cid },
        select: { id: true, name: true, email: true },
      }),
    ]);
    const indexar = (clave: (c: (typeof clientes)[number]) => string) => {
      const m = new Map<string, number[]>();
      for (const c of clientes) {
        const k = clave(c);
        if (!k) continue;
        m.set(k, [...(m.get(k) ?? []), c.id]);
      }
      return m;
    };
    const porCorreo = indexar((c) => norm(c.email));
    const porNombre = indexar((c) => norm(c.name));

    let vinculados = 0;
    let ambiguos = 0;
    let sinCoincidencia = 0;
    for (const d of documentos) {
      const porMail = porCorreo.get(norm(d.clientEmail)) ?? [];
      const porNom = porNombre.get(norm(d.clientName)) ?? [];
      const candidatos = porMail.length > 0 ? porMail : porNom;
      if (candidatos.length === 1) {
        await this.prisma.salesContract.update({
          where: { id: d.id },
          data: { salesClientId: candidatos[0] },
        });
        vinculados++;
      } else if (candidatos.length > 1) {
        ambiguos++;
      } else {
        sinCoincidencia++;
      }
    }
    return {
      revisados: documentos.length,
      vinculados,
      ambiguos,
      sinCoincidencia,
    };
  }
}
