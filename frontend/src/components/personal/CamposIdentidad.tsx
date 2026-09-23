interface Valores {
  apellidos: string;
  nombres: string;
  cedula: string;
  correo: string;
}

interface Props extends Valores {
  correoRequerido?: boolean;
  onChange: (patch: Partial<Valores>) => void;
}

// Identidad de la persona. No depende de los campos configurables: cédula,
// apellidos, nombres y correo de contacto tienen que verse siempre.
export default function CamposIdentidad({
  apellidos,
  nombres,
  cedula,
  correo,
  correoRequerido,
  onChange,
}: Props) {
  return (
    <>
      <div className="form-group">
        <label>Apellidos</label>
        <input
          value={apellidos}
          onChange={(e) => onChange({ apellidos: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>Nombres</label>
        <input
          value={nombres}
          onChange={(e) => onChange({ nombres: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>Cédula</label>
        <input
          inputMode="numeric"
          placeholder="10 dígitos"
          value={cedula}
          onChange={(e) => onChange({ cedula: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>
          Correo de contacto
          {correoRequerido && <span style={{ color: '#c53030', marginLeft: '4px' }}>*</span>}
        </label>
        <input
          type="email"
          inputMode="email"
          value={correo}
          onChange={(e) => onChange({ correo: e.target.value })}
        />
      </div>
    </>
  );
}
