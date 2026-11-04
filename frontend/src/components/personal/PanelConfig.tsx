import type { ReactNode } from 'react';

/**
 * Marco de cada pestaña de la Configuración de RRHH (2026-10-30). Lo que explica la pestaña va a la
 * izquierda y sus botones (Guardar, Probar...) arriba a la derecha: así se ven siempre, sin bajar por la
 * pantalla ni quedar bajo los botones flotantes de la esquina. Justo debajo van los mensajes (error,
 * «guardado») para que se vean al lado del botón que se acaba de pulsar.
 */
export default function PanelConfig({
  descripcion,
  acciones,
  estado,
  children,
}: {
  descripcion: ReactNode;
  acciones?: ReactNode;
  estado?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="admin-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px 20px', flexWrap: 'wrap', marginBottom: 12 }}>
        <p style={{ flex: '1 1 420px', minWidth: 0, margin: 0, fontSize: '0.86rem', color: '#4a5568', lineHeight: 1.5 }}>{descripcion}</p>
        {acciones && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 'none' }}>{acciones}</div>}
      </div>
      {estado}
      {children}
    </div>
  );
}

/** «Cambios sin guardar» junto al botón Guardar: se ve cuando hay algo pendiente. */
export function SinGuardar({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#b7791f' }}>Cambios sin guardar</span>;
}
