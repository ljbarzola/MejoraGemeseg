import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import {
  CustodiasCampoAuthService,
  type CelularAutenticado,
  type SesionAutenticada,
} from './custodias-campo-auth.service';
import { tokenCelularDeCabecera, tokenSesionDeCabecera } from './custodias-campo-seguridad.util';

/** Lo que las rutas de campo leen de la petición (los guards lo dejan puesto). */
export interface PeticionCampo {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  celular?: CelularAutenticado;
  sesion?: SesionAutenticada;
}

/**
 * Identifica al celular de la empresa por su token (`Authorization: Bearer cd_...`). No es una sesión de
 * app.gemeseg: solo sirve para las rutas de campo y se puede revocar en cualquier momento.
 */
@Injectable()
export class CampoDispositivoGuard implements CanActivate {
  constructor(private readonly auth: CustodiasCampoAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PeticionCampo>();
    const token = tokenCelularDeCabecera(req.headers['authorization']);
    const celular = token ? await this.auth.autenticarCelular(token) : null;
    if (!celular) throw this.auth.mensajeCelularInvalido();
    req.celular = celular;
    return true;
  }
}

/**
 * La persona que entró en ese celular (`X-Sesion-Custodio: cs_...`). Va DESPUÉS de CampoDispositivoGuard: la sesión
 * solo vale en el celular donde se abrió y sobre el viaje asignado a él.
 */
@Injectable()
export class CampoSesionGuard implements CanActivate {
  constructor(private readonly auth: CustodiasCampoAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PeticionCampo>();
    if (!req.celular) throw this.auth.mensajeCelularInvalido();
    const token = tokenSesionDeCabecera(req.headers['x-sesion-custodio']);
    const sesion = token ? await this.auth.autenticarSesion(req.celular, token) : null;
    if (!sesion) throw this.auth.mensajeSesionInvalida();
    req.sesion = sesion;
    return true;
  }
}
