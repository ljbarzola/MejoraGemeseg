import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

const NAVY = '#100F31';
const GOLD = '#EE3B1B';

function formatFechaEC(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
}

/**
 * Cuerpo por defecto cuando la plantilla no trae texto propio. No pretende ser
 * asesoria legal: es el esqueleto que RRHH venia llenando a mano y que puede
 * sustituirse editando `content` en la plantilla.
 */
const CUERPO_BASE = `En la ciudad de {{CIUDAD}}, a {{FECHA}}, comparecen por una parte {{EMPRESA}}, en calidad de EMPLEADOR, y por otra parte {{NOMBRE}}, portador de la cédula de ciudadanía No. {{CEDULA}}, en calidad de TRABAJADOR, quienes libre y voluntariamente acuerdan celebrar el presente contrato de trabajo bajo la modalidad de {{TIPO_CONTRATO}}, al tenor de las siguientes cláusulas:

PRIMERA — OBJETO: El TRABAJADOR se compromete a prestar sus servicios lícitos y personales en el cargo de {{CARGO}}, cumpliendo las funciones inherentes a dicho puesto y las que le sean asignadas por el EMPLEADOR.

SEGUNDA — REMUNERACIÓN: El EMPLEADOR pagará al TRABAJADOR la remuneración acordada conforme a la escala salarial vigente y a las disposiciones del Código del Trabajo del Ecuador, más los beneficios de ley.

TERCERA — JORNADA: El TRABAJADOR cumplirá la jornada legal de trabajo establecida por el Código del Trabajo, sujetándose a los horarios y turnos que el EMPLEADOR determine según las necesidades operativas del servicio de seguridad.

CUARTA — OBLIGACIONES: El TRABAJADOR se obliga a guardar absoluta reserva sobre la información de los clientes y operaciones del EMPLEADOR, a portar y conservar en buen estado el uniforme y equipo entregado, y a cumplir los reglamentos internos y las normas de seguridad.

QUINTA — AFILIACIÓN: El EMPLEADOR afiliará al TRABAJADOR al Instituto Ecuatoriano de Seguridad Social (IESS) desde el primer día de labores, conforme a la ley.

SEXTA — TERMINACIÓN: El presente contrato podrá darse por terminado por cualquiera de las causales previstas en el Código del Trabajo.

Para constancia de lo acordado, las partes firman el presente documento en dos ejemplares de igual tenor y valor.`;

