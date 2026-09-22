import { ContractFileController } from './contract-file.controller';
import { ContractService } from './services/contract.service';

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    sendFile: jest.fn(),
  } as any;
}

describe('ContractFileController.serveFile', () => {
  let controller: ContractFileController;
  let contractService: { ensureContractFile: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    // ensureContractFile resuelve la ruta y, si el PDF ya no está en disco
    // (instancia de Cloud Run reciclada), lo regenera; devuelve null solo
    // cuando ese archivo no corresponde a ningún contrato.
    contractService = {
      ensureContractFile: jest.fn(
        (name: string) => `/uploads/hr-contracts/${name}`,
      ),
    };
    controller = new ContractFileController(
      contractService as unknown as ContractService,
    );
  });

  it('serves a well-formed PDF filename', async () => {
    const res = makeResponse();

    await controller.serveFile('0912345678_1699999999999.pdf', res);

    expect(contractService.ensureContractFile).toHaveBeenCalledWith(
      '0912345678_1699999999999.pdf',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(res.sendFile).toHaveBeenCalledWith(
      '/uploads/hr-contracts/0912345678_1699999999999.pdf',
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 404 without touching the service when the name has path-traversal characters', async () => {
    const res = makeResponse();

    await controller.serveFile('../../../../etc/passwd', res);

    expect(contractService.ensureContractFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it('rejects an encoded traversal payload decoded by the router into the param', async () => {
    const res = makeResponse();

    await controller.serveFile(
      '..%2f..%2f..%2fetc%2fpasswd'.replace(/%2f/gi, '/'),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it('rejects a non-.pdf extension', async () => {
    const res = makeResponse();

    await controller.serveFile('report.docx', res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 when the file cannot be recovered nor regenerated', async () => {
    contractService.ensureContractFile.mockResolvedValue(null);
    const res = makeResponse();

    await controller.serveFile('0912345678_123.pdf', res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.sendFile).not.toHaveBeenCalled();
  });
});
