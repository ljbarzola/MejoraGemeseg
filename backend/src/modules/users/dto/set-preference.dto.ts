import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

/**
 * Claves de preferencia que se aceptan: columnas de una tabla (`columnas:ventas-clientes`)
 * y avisos que la persona elige recibir (`notificaciones:recordatorios-tareas`).
 * Una lista cerrada de prefijos a propósito: la tabla no debe servir de cajón
 * para cualquier dato que alguien quiera guardar.
 */
export const PREFERENCE_KEY_PATTERN = /^(columnas|notificaciones):[a-z0-9-]{1,60}$/;

export class SetPreferenceDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  value: string[];
}
