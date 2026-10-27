import '../../styles/bitacora.css';

/** Tarjeta de cifra de la Bitácora (la misma en el Dashboard, en la hoja del día y en Configuración). */
export default function Kpi({
  etiqueta,
  valor,
  detalle,
}: {
  etiqueta: string;
  valor: string | number;
  detalle?: string;
}) {
  return (
    <div className="bit-kpi">
      <span className="bit-kpi-etiqueta">{etiqueta}</span>
      <span className="bit-kpi-valor">{valor}</span>
      {detalle && <span className="bit-kpi-detalle">{detalle}</span>}
    </div>
  );
}
