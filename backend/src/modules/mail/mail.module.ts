import { Module } from '@nestjs/common';
import { GmailMailService } from './gmail-mail.service';

/**
 * Envío de correo, en su propio módulo para que lo puedan usar tanto RRHH
 * (recordatorios de cumplimiento a guardias) como Auth (código de recuperación
 * de contraseña) sin que uno dependa del otro.
 *
 * Usa UNA sola cuenta de servicio para todo el correo del sistema: la que
 * tiene la delegación de dominio autorizada en Google Workspace. Ver
 * GmailMailService.loadServiceAccountKey.
 */
@Module({
  providers: [GmailMailService],
  exports: [GmailMailService],
})
export class MailModule {}
