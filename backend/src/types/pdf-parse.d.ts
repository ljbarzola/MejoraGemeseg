// `pdf-parse` (v1.x, la versión pura-JS sin dependencias nativas — no confundir
// con pdf-parse@2.x, que depende de @napi-rs/canvas, un binario nativo) no
// publica sus propios tipos ni existe un paquete @types/pdf-parse. Se declara
// aquí una forma mínima, suficiente para el uso que le da este backend
// (extracción de texto de un Buffer) — ver DocumentExtractionService.
declare module 'pdf-parse' {
  interface PDFParseInfo {
    PDFFormatVersion?: string;
    IsAcroFormPresent?: boolean;
    IsXFAPresent?: boolean;
    [key: string]: unknown;
  }

  interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: PDFParseInfo;
    metadata: unknown;
    text: string;
    version: string;
  }

  interface PDFParseOptions {
    pagerender?: (pageData: unknown) => string;
    max?: number;
    version?: string;
  }

  function pdfParse(
    dataBuffer: Buffer,
    options?: PDFParseOptions,
  ): Promise<PDFParseResult>;

  export = pdfParse;
}
