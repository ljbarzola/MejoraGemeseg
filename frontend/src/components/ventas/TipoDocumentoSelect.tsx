import { TIPOS_DOCUMENTO, TIPO_OTRO_MAX } from '../../utils/documentoTipos';

interface Props {
  tipo: string;
  tipoOtro: string;
  onChange: (tipo: string, tipoOtro: string) => void;
  autoFocus?: boolean;
}

// Lista de tipos de documento (Contrato, Garantía...) y, si elige «Otro», el campo para escribir
// cómo se llama. Lo usan «Subir documento» y «Cambiar tipo» del documento.
export default function TipoDocumentoSelect({ tipo, tipoOtro, onChange, autoFocus }: Props) {
  return (
    <>
      <select value={tipo} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value, tipoOtro)} aria-label="Tipo de documento">
        <option value="">Elige el tipo de documento...</option>
        {TIPOS_DOCUMENTO.map((t) => (
          <option key={t.key} value={t.key}>{t.label}</option>
        ))}
      </select>
      {tipo === 'OTRO' && (
        <input
          style={{ marginTop: 8 }}
          value={tipoOtro}
          onChange={(e) => onChange(tipo, e.target.value)}
          placeholder="¿Qué tipo de documento es? Ej.: Póliza de seguro"
          maxLength={TIPO_OTRO_MAX}
          aria-label="Nombre del tipo de documento"
        />
      )}
    </>
  );
}
