import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import { ContractService } from './services/contract.service';

// Sin @UseGuards: el PDF se abre directamente en el navegador (<a href>,
// impresión) que no puede adjuntar el header Authorization — mismo patrón
// que VentasContratosController.serveFile. El nombre de archivo incluye la
// cédula + timestamp, no es adivinable ni lista un directorio.
@Controller('personal/contracts')
export class ContractFileController {
  constructor(private readonly contractService: ContractService) {}

  @Get('file/:fileName')
  serveFile(@Param('fileName') fileName: string, @Res() res: Response) {
    // Ruta pública sin JWT: nunca confiar en fileName tal cual llega —
    // rechaza cualquier cosa que no sea "cedula_timestamp.pdf" (el formato
    // que genera ContractService.generateContract) antes de tocar el
    // filesystem, para que un "../../etc/passwd" codificado en la URL no
    // pueda escapar de CONTRACTS_DIR.
    if (!/^[A-Za-z0-9_-]+\.pdf$/.test(fileName)) {
      res.status(404).json({ message: 'Archivo no encontrado' });
      return;
    }

    const filePath = this.contractService.getContractFilePath(fileName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: 'Archivo no encontrado' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(filePath);
  }
}
