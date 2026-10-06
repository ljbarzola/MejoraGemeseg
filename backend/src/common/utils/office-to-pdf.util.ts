import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Formatos de Office que se pueden convertir a PDF para mostrarlos en pantalla. */
export const EXTENSIONES_OFFICE = ['.doc', '.docx', '.xls', '.xlsx'] as const;

/** La extensión de Office de un nombre de archivo (en minúscula), o null si no es de Office. */
export function extensionOffice(nombre: string): string | null {
  const ext = path.extname(nombre || '').toLowerCase();
  return (EXTENSIONES_OFFICE as readonly string[]).includes(ext) ? ext : null;
}

// LibreOffice pesa bastante: se convierte de a un archivo por vez en esta
// instancia para que varias vistas previas a la vez no saturen la memoria.
let cola: Promise<unknown> = Promise.resolve();

// Perfil de LibreOffice COMPARTIDO entre conversiones. Crear un perfil nuevo en
// cada llamada es lo que más tarda (~8 s: arranque en frío) y es donde LibreOffice
// se cae a veces en Windows (código 0xC0000409). Como las conversiones van en
// fila, nunca dos procesos usan el perfil a la vez. Si una falla, se borra el
// perfil (puede haber quedado corrupto o bloqueado) y se reintenta una vez.
const PERFIL = path.join(os.tmpdir(), 'gemeseg-soffice-perfil');

/**
 * Convierte un archivo de Word o Excel a PDF con LibreOffice (headless).
 * Usa un directorio temporal por llamada para el archivo y lo borra al terminar.
 * Lanza un error si LibreOffice no está instalado o no genera el PDF.
 */
export function convertirOfficeAPdf(buffer: Buffer, extension: string): Promise<Buffer> {
  const trabajo = cola.then(() => convertirConReintento(buffer, extension));
  cola = trabajo.catch(() => undefined);
  return trabajo;
}

async function convertirConReintento(buffer: Buffer, extension: string): Promise<Buffer> {
  try {
    return await convertir(buffer, extension);
  } catch {
    fs.rmSync(PERFIL, { recursive: true, force: true });
    return convertir(buffer, extension);
  }
}

async function convertir(buffer: Buffer, extension: string): Promise<Buffer> {
  const soffice = process.env.LIBREOFFICE_PATH || 'soffice';
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-pdf-'));
  const entrada = path.join(workDir, `input${extension}`);
  fs.writeFileSync(entrada, buffer);

  try {
    try {
      await execFileAsync(
        soffice,
        [
          '--headless',
          '--norestore',
          `-env:UserInstallation=file:///${PERFIL.replace(/\\/g, '/')}`,
          '--convert-to',
          'pdf',
          '--outdir',
          workDir,
          entrada,
        ],
        { timeout: 60000 },
      );
    } catch (err) {
      // El mensaje por defecto solo dice "Command failed": sin la salida de
      // LibreOffice no hay forma de saber por qué falló.
      const e = err as { code?: unknown; killed?: boolean; stderr?: string; stdout?: string };
      const salida = `${e.stderr ?? ''} ${e.stdout ?? ''}`.trim().slice(0, 500);
      throw new Error(
        `LibreOffice falló (código ${String(e.code)}${e.killed ? ', tiempo agotado' : ''}): ${salida || 'sin salida'}`,
      );
    }
    const pdf = path.join(workDir, 'input.pdf');
    if (!fs.existsSync(pdf)) {
      throw new Error('LibreOffice no generó el PDF esperado');
    }
    return fs.readFileSync(pdf);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
