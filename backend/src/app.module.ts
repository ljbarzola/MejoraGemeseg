import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AiModule } from './modules/ai/ai.module';
import { QueueModule } from './modules/queue/queue.module';

@Module({
  imports: [AuthModule, UsersModule, ProjectsModule, TasksModule, AiModule, QueueModule],
})
export class AppModule {}
