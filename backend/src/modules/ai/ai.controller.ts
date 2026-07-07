import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AiService } from './ai.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('chat')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('message')
  @UseGuards(AuthGuard('jwt'))
  sendMessage(@Body() dto: SendMessageDto, @Req() req: any) {
    return this.aiService.sendMessage(dto, req.user.userId);
  }

  @Get('conversations')
  @UseGuards(AuthGuard('jwt'))
  getConversations(@Req() req: any, @Query('agentId') agentId?: string) {
    return this.aiService.getConversationsByAgent(
      req.user.userId,
      agentId ? Number(agentId) : undefined,
    );
  }
}
