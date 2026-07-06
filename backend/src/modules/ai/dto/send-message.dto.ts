import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class SendMessageDto {
  @IsNumber()
  @IsOptional()
  conversationId?: number;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsNotEmpty()
  context: string;
}
