import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiProcessor } from './ai.processor';

@Module({
  providers: [AiService, AiProcessor],
  exports: [AiService],
})
export class AiModule {}
