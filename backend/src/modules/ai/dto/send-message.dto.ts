import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class SendMessageDto {
  @IsNumber()
  @IsOptional()
  conversationId?: number;

  @IsNumber()
  @IsOptional()
  agentId?: number;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsNotEmpty()
  context: string;

  // Solo Agente de Ventas: empresa o persona del Directorio de la que se habla (botón
  // «Preguntar al agente» de su ficha). Con él, el expediente de ese cliente ya llega al modelo
  // sin que tenga que buscarlo por nombre.
  @IsNumber()
  @IsOptional()
  clienteId?: number;
}
