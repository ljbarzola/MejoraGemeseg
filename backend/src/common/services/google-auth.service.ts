import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

// Credenciales de la cuenta de servicio de Google, compartidas por cualquier
// módulo que necesite hablar con una API de Google vía OAuth2 (Vertex AI no
// acepta API keys, y esta organización de GCP tiene bloqueada por política la
// creación de claves nuevas de service account — ver drive.service.ts).
// Extraído de reclutamiento-ia.service.ts (antes cada consumidor de Vertex
// copiaba esta misma lógica) para que el path de búsqueda del archivo local y
// el fallback a la variable de entorno vivan en un solo lugar.
@Injectable()
export class GoogleAuthService {
  private loadCredentials(): any {
    const candidates = [
      path.join(process.cwd(), 'google-service-account.json'),
      path.join(__dirname, '..', '..', '..', '..', 'google-service-account.json'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return JSON.parse(fs.readFileSync(candidate, 'utf-8'));
      }
    }
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    }
    return null;
  }

  hasCredentials(): boolean {
    return !!this.loadCredentials();
  }

  async getAccessToken(
    scopes: string[] = ['https://www.googleapis.com/auth/cloud-platform'],
  ): Promise<string> {
    const credentials = this.loadCredentials();
    if (!credentials) {
      throw new Error(
        'No hay credenciales de Google disponibles (ni google-service-account.json ni GOOGLE_SERVICE_ACCOUNT_JSON).',
      );
    }
    const auth = new google.auth.GoogleAuth({ credentials, scopes });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    const value = typeof token === 'string' ? token : token?.token;
    if (!value) throw new Error('Google no devolvió un token de acceso.');
    return value;
  }
}
