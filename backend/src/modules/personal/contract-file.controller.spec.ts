import * as fs from 'fs';
import { ContractFileController } from './contract-file.controller';
import { ContractService } from './services/contract.service';

jest.mock('fs');

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
  let contractService: { getContractFilePath: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    contractService = { getContractFilePath: jest.fn((name: string) => `/uploads/hr-contracts/${name}`) };
    controller = new ContractFileController(contractService as unknown as ContractService);
  });

  it('serves a well-formed PDF filename that exists on disk', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    const res = makeResponse();

    controller.serveFile('0912345678_1699999999999.pdf', res);

    expect(contractService.getContractFilePath).toHaveBeenCalledWith('0912345678_1699999999999.pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.sendFile).toHaveBeenCalledWith('/uploads/hr-contracts/0912345678_1699999999999.pdf');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 404 without touching the filesystem when the name has path-traversal characters', () => {
    const res = makeResponse();

    controller.serveFile('../../../../etc/passwd', res);

    expect(contractService.getContractFilePath).not.toHaveBeenCalled();
    expect(fs.existsSync).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it('rejects an encoded traversal payload decoded by the router into the param', () => {
    const res = makeResponse();

    controller.serveFile('..%2f..%2f..%2fetc%2fpasswd'.replace(/%2f/gi, '/'), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it('rejects a non-.pdf extension', () => {
    const res = makeResponse();

    controller.serveFile('report.docx', res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 when the sanitized filename does not exist on disk', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    const res = makeResponse();

    controller.serveFile('0912345678_123.pdf', res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.sendFile).not.toHaveBeenCalled();
  });
});
