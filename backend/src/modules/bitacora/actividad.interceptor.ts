import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { ACCION_POR_METODO } from './bitacora-registro.util';
import { BitacoraService, PeticionAutenticada } from './bitacora.service';

/**
 * Anota, para toda la API, cada acción que cambia algo y que termina bien
 * (crear, editar, eliminar). Va después de los guards, así que `req.user` ya
 * existe; las lecturas (GET) no se anotan. Se espera a que el registro termine
 * antes de responder porque en Cloud Run el servidor puede quedar sin CPU al
 * enviar la respuesta; si el registro falla, la petición sigue igual
 * (BitacoraService.registrarAccion no lanza).
 */
@Injectable()
export class ActividadInterceptor implements NestInterceptor {
  constructor(private readonly bitacora: BitacoraService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<PeticionAutenticada>();
    if (!ACCION_POR_METODO[req.method]) return next.handle();
    return next.handle().pipe(
      mergeMap(async (respuesta: unknown) => {
        await this.bitacora.registrarAccion(req, respuesta);
        return respuesta;
      }),
    );
  }
}
