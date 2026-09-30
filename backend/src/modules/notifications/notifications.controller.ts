import {
  Controller,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';

// Bandeja personal: solo AuthGuard, sin SectionPermissionGuard — cada usuario
// ve y marca únicamente sus propias notificaciones, no depende de permisos
// de sección de ningún módulo.
@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  findAll(@Req() req: any) {
    return this.service.listForUser(req.user.userId);
  }

  @Get('unread-count')
  unreadCount(@Req() req: any) {
    return this.service.unreadCount(req.user.userId);
  }

  @Patch(':id/read')
  markRead(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.service.markRead(id, req.user.userId);
  }

  @Patch('read-all')
  markAllRead(@Req() req: any) {
    return this.service.markAllRead(req.user.userId);
  }
}
