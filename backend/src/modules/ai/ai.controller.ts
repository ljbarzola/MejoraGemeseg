import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
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
}
