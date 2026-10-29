import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BitacoraExtensionService,
  ExtensionAutenticada,
} from './bitacora-extension.service';
import { tokenDeCabecera } from './bitacora-extension.util';

export interface PeticionExtension {
  headers: Record<string, unknown>;
  extension?: ExtensionAutenticada;
}

/**
 * Identifica a la extensión del navegador por su token (`Authorization: Bearer
 * bx_...`). El token no es una sesión de app.gemeseg: solo sirve para estas
 * rutas y se puede revocar en cualquier momento.
 */
@Injectable()
export class ExtensionTokenGuard implements CanActivate {
  constructor(private readonly extension: BitacoraExtensionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PeticionExtension>();
    const token = tokenDeCabecera(req.headers['authorization']);
    const autenticada = token ? await this.extension.autenticar(token) : null;
    if (!autenticada) {
      throw new UnauthorizedException(
        'La extensión ya no está vinculada. Vincúlala de nuevo desde «Mi hoja del día».',
      );
    }
    req.extension = autenticada;
    return true;
  }
}
