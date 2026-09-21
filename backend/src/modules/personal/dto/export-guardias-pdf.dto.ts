import { IsArray, ArrayNotEmpty } from 'class-validator';

// Las columnas/filas ya vienen armadas desde el frontend (misma estructura
// configurada en la vista de Guardias, ver GuardiasExportModal) — no se
// valida la forma interna de cada fila porque las claves son dinámicas
// (dependen de los campos personalizados que cada empresa haya configurado).
export class ExportGuardiasPdfDto {
  @IsArray()
  @ArrayNotEmpty()
  columns: { key: string; label: string }[];

  @IsArray()
  rows: Record<string, unknown>[];
}