@Injectable()
export class ContractPdfService {
  /**
   * Sustituye las variables {{CLAVE}} del cuerpo de la plantilla con los datos del
   * candidato. Las claves sin valor se dejan como raya para que sea evidente en el
   * papel que ese dato falta, en lugar de imprimir "undefined".
   */
  fillTemplate(body: string, variables: Record<string, string>): string {
    return body.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
      const value = variables[key];
      return value !== undefined && value !== null && String(value).trim() !== '' ? String(value) : '—';
    });
  }

  /** Variables disponibles para las plantillas de contrato. */
  buildVariables(contract: any): Record<string, string> {
    const candidate = contract.candidate || {};
    return {
      NOMBRE: candidate.fullName || '',
      CEDULA: candidate.cedula || '',
      CARGO: candidate.positionApplied || '',
      TELEFONO: candidate.phone || '',
      EMAIL: candidate.email || '',
      EMPRESA: contract.company?.name || 'GEMESEG',
      CIUDAD: 'Guayaquil',
      FECHA: formatFechaEC(contract.createdAt || new Date()),
      TIPO_CONTRATO: (contract.template?.type || '').replace(/_/g, ' '),
      PLANTILLA: contract.template?.name || '',
      CONTRATO_ID: String(contract.id ?? ''),
    };
  }

  private encabezado(doc: any, titulo: string, subtitulo?: string) {
    doc.fillColor(NAVY).fontSize(18).font('Helvetica-Bold').text('GEMESEG', { align: 'center' });
    doc.fillColor('#4a5568').fontSize(11).font('Helvetica').text(titulo, { align: 'center' });
    if (subtitulo) {
      doc.fillColor('#718096').fontSize(9).text(subtitulo, { align: 'center' });
    }
    doc.moveDown(0.3);
    doc.strokeColor(GOLD).lineWidth(2).moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).stroke();
    doc.moveDown(0.8);
  }

  private bloqueFirmas(doc: any, izquierda: string, derecha: string) {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.moveDown(3);
    const y = doc.y;
    const colW = (doc.page.width - 80) / 2;
    [izquierda, derecha].forEach((etiqueta, i) => {
      const x = 40 + i * colW;
      doc.moveTo(x + 20, y).lineTo(x + colW - 20, y).strokeColor('#94a3b8').lineWidth(1).stroke();
      doc.fontSize(8).fillColor('#4a5568').text(etiqueta, x, y + 6, { width: colW, align: 'center' });
      doc.fontSize(7).fillColor('#718096').text('Nombre, firma y cédula', x, y + 18, { width: colW, align: 'center' });
    });
  }

  private render(build: (doc: any) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new (PDFDocument as any)({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      build(doc);
      doc.end();
    });
  }

  async generarPdfContrato(contract: any): Promise<Buffer> {
    const variables = this.buildVariables(contract);
    const cuerpo = this.fillTemplate(contract.template?.content?.trim() || CUERPO_BASE, variables);

    return this.render((doc) => {
      this.encabezado(doc, 'Contrato de Trabajo', variables.TIPO_CONTRATO || undefined);

      doc.fillColor('#2d3748').fontSize(9).font('Helvetica');
      const ficha: [string, string][] = [
        ['Trabajador', variables.NOMBRE],
        ['Cédula', variables.CEDULA],
        ['Cargo', variables.CARGO],
        ['Plantilla', variables.PLANTILLA],
        ['Contrato N°', variables.CONTRATO_ID],
        ['Fecha', variables.FECHA],
      ];
      for (const [label, valor] of ficha) {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(valor || '—');
      }

      doc.moveDown(1);
      doc.fontSize(10).font('Helvetica').fillColor('#1a202c').text(cuerpo, { align: 'justify', lineGap: 2 });

      this.bloqueFirmas(doc, 'EL EMPLEADOR', 'EL TRABAJADOR');
    });
  }

  /**
   * Acta de entrega de uniformes y equipo. Se emite en blanco para que el
   * responsable anote cantidades y observaciones al momento de la entrega.
   */
  async generarPdfActaUniformes(contract: any, items: string[]): Promise<Buffer> {
    const variables = this.buildVariables(contract);

    return this.render((doc) => {
      this.encabezado(doc, 'Acta de Entrega de Uniformes y Equipo');

      doc.fillColor('#2d3748').fontSize(9).font('Helvetica');
      for (const [label, valor] of [
        ['Trabajador', variables.NOMBRE],
        ['Cédula', variables.CEDULA],
        ['Cargo', variables.CARGO],
        ['Fecha de entrega', variables.FECHA],
      ] as [string, string][]) {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(valor || '—');
      }

      doc.moveDown(0.8);
      doc.fontSize(9).font('Helvetica').fillColor('#1a202c').text(
        `Por medio de la presente, ${variables.NOMBRE} declara haber recibido de ${variables.EMPRESA} los siguientes artículos en buen estado, comprometiéndose a conservarlos y a devolverlos al término de la relación laboral:`,
        { align: 'justify', lineGap: 2 },
      );
      doc.moveDown(0.8);

      // Tabla de entrega
      const startX = 50;
      const widths = [30, 250, 60, 135];
      const headers = ['#', 'Artículo', 'Cantidad', 'Observación'];
      let y = doc.y;

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
      doc.rect(startX, y, widths.reduce((a, b) => a + b, 0), 18).fill(NAVY);
      let x = startX;
      headers.forEach((h, i) => {
        doc.fillColor('#ffffff').text(h, x + 4, y + 5, { width: widths[i] - 8 });
        x += widths[i];
      });
      y += 18;

      doc.font('Helvetica').fontSize(8);
      items.forEach((item, idx) => {
        if (y > doc.page.height - 160) {
          doc.addPage();
          y = 50;
        }
        const rowH = 20;
        doc.rect(startX, y, widths.reduce((a, b) => a + b, 0), rowH)
          .fillAndStroke(idx % 2 === 0 ? '#f7fafc' : '#ffffff', '#e2e8f0');
        x = startX;
        [String(idx + 1), item, '', ''].forEach((celda, i) => {
          doc.fillColor('#2d3748').text(celda, x + 4, y + 6, { width: widths[i] - 8 });
          x += widths[i];
        });
        y += rowH;
      });

      doc.y = y + 10;
      doc.fontSize(8).fillColor('#718096').text(
        'La firma de esta acta no sustituye el descargo contable del equipo entregado.',
        { align: 'left' },
      );

      this.bloqueFirmas(doc, 'ENTREGA (GEMESEG)', 'RECIBE (TRABAJADOR)');
    });
  }
}
