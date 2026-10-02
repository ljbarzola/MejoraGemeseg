import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CompaniesService } from './companies.service';

/**
 * Sirve los logos guardados por CompaniesService.uploadLogo. Es público a
 * propósito: la pantalla de inicio de sesión muestra el logo de la empresa
 * antes de que exista una sesión (igual que GET /companies/slug/:slug).
 */
@Controller('uploads/logos')
export class CompanyLogosController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get(':fileName')
  async getLogo(@Param('fileName') fileName: string, @Res() res: Response) {
    const { data, contentType } =
      await this.companiesService.getStoredLogo(fileName);
    res.set({
      'Content-Type': contentType,
      // El nombre cambia con cada logo nuevo, así que se puede cachear.
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      // Un SVG subido por un admin no debe poder ejecutar scripts si alguien
      // abre la URL directamente.
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
    res.send(data);
  }
}
