import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustodiaDto } from './dto/create-custodia.dto';

const CUSTODIA_RATES: Record<string, number> = {
  HACIENDA: 20,
  PUERTO: 10,
  VIP: 23,
};

const TIPO_LABELS: Record<string, string> = {
  HACIENDA: 'Hacienda',
  PUERTO: 'Puerto',
  VIP: 'VIP',
};

@Injectable()
export class CustodiasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCustodiaDto, companyId: number, userId: number) {
    const normalizedType = dto.tipoCustodia.toUpperCase().replace(/\s+/g, '_') as any;

    const existing = await this.prisma.custodia.findUnique({ where: { numeroGuia: dto.numeroGuia } });
    if (existing) {
      throw new BadRequestException('El número de guía ya existe.');
    }

    return this.prisma.custodia.create({
      data: {
        numeroGuia: dto.numeroGuia.trim(),
        tipoCustodia: normalizedType,
        choferName: dto.choferName.trim(),
        choferCedula: dto.choferCedula?.trim() || '',
        custodio1Name: dto.custodio1Name.trim(),
        custodio1Cedula: dto.custodio1Cedula?.trim() || '',
        custodio2Name: dto.custodio2Name.trim(),
        custodio2Cedula: dto.custodio2Cedula?.trim() || '',
        cliente: dto.cliente?.trim() || '',
        placa: dto.placa?.trim() || '',
        direccionSalida: dto.direccionSalida?.trim() || '',
        direccionLlegada: dto.direccionLlegada?.trim() || '',
        fechaHoraSalida: dto.fechaHoraSalida ? new Date(dto.fechaHoraSalida) : null,
        fechaHoraLlegada: dto.fechaHoraLlegada ? new Date(dto.fechaHoraLlegada) : null,
        observaciones: dto.observaciones?.trim() || null,
        nombreHacienda: dto.nombreHacienda?.trim() || null,
        cantidadSacos: dto.cantidadSacos || null,
        contenedores: dto.contenedores || [],
        companyId,
        createdBy: userId,
      },
    });
  }

  async findAll(companyId: number, filters?: { fechaInicio?: string; fechaFin?: string; tipo?: string; estado?: string }) {
    const where: any = { companyId };
    if (filters?.fechaInicio || filters?.fechaFin) {
      where.createdAt = {};
      if (filters.fechaInicio) where.createdAt.gte = new Date(`${filters.fechaInicio}T00:00:00.000Z`);
      if (filters.fechaFin) where.createdAt.lte = new Date(`${filters.fechaFin}T23:59:59.999Z`);
    }
    if (filters?.tipo) {
      where.tipoCustodia = filters.tipo.toUpperCase().replace(/\s+/g, '_');
    }
    if (filters?.estado) {
      where.estado = filters.estado;
    }
    return this.prisma.custodia.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: number, companyId: number) {
    const custodia = await this.prisma.custodia.findFirst({ where: { id, companyId } });
    if (!custodia) throw new NotFoundException('Custodia no encontrada.');
    return custodia;
  }

  async updateEstado(id: number, estado: string, companyId: number) {
    const validEstados = ['LISTO_PARA_CUSTODIAR', 'EN_CAMINO', 'LLEGO'];
    if (!validEstados.includes(estado)) {
      throw new BadRequestException(`Estado inválido. Opciones: ${validEstados.join(', ')}`);
    }
    await this.findOne(id, companyId);
    return this.prisma.custodia.update({ where: { id }, data: { estado } as any });
  }

  async remove(id: number, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.custodia.delete({ where: { id } });
  }

  async getAvailableCustodios(companyId: number) {
    let driveCustodios = await this.prisma.employeeDriveFolder.findMany({
      where: { companyId, folderType: 'CUSTODIAS' },
      orderBy: { employeeName: 'asc' },
    });

    if (driveCustodios.length === 0) {
      driveCustodios = await this.prisma.employeeDriveFolder.findMany({
        where: { folderType: 'CUSTODIAS' },
        orderBy: { employeeName: 'asc' },
      });
    }

    let candidates = await this.prisma.candidate.findMany({
      where: { companyId },
      include: { column: true },
    });

    if (candidates.length === 0) {
      candidates = await this.prisma.candidate.findMany({
        include: { column: true },
      });
    }

    const candidateMap = new Map(candidates.map((c) => [c.cedula, c.column?.name || 'Inscrito']));

    const list = driveCustodios.map((c) => ({
      name: c.employeeName,
      cedula: c.cedula,
      status: candidateMap.get(c.cedula) || 'Inscrito',
    }));

    for (const cand of candidates) {
      if (cand.positionApplied?.toLowerCase().includes('custodio')) {
        if (!list.some((item) => item.name.toLowerCase() === cand.fullName.toLowerCase())) {
          list.push({
            name: cand.fullName,
            cedula: cand.cedula,
            status: cand.column?.name || 'Inscrito',
          });
        }
      }
    }

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getNomina(companyId: number, fechaInicio: string, fechaFin: string) {
    const custodias = await this.findAll(companyId, { fechaInicio, fechaFin });
    const pagables = custodias.filter((c) => c.estado === 'LLEGO');

    const empleadosMap = new Map<string, {
      nombre: string;
      cedula: string;
      total_viajes: number;
      por_tipo: Record<string, number>;
      subtotales: Record<string, number>;
      total_usd: number;
      detalle: any[];
    }>();

    const registrar = (nombre: string, cedula: string, rol: string, custodia: any) => {
      const key = cedula?.trim() || nombre.trim();
      if (!empleadosMap.has(key)) {
        empleadosMap.set(key, {
          nombre: nombre.trim(),
          cedula: cedula?.trim() || '',
          total_viajes: 0,
          por_tipo: { HACIENDA: 0, PUERTO: 0, VIP: 0 },
          subtotales: { HACIENDA: 0, PUERTO: 0, VIP: 0 },
          total_usd: 0,
          detalle: [],
        });
      }
      const emp = empleadosMap.get(key)!;
      const tarifa = CUSTODIA_RATES[custodia.tipoCustodia] || 0;
      emp.total_viajes++;
      emp.por_tipo[custodia.tipoCustodia] = (emp.por_tipo[custodia.tipoCustodia] || 0) + 1;
      emp.subtotales[custodia.tipoCustodia] = (emp.subtotales[custodia.tipoCustodia] || 0) + tarifa;
      emp.total_usd += tarifa;
      emp.detalle.push({
        numero_guia: custodia.numeroGuia,
        rol,
        tipo_custodia: custodia.tipoCustodia,
        monto: tarifa,
        cliente: custodia.cliente,
        placa: custodia.placa,
        direccion_salida: custodia.direccionSalida,
        direccion_llegada: custodia.direccionLlegada,
        fecha_hora_salida: custodia.fechaHoraSalida,
        fecha_hora_llegada: custodia.fechaHoraLlegada,
        fecha_registro: custodia.createdAt,
      });
    };

    for (const c of pagables) {
      registrar(c.choferName, c.choferCedula, 'Chofer', c);
      registrar(c.custodio1Name, c.custodio1Cedula, 'Custodio 1', c);
      registrar(c.custodio2Name, c.custodio2Cedula, 'Custodio 2', c);
    }

    const empleados = Array.from(empleadosMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const total_pagado = empleados.reduce((sum, e) => sum + e.total_usd, 0);

    const totales_por_tipo: Record<string, number> = { HACIENDA: 0, PUERTO: 0, VIP: 0 };
    for (const c of pagables) totales_por_tipo[c.tipoCustodia]++;

    // Build chronological matrix
    const trabajadoresCatalogo = await this.prisma.employeeDriveFolder.findMany({
      where: { companyId, folderType: 'CUSTODIAS' },
      orderBy: { employeeName: 'asc' },
    });
    const columnasTrabajadores = trabajadoresCatalogo.map((e) => e.employeeName);
    const totalesMatrix: Record<string, number> = {};
    for (const t of columnasTrabajadores) totalesMatrix[t] = 0;

    const filas = [];
    for (const c of pagables) {
      const tarifa = CUSTODIA_RATES[c.tipoCustodia] || 0;
      const participantes = [
        { nombre: c.choferName, rol: 'Chofer' },
        { nombre: c.custodio1Name, rol: 'Custodio 1' },
        { nombre: c.custodio2Name, rol: 'Custodio 2' },
      ];
      const celdas: Record<string, any> = {};
      for (const p of participantes) {
        const tipoTxt = TIPO_LABELS[c.tipoCustodia] || c.tipoCustodia;
        let label: string;
        if (p.rol === 'Chofer') label = `Chofer-${tipoTxt}: ${tarifa}`;
        else label = `${p.rol === 'Custodio 1' ? 'Cust. 1' : 'Cust. 2'} ${c.tipoCustodia} ${tarifa} dolares`;
        celdas[p.nombre] = { tipo: c.tipoCustodia, monto: tarifa, rol: p.rol, label };
        if (totalesMatrix[p.nombre] !== undefined) totalesMatrix[p.nombre] += tarifa;
      }
      filas.push({
        fecha: c.fechaHoraSalida ? this.formatFechaEC(c.fechaHoraSalida) : this.formatFechaEC(c.createdAt),
        fecha_hora: c.fechaHoraSalida || c.createdAt,
        numero_guia: c.numeroGuia,
        cliente: c.cliente,
        placa: c.placa,
        celdas,
      });
    }

    const matriz = {
      columnas_fijas: ['fecha', 'guia'],
      columnas_trabajadores: columnasTrabajadores,
      filas,
      totales_por_trabajador: totalesMatrix,
      gran_total: Object.values(totalesMatrix).reduce((s, v) => s + v, 0),
    };

    return {
      periodo: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
      resumen: {
        total_custodias: pagables.length,
        total_pagado,
        empleados: empleados.length,
        totales_por_tipo,
        tarifas: CUSTODIA_RATES,
        nota: 'Solo incluye custodias en estado LLEGÓ.',
      },
      empleados: empleados.map(({ detalle, ...rest }) => rest),
      empleados_detalle: empleados,
      matriz,
      trabajadores_catalogo: columnasTrabajadores,
    };
  }

  async getDashboardStats(companyId: number, mes?: string) {
    const now = new Date();
    const targetMes = mes && /^\d{4}-\d{2}$/.test(mes)
      ? mes
      : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const [year, month] = targetMes.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const todas = await this.prisma.custodia.findMany({
      where: {
        companyId,
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: 'desc' },
    });

    const finalizadas = todas.filter((c) => c.estado === 'LLEGO');

    const porTipoMap: Record<string, { tipo: string; cantidad: number; total_costo: number; tarifa_persona: number }> = {
      HACIENDA: { tipo: 'HACIENDA', cantidad: 0, total_costo: 0, tarifa_persona: CUSTODIA_RATES.HACIENDA },
      PUERTO: { tipo: 'PUERTO', cantidad: 0, total_costo: 0, tarifa_persona: CUSTODIA_RATES.PUERTO },
      VIP: { tipo: 'VIP', cantidad: 0, total_costo: 0, tarifa_persona: CUSTODIA_RATES.VIP },
    };

    const porEstadoMap: Record<string, number> = {
      LISTO_PARA_CUSTODIAR: 0,
      EN_CAMINO: 0,
      LLEGO: 0,
    };

    const empleadosSet = new Set<string>();
    let total_nomina_usd = 0;

    for (const c of todas) {
      if (porEstadoMap[c.estado] !== undefined) porEstadoMap[c.estado]++;
    }

    for (const c of finalizadas) {
      if (porTipoMap[c.tipoCustodia]) {
        porTipoMap[c.tipoCustodia].cantidad++;
        porTipoMap[c.tipoCustodia].total_costo += (CUSTODIA_RATES[c.tipoCustodia] || 0) * 3;
      }
      total_nomina_usd += (CUSTODIA_RATES[c.tipoCustodia] || 0) * 3;
      [c.choferCedula || c.choferName, c.custodio1Cedula || c.custodio1Name, c.custodio2Cedula || c.custodio2Name]
        .filter(Boolean)
        .forEach((key) => empleadosSet.add(key.trim()));
    }

    return {
      periodo: {
        mes: targetMes,
        fecha_inicio: startDate.toISOString().split('T')[0],
        fecha_fin: endDate.toISOString().split('T')[0],
      },
      kpis: {
        total_viajes: todas.length,
        viajes_finalizados: finalizadas.length,
        total_nomina_usd,
        empleados_activos: empleadosSet.size,
      },
      por_tipo: Object.values(porTipoMap),
      por_estado: Object.entries(porEstadoMap).map(([estado, cantidad]) => ({ estado, cantidad })),
    };
  }

  async getTrabajadorByCedula(companyId: number, cedulaInput: string, mes?: string) {
    const cedulaNorm = String(cedulaInput || '').trim().replace(/\s+/g, '');
    if (!cedulaNorm) {
      throw new BadRequestException('La cédula es requerida.');
    }

    let startDate: Date | undefined;
    let endDate: Date | undefined;
    let periodObj: any = null;

    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      const [year, month] = mes.split('-').map(Number);
      startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      periodObj = {
        mes,
        fecha_inicio: startDate.toISOString().split('T')[0],
        fecha_fin: endDate.toISOString().split('T')[0],
      };
    }

    // Try finding employee name from Drive folders or Candidates
    const driveEmployee = await this.prisma.employeeDriveFolder.findFirst({
      where: { companyId, cedula: cedulaNorm },
    });
    const candidateEmployee = await this.prisma.candidate.findFirst({
      where: { companyId, cedula: cedulaNorm },
    });

    const knownName = driveEmployee?.employeeName || candidateEmployee?.fullName || '';

    const whereClause: any = {
      companyId,
      estado: 'LLEGO',
      OR: [
        { choferCedula: cedulaNorm },
        { custodio1Cedula: cedulaNorm },
        { custodio2Cedula: cedulaNorm },
      ],
    };

    if (knownName) {
      whereClause.OR.push(
        { choferName: { contains: knownName, mode: 'insensitive' } },
        { custodio1Name: { contains: knownName, mode: 'insensitive' } },
        { custodio2Name: { contains: knownName, mode: 'insensitive' } }
      );
    }

    if (startDate && endDate) {
      whereClause.createdAt = { gte: startDate, lte: endDate };
    }

    const rows = await this.prisma.custodia.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    const historial: any[] = [];
    let detectedName = knownName;
    let total_usd = 0;

    for (const c of rows) {
      const tarifa = CUSTODIA_RATES[c.tipoCustodia] || 0;
      let rol = 'Custodio';
      if (c.choferCedula === cedulaNorm || (knownName && c.choferName.toLowerCase().includes(knownName.toLowerCase()))) {
        rol = 'Chofer';
        if (!detectedName) detectedName = c.choferName;
      } else if (c.custodio1Cedula === cedulaNorm || (knownName && c.custodio1Name.toLowerCase().includes(knownName.toLowerCase()))) {
        rol = 'Custodio 1';
        if (!detectedName) detectedName = c.custodio1Name;
      } else if (c.custodio2Cedula === cedulaNorm || (knownName && c.custodio2Name.toLowerCase().includes(knownName.toLowerCase()))) {
        rol = 'Custodio 2';
        if (!detectedName) detectedName = c.custodio2Name;
      }

      total_usd += tarifa;
      historial.push({
        id: c.id,
        numero_guia: c.numeroGuia,
        tipo_custodia: c.tipoCustodia,
        rol,
        monto_usd: tarifa,
        cliente: c.cliente,
        placa: c.placa,
        direccion_salida: c.direccionSalida,
        direccion_llegada: c.direccionLlegada,
        fecha_hora_salida: c.fechaHoraSalida || c.createdAt,
        fecha_hora_llegada: c.fechaHoraLlegada,
        fecha_registro: c.createdAt,
        observaciones: c.observaciones,
      });
    }

    return {
      trabajador: { cedula: cedulaNorm, nombre: detectedName || 'Guardia' },
      periodo: periodObj,
      resumen: { total_viajes: historial.length, total_usd },
      historial,
      nota: 'Solo se muestran viajes con estado Finalizado (LLEGÓ).',
    };
  }

  async queryGemeBot(companyId: number, queryMessage: string) {
    const rawText = String(queryMessage || '').trim();
    if (!rawText) throw new BadRequestException('El mensaje no puede estar vacío.');

    const norm = rawText
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    // Intent detection
    let intent: 'antiguedad' | 'placa_puerto' | 'custodio_hacienda' | 'desconocido' = 'desconocido';

    if (
      norm.includes('primer viaje') ||
      norm.includes('antiguedad') ||
      norm.includes('antiguedad') ||
      norm.includes('tiempo') ||
      norm.includes('primer registro') ||
      norm.includes('lleva trabajando')
    ) {
      intent = 'antiguedad';
    } else if (
      norm.includes('placa') ||
      norm.includes('puerto') ||
      norm.includes('vehiculo') ||
      norm.includes('carro')
    ) {
      intent = 'placa_puerto';
    } else if (
      norm.includes('hacienda') ||
      norm.includes('custodio') ||
      norm.includes('30 dias') ||
      norm.includes('viajes')
    ) {
      intent = 'custodio_hacienda';
    }

    if (intent === 'placa_puerto') {
      const now = new Date();
      const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const PUERTORows = await this.prisma.custodia.findMany({
        where: {
          companyId,
          tipoCustodia: 'PUERTO',
          createdAt: { gte: startDate },
        },
        select: { placa: true },
      });

      const placaCountMap = new Map<string, number>();
      for (const row of PUERTORows) {
        const p = row.placa?.trim() || 'SIN PLACA';
        placaCountMap.set(p, (placaCountMap.get(p) || 0) + 1);
      }

      const ranking = Array.from(placaCountMap.entries())
        .map(([placa, viajes]) => ({ placa, viajes }))
        .sort((a, b) => b.viajes - a.viajes);

      if (ranking.length === 0) {
        return {
          intent,
          respuesta: 'No se encontraron viajes tipo PUERTO registrados en este mes.',
          datos: null,
        };
      }

      const top = ranking[0];
      const detalleRanking = ranking
        .slice(0, 5)
        .map((r, i) => `${i + 1}. Placa: ${r.placa} — ${r.viajes} viaje(s)`)
        .join('\n');

      return {
        intent,
        respuesta: `La placa GEMESEG más utilizada en rutas PUERTO este mes es **${top.placa}** con **${top.viajes}** viaje(s).\n\nRanking del mes:\n${detalleRanking}`,
        datos: { top, ranking },
      };
    }

    if (intent === 'custodio_hacienda') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const haciendaRows = await this.prisma.custodia.findMany({
        where: {
          companyId,
          tipoCustodia: 'HACIENDA',
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { custodio1Name: true, custodio2Name: true },
      });

      const custodioCountMap = new Map<string, number>();
      for (const row of haciendaRows) {
        if (row.custodio1Name?.trim()) {
          const n = row.custodio1Name.trim();
          custodioCountMap.set(n, (custodioCountMap.get(n) || 0) + 1);
        }
        if (row.custodio2Name?.trim()) {
          const n = row.custodio2Name.trim();
          custodioCountMap.set(n, (custodioCountMap.get(n) || 0) + 1);
        }
      }

      const ranking = Array.from(custodioCountMap.entries())
        .map(([nombre, viajes]) => ({ nombre, viajes }))
        .sort((a, b) => b.viajes - a.viajes);

      if (ranking.length === 0) {
        return {
          intent,
          respuesta: 'No hay custodias registradas para HACIENDA en los últimos 30 días.',
          datos: null,
        };
      }

      const top = ranking[0];
      const detalleRanking = ranking
        .slice(0, 5)
        .map((r, i) => `${i + 1}. ${r.nombre} — ${r.viajes} viaje(s) como custodio`)
        .join('\n');

      return {
        intent,
        respuesta: `En los últimos 30 días, el guardia con más viajes en HACIENDA es **${top.nombre}** con **${top.viajes}** participación(es).\n\nTop guardias:\n${detalleRanking}`,
        datos: { top, ranking },
      };
    }

    if (intent === 'antiguedad') {
      const custodiosDrive = await this.prisma.employeeDriveFolder.findMany({
        where: { companyId, folderType: 'CUSTODIAS' },
      });

      // Search for employee mentioned in query
      let matchedEmp = custodiosDrive.find((e) => norm.includes(e.employeeName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')));

      if (!matchedEmp) {
        const firstCustodia = await this.prisma.custodia.findFirst({
          where: { companyId },
          orderBy: { createdAt: 'asc' },
        });

        if (!firstCustodia) {
          return {
            intent,
            respuesta: 'No hay custodias registradas aún en el sistema.',
            datos: null,
          };
        }

        const viajesCount = await this.prisma.custodia.count({ where: { companyId } });
        return {
          intent,
          respuesta: `Primer viaje registrado en el sistema: Guía **${firstCustodia.numeroGuia}** (${firstCustodia.tipoCustodia}) el ${this.formatFechaEC(firstCustodia.createdAt)}. Total viajes registrados: ${viajesCount}. Si deseas consultar un guardia en específico, incluye su nombre completo.`,
          datos: { primer_viaje: firstCustodia, total_viajes: viajesCount },
        };
      }

      const patron = matchedEmp.employeeName;
      const primerViaje = await this.prisma.custodia.findFirst({
        where: {
          companyId,
          OR: [
            { choferName: { contains: patron, mode: 'insensitive' } },
            { custodio1Name: { contains: patron, mode: 'insensitive' } },
            { custodio2Name: { contains: patron, mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'asc' },
      });

      const totalViajes = await this.prisma.custodia.count({
        where: {
          companyId,
          OR: [
            { choferName: { contains: patron, mode: 'insensitive' } },
            { custodio1Name: { contains: patron, mode: 'insensitive' } },
            { custodio2Name: { contains: patron, mode: 'insensitive' } },
          ],
        },
      });

      const fechaInic = primerViaje?.createdAt || matchedEmp.createdAt;
      const dias = Math.floor((Date.now() - new Date(fechaInic).getTime()) / (1000 * 60 * 60 * 24));
      const meses = Math.floor(dias / 30);
      const tiempoTexto = meses >= 12
        ? `${Math.floor(meses / 12)} año(s) y ${meses % 12} mes(es)`
        : meses >= 1
          ? `${meses} mes(es)`
          : `${dias} día(s)`;

      return {
        intent,
        respuesta: `**${matchedEmp.employeeName}** lleva registrado en el sistema ${tiempoTexto} (desde ${this.formatFechaEC(fechaInic)}).\n` +
          (primerViaje ? `Su primer viaje registrado fue la guía **${primerViaje.numeroGuia}** (${primerViaje.tipoCustodia}) el ${this.formatFechaEC(primerViaje.createdAt)}.\n` : '') +
          `Total de custodias asociadas: **${totalViajes}**.`,
        datos: { guardia: matchedEmp.employeeName, primer_viaje: primerViaje, total_viajes: totalViajes },
      };
    }

    return {
      intent: 'desconocido',
      respuesta: 'Lo siento, no logré entender la consulta. Puedes preguntarme sobre:\n1. Antigüedad / primer viaje de un guardia\n2. Placa más usada en PUERTO este mes\n3. Guardias con más viajes en HACIENDA en los últimos 30 días',
      datos: null,
    };
  }

  private formatFechaEC(date: Date): string {
    const d = new Date(date);
    const dia = String(d.getUTCDate()).padStart(2, '0');
    const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
    const anio = d.getUTCFullYear();
    return `${dia}/${mes}/${anio}`;
  }

  private formatFechaHoraEC(date: Date): string {
    const d = new Date(date);
    const dia = String(d.getUTCDate()).padStart(2, '0');
    const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
    const anio = d.getUTCFullYear();
    const hora = String(d.getUTCHours()).padStart(2, '0');
    const minuto = String(d.getUTCMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${anio} ${hora}:${minuto}`;
  }
}
