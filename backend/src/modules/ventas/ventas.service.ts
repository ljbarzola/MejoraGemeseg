import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function getISOWeekNumber(d: Date): { year: number; weekNumber: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), weekNumber: weekNo };
}

@Injectable()
export class VentasService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== METAS Y SEMÁFORO ====================
  async getGoals(companyId: number, year?: number, weekNumber?: number) {
    const current = getISOWeekNumber(new Date());
    const y = year || current.year;
    const w = weekNumber || current.weekNumber;

    const sellers = await this.prisma.user.findMany({
      where: { companyId, isActive: true },
      select: { id: true, fullName: true, email: true, role: true },
      orderBy: { fullName: 'asc' },
    });

    const goals = await this.prisma.salesGoal.findMany({
      where: { companyId, year: y, weekNumber: w },
    });

    const goalMap = new Map(goals.map((g) => [g.userId, g.weeklyVisitGoal]));

    // Start & End of week in UTC
    const result = [];
    for (const seller of sellers) {
      const targetGoal = goalMap.get(seller.id) ?? 20;

      // Count completed visits this week
      const completedVisits = await this.prisma.clientVisit.count({
        where: {
          companyId,
          userId: seller.id,
          status: 'COMPLETED',
        },
      });

      const plannedVisits = await this.prisma.clientVisit.count({
        where: {
          companyId,
          userId: seller.id,
        },
      });

      const pct = targetGoal > 0 ? Math.round((completedVisits / targetGoal) * 100) : 0;
      let statusColor: 'GREEN' | 'YELLOW' | 'RED' = 'RED';
      if (pct >= 100) statusColor = 'GREEN';
      else if (pct >= 50) statusColor = 'YELLOW';

      result.push({
        sellerId: seller.id,
        fullName: seller.fullName,
        email: seller.email,
        goal: targetGoal,
        completedVisits,
        plannedVisits,
        progressPct: pct,
        statusColor,
      });
    }

    return { year: y, weekNumber: w, sellers: result };
  }

  async setGoal(companyId: number, userId: number, year: number, weekNumber: number, weeklyVisitGoal: number) {
    if (!companyId) throw new BadRequestException('Empresa requerida');
    return this.prisma.salesGoal.upsert({
      where: { companyId_userId_year_weekNumber: { companyId, userId, year, weekNumber } },
      create: { companyId, userId, year, weekNumber, weeklyVisitGoal },
      update: { weeklyVisitGoal },
    });
  }

  // ==================== VISITAS EN CAMPO ====================
  async getVisits(companyId: number, filters?: { userId?: number; status?: string; startDate?: string; endDate?: string }) {
    const where: any = { companyId };
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.status) where.status = filters.status;
    if (filters?.startDate || filters?.endDate) {
      where.visitDate = {};
      if (filters.startDate) where.visitDate.gte = new Date(`${filters.startDate}T00:00:00.000Z`);
      if (filters.endDate) where.visitDate.lte = new Date(`${filters.endDate}T23:59:59.999Z`);
    }

    return this.prisma.clientVisit.findMany({
      where,
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { visitDate: 'desc' },
    });
  }

  async createVisit(companyId: number, userId: number, data: { clientName: string; clientAddress?: string; clientPhone?: string; visitDate: string; notes?: string }) {
    return this.prisma.clientVisit.create({
      data: {
        clientName: data.clientName.trim(),
        clientAddress: data.clientAddress?.trim() || null,
        clientPhone: data.clientPhone?.trim() || null,
        visitDate: new Date(data.visitDate),
        notes: data.notes?.trim() || null,
        status: 'PLANNED',
        companyId,
        userId,
      },
    });
  }

  async checkInVisit(id: number, companyId: number, userId: number, lat?: number, lng?: number) {
    const visit = await this.prisma.clientVisit.findFirst({ where: { id, companyId } });
    if (!visit) throw new NotFoundException('Visita no encontrada');

    return this.prisma.clientVisit.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        checkInTime: new Date(),
        checkInLat: lat || null,
        checkInLng: lng || null,
        isVerified: true,
      },
    });
  }

  async completeVisit(
    id: number,
    companyId: number,
    userId: number,
    data: { commercialOffer?: string; quotedAmount?: number; outcome?: any; notes?: string },
  ) {
    const visit = await this.prisma.clientVisit.findFirst({ where: { id, companyId } });
    if (!visit) throw new NotFoundException('Visita no encontrada');

    return this.prisma.clientVisit.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        commercialOffer: data.commercialOffer?.trim() || null,
        quotedAmount: data.quotedAmount || 0,
        outcome: data.outcome || 'FOLLOW_UP',
        notes: data.notes?.trim() || visit.notes,
      },
    });
  }

  async cancelVisit(id: number, companyId: number, notes?: string) {
    const visit = await this.prisma.clientVisit.findFirst({ where: { id, companyId } });
    if (!visit) throw new NotFoundException('Visita no encontrada');

    return this.prisma.clientVisit.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        notes: notes ? `${visit.notes || ''}\nCancelado: ${notes}` : visit.notes,
      },
    });
  }

  async deleteVisit(id: number, companyId: number) {
    const visit = await this.prisma.clientVisit.findFirst({ where: { id, companyId } });
    if (!visit) throw new NotFoundException('Visita no encontrada');
    return this.prisma.clientVisit.delete({ where: { id } });
  }

  // ==================== CRM LEADS ====================
  async getLeads(companyId: number, filters?: { assignedUserId?: number; status?: string; source?: string }) {
    const where: any = { companyId };
    if (filters?.assignedUserId) where.assignedUserId = filters.assignedUserId;
    if (filters?.status) where.status = filters.status;
    if (filters?.source) where.source = filters.source;

    return this.prisma.lead.findMany({
      where,
      include: { assignedUser: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createLead(companyId: number, data: { fullName: string; email?: string; phone?: string; companyName?: string; source?: any; campaignName?: string; estimatedValue?: number; notes?: string; assignedUserId?: number }) {
    let assignedUserId = data.assignedUserId;

    // If no specific seller assigned, perform Round-Robin
    if (!assignedUserId) {
      assignedUserId = await this.getNextRoundRobinSeller(companyId);
    }

    return this.prisma.lead.create({
      data: {
        fullName: data.fullName.trim(),
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        companyName: data.companyName?.trim() || null,
        source: data.source || 'MANUAL',
        campaignName: data.campaignName?.trim() || null,
        estimatedValue: data.estimatedValue || 0,
        notes: data.notes?.trim() || null,
        assignedUserId,
        companyId,
      },
    });
  }

  async ingestLeadFromWebhook(apiKeyStr: string, data: { fullName: string; email?: string; phone?: string; companyName?: string; source?: string; campaignName?: string; estimatedValue?: number; notes?: string }) {
    const key = await this.prisma.salesApiKey.findUnique({ where: { apiKey: apiKeyStr } });
    if (!key || !key.isActive) {
      throw new UnauthorizedException('API Key inválida o inactiva');
    }

    const companyId = key.companyId;
    const assignedUserId = await this.getNextRoundRobinSeller(companyId);

    const sourceMap: Record<string, any> = {
      google: 'GOOGLE_ADS',
      google_ads: 'GOOGLE_ADS',
      web: 'WEB_FORM',
      web_form: 'WEB_FORM',
      email: 'EMAIL',
    };

    const normSource = sourceMap[data.source?.toLowerCase() || ''] || 'WEB_FORM';

    return this.prisma.lead.create({
      data: {
        fullName: data.fullName.trim(),
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        companyName: data.companyName?.trim() || null,
        source: normSource,
        campaignName: data.campaignName?.trim() || 'Campaña Digital',
        estimatedValue: data.estimatedValue || 0,
        notes: data.notes?.trim() || null,
        assignedUserId,
        companyId,
      },
    });
  }

  async assignLead(id: number, companyId: number, assignedUserId: number) {
    const lead = await this.prisma.lead.findFirst({ where: { id, companyId } });
    if (!lead) throw new NotFoundException('Lead no encontrado');

    return this.prisma.lead.update({
      where: { id },
      data: { assignedUserId },
    });
  }

  async updateLeadStatus(id: number, companyId: number, status: any, closedValue?: number) {
    const lead = await this.prisma.lead.findFirst({ where: { id, companyId } });
    if (!lead) throw new NotFoundException('Lead no encontrado');

    const updateData: any = { status };
    if (status === 'WON' && closedValue !== undefined) {
      updateData.closedValue = closedValue;
    }

    return this.prisma.lead.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteLead(id: number, companyId: number) {
    const lead = await this.prisma.lead.findFirst({ where: { id, companyId } });
    if (!lead) throw new NotFoundException('Lead no encontrado');
    return this.prisma.lead.delete({ where: { id } });
  }

  private async getNextRoundRobinSeller(companyId: number): Promise<number | undefined> {
    const sellers = await this.prisma.user.findMany({
      where: { companyId, isActive: true },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    if (sellers.length === 0) return undefined;

    // Get last created lead for this company
    const lastLead = await this.prisma.lead.findFirst({
      where: { companyId, assignedUserId: { not: null } },
      orderBy: { id: 'desc' },
      select: { assignedUserId: true },
    });

    if (!lastLead || !lastLead.assignedUserId) {
      return sellers[0].id;
    }

    const currentIndex = sellers.findIndex((s) => s.id === lastLead.assignedUserId);
    const nextIndex = (currentIndex + 1) % sellers.length;
    return sellers[nextIndex].id;
  }

  // ==================== DASHBOARD & MÉTRICAS $MD ====================
  async getDashboardMetrics(companyId: number, year?: number, weekNumber?: number) {
    const goalsData = await this.getGoals(companyId, year, weekNumber);

    // Marketing Return $MD: Sum of closedValue for leads with source != MANUAL and status = WON
    const digitalWonLeads = await this.prisma.lead.aggregate({
      where: {
        companyId,
        status: 'WON',
        source: { in: ['GOOGLE_ADS', 'WEB_FORM', 'EMAIL'] },
      },
      _sum: { closedValue: true },
      _count: { id: true },
    });

    const totalWonLeads = await this.prisma.lead.aggregate({
      where: {
        companyId,
        status: 'WON',
      },
      _sum: { closedValue: true },
      _count: { id: true },
    });

    // Funnel count
    const leadStages = ['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'WON', 'LOST'];
    const funnel: Record<string, number> = {};
    for (const stage of leadStages) {
      funnel[stage] = await this.prisma.lead.count({
        where: { companyId, status: stage as any },
      });
    }

    return {
      goals: goalsData,
      marketingReturnMD: digitalWonLeads._sum.closedValue || 0,
      digitalWonCount: digitalWonLeads._count.id || 0,
      totalWonValue: totalWonLeads._sum.closedValue || 0,
      totalWonCount: totalWonLeads._count.id || 0,
      funnel,
    };
  }

  // ==================== API KEYS ====================
  async getApiKeys(companyId: number) {
    return this.prisma.salesApiKey.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createApiKey(companyId: number, name: string) {
    const rawKey = `sk_ventas_${Math.random().toString(36).substring(2)}${Date.now()}`;
    return this.prisma.salesApiKey.create({
      data: {
        name: name.trim(),
        apiKey: rawKey,
        companyId,
      },
    });
  }

  async deleteApiKey(id: number, companyId: number) {
    const key = await this.prisma.salesApiKey.findFirst({ where: { id, companyId } });
    if (!key) throw new NotFoundException('API Key no encontrada');
    return this.prisma.salesApiKey.delete({ where: { id } });
  }
}
