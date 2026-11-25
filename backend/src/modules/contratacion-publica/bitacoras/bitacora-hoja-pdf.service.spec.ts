import { BitacoraHojaPdfService } from './bitacora-hoja-pdf.service';

const base = {
  entidadNombre: 'Hospital de Ejemplo',
  contratoNumero: 'CTR-1',
  puestoNombre: 'Garita norte',
};

const paginas = (pdf: Buffer) => {
  const t = pdf.toString('latin1');
  return (t.match(/\/Type \/Page(?!s)/g) ?? []).length;
};

describe('BitacoraHojaPdfService', () => {
  const servicio = new BitacoraHojaPdfService();

  it('genera un PDF para contratos públicos, con la dotación inicial del puesto', async () => {
    const pdf = await servicio.generar({
      ...base,
      tipo: 'PUBLICA',
      dotacionBase: [
        { ambito: 'GEMESEG', articulo: 'Radios', cantidad: 2 },
        { ambito: 'CLIENTE', articulo: 'Tachos de basura', cantidad: null },
      ],
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
    expect(paginas(pdf)).toBe(1);
  });

  it('genera un PDF estándar sin dotación', async () => {
    const pdf = await servicio.generar({ ...base, tipo: 'ESTANDAR', dotacionBase: [] });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(pdf)).toBe(1);
  });

  it('aguanta una dotación larga y nombres largos sin romperse', async () => {
    const muchas = Array.from({ length: 40 }, (_, i) => ({
      ambito: i % 3 === 0 ? 'CLIENTE' : 'GEMESEG',
      articulo: `Artículo con un nombre bastante largo para probar el recorte número ${i}`,
      cantidad: i,
    }));
    const pdf = await servicio.generar({ ...base, puestoNombre: 'P'.repeat(200), tipo: 'PUBLICA', dotacionBase: muchas });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    // Siempre una sola hoja, aunque la dotación sea larga.
    expect(paginas(pdf)).toBe(1);
  });
});
