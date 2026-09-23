import { resumirExpediente } from './expediente-completitud.util';

describe('resumirExpediente', () => {
  const slots = [
    { nombre: 'Hoja de Vida', obligatorio: true, driveFileId: 'a' },
    { nombre: 'Cédula', obligatorio: true, driveFileId: 'b' },
    { nombre: 'Antecedentes', obligatorio: true, driveFileId: null },
    { nombre: 'Licencia', obligatorio: false, driveFileId: null },
    { nombre: 'Título', obligatorio: false, driveFileId: 'c' },
  ];

  it('cuenta archivos presentes sobre casilleros, no el total de archivos de la carpeta', () => {
    const resumen = resumirExpediente(slots, new Map());
    expect(resumen.archivosSubidosCount).toBe(3);
    expect(resumen.archivosRequeridosCount).toBe(5);
    expect(resumen.completitudPercent).toBe(0);
    expect(resumen.documentosPendientesRevision).toBe(3);
  });

  it('no llega a 100% si un obligatorio está rechazado o sin revisar', () => {
    const reviews = new Map<string, string>([
      ['a', 'APROBADO'],
      ['b', 'RECHAZADO'],
      ['c', 'APROBADO'],
    ]);
    const resumen = resumirExpediente(slots, reviews);
    expect(resumen.documentosRechazados).toBe(1);
    expect(resumen.completitudPercent).toBe(33);
  });

  it('llega a 100% solo cuando cada obligatorio está aprobado', () => {
    const completos = [
      { nombre: 'Hoja de Vida', obligatorio: true, driveFileId: 'a' },
      { nombre: 'Cédula', obligatorio: true, driveFileId: 'b' },
      { nombre: 'Licencia', obligatorio: false, driveFileId: null },
    ];
    const reviews = new Map<string, string>([
      ['a', 'APROBADO'],
      ['b', 'APROBADO'],
    ]);
    expect(resumirExpediente(completos, reviews).completitudPercent).toBe(100);
  });
});
