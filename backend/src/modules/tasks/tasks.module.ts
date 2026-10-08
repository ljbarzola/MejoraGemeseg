import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TaskRemindersService } from './task-reminders.service';
import { TaskRemindersCronController } from './task-reminders-cron.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, AuthModule, MailModule, NotificationsModule],
  controllers: [TasksController, TaskRemindersCronController],
  providers: [TasksService, TaskRemindersService],
  exports: [TasksService],
})
export class TasksModule {}
