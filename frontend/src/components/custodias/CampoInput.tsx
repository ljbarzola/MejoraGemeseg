import type { CampoGuia, ValorCampo } from '../../types/custodiaGuia';
import DateInput from '../common/DateInput';

/**
 * Un campo configurable de la guía (Custodias › Configuración › Campos de la guía), con la entrada que le toca
 * según su tipo: texto, número, fecha, lista de opciones o Sí/No. Los que completa el custodio en ruta se avisan
 * con una nota, pero la oficina los puede escribir igual.
 */
export default function CampoInput({
  campo, valor, onChange,
}: {
  campo: CampoGuia;
  valor: ValorCampo | undefined;
  onChange: (v: ValorCampo) => void;
}) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  let entrada;
  switch (campo.tipo) {
    case 'NUMERO':
      entrada = <input type="number" value={texto} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
      break;
    case 'FECHA':
      entrada = <DateInput value={texto} onChange={(v) => onChange(v || null)} />;
      break;
    case 'LISTA':
      entrada = (
        <select value={texto} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Elegir...</option>
          {campo.opciones.map((o) => <option key={o} value={o}>{o}</option>)}
          {/* Un valor guardado que ya no está entre las opciones se sigue mostrando, para no perderlo sin querer. */}
          {texto && !campo.opciones.includes(texto) && <option value={texto}>{texto}</option>}
        </select>
      );
      break;
    case 'SI_NO':
      entrada = (
        <select value={valor === true ? 'SI' : valor === false ? 'NO' : ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'SI')}>
          <option value="">Sin responder</option>
          <option value="SI">Sí</option>
          <option value="NO">No</option>
        </select>
      );
      break;
    default:
      entrada = <input value={texto} onChange={(e) => onChange(e.target.value)} maxLength={200} />;
  }
  return (
    <div className="form-group" style={{ minWidth: 150 }}>
      <label>{campo.nombre}{campo.obligatorio && campo.llenaQuien === 'OFICINA' ? ' *' : ''}</label>
      {entrada}
      {campo.llenaQuien === 'CUSTODIO' && (
        <span style={{ fontSize: '0.72rem', color: '#a0aec0' }}>Lo completa el custodio en ruta</span>
      )}
    </div>
  );
}
