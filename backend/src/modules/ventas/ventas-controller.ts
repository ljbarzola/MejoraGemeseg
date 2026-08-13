import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VentasService } from './ventas.service';

@Controller('ventas')
@UseGuards(AuthGuard('jwt'))
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  // ==================== METAS Y SEMÁFORO ====================
  @Get('goals')
  getGoals(@Req() req: any, @Query('year') year?: string, @Query('week') week?: string) {
    return this.ventasService.getGoals(req.user.companyId, year ? +year : undefined, week ? +week : undefined);
  }

  @Post('goals')
  setGoal(
    @Req() req: any,
    @Body() body: { userId: number; year: number; weekNumber: number; weeklyVisitGoal: number },
  ) {
    return this.ventasService.setGoal(req.user.companyId, body.userId, body.year, body.weekNumber, body.weeklyVisitGoal);
  }

  // ==================== VISITAS ====================
  @Get('visits')
  getVisits(
    @Req() req: any,
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.ventasService.getVisits(req.user.companyId, {
      userId: userId ? +userId : undefined,
      status,
      startDate,
      endDate,
    });
  }

  @Post('visits')
  createVisit(
    @Req() req: any,
    @Body() body: { clientName: string; clientAddress?: string; clientPhone?: string; visitDate: string; notes?: string },
  ) {
    return this.ventasService.createVisit(req.user.companyId, req.user.userId, body);
  }

  @Post('visits/:id/checkin')
  checkInVisit(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { lat?: number; lng?: number },
  ) {
    return this.ventasService.checkInVisit(+id, req.user.companyId, req.user.userId, body.lat, body.lng);
  }

  @Post('visits/:id/complete')
  completeVisit(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { commercialOffer?: string; quotedAmount?: number; outcome?: string; notes?: string },
  ) {
    return this.ventasService.completeVisit(+id, req.user.companyId, req.user.userId, body);
  }

  @Post('visits/:id/cancel')
  cancelVisit(@Param('id') id: string, @Req() req: any, @Body() body: { notes?: string }) {
    return this.ventasService.cancelVisit(+id, req.user.companyId, body.notes);
  }

  @Delete('visits/:id')
  deleteVisit(@Param('id') id: string, @Req() req: any) {
    return this.ventasService.deleteVisit(+id, req.user.companyId);
  }

  // ==================== CRM LEADS ====================
  @Get('leads')
  getLeads(
    @Req() req: any,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('status') status?: string,
    @Query('source') source?: string,
  ) {
    return this.ventasService.getLeads(req.user.companyId, {
      assignedUserId: assignedUserId ? +assignedUserId : undefined,
      status,
      source,
    });
  }

  @Post('leads')
  createLead(
    @Req() req: any,
    @Body() body: { fullName: string; email?: string; phone?: string; companyName?: string; source?: string; campaignName?: string; estimatedValue?: number; notes?: string; assignedUserId?: number },
  ) {
    return this.ventasService.createLead(req.user.companyId, body);
  }

  @Patch('leads/:id/assign')
  assignLead(@Param('id') id: string, @Req() req: any, @Body() body: { assignedUserId: number }) {
    return this.ventasService.assignLead(+id, req.user.companyId, body.assignedUserId);
  }

  @Patch('leads/:id/status')
  updateLeadStatus(@Param('id') id: string, @Req() req: any, @Body() body: { status: string; closedValue?: number }) {
    return this.ventasService.updateLeadStatus(+id, req.user.companyId, body.status, body.closedValue);
  }

  @Delete('leads/:id')
  deleteLead(@Param('id') id: string, @Req() req: any) {
    return this.ventasService.deleteLead(+id, req.user.companyId);
  }

  // ==================== DASHBOARD & MÉTRICAS ====================
  @Get('dashboard')
  getDashboardMetrics(@Req() req: any, @Query('year') year?: string, @Query('week') week?: string) {
    return this.ventasService.getDashboardMetrics(req.user.companyId, year ? +year : undefined, week ? +week : undefined);
  }

  // ==================== API KEYS ====================
  @Get('api-keys')
  getApiKeys(@Req() req: any) {
    return this.ventasService.getApiKeys(req.user.companyId);
  }

  @Post('api-keys')
  createApiKey(@Req() req: any, @Body() body: { name: string }) {
    return this.ventasService.createApiKey(req.user.companyId, body.name);
  }

  @Delete('api-keys/:id')
  deleteApiKey(@Param('id') id: string, @Req() req: any) {
    return this.ventasService.deleteApiKey(+id, req.user.companyId);
  }
}
