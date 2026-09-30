import { IsString } from 'class-validator';

export class UpdateKnowledgeBaseDto {
  @IsString()
  content: string;
}
