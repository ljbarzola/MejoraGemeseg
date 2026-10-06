import ConfirmDialog from './ConfirmDialog';

/**
 * Aviso para quien intenta hacer algo que es solo de administradores (hoy: el
 * Gerente, que ve las pantallas administrativas en solo lectura). Siempre se le
 * dice por qué no puede y a quién acudir, en vez de ocultar el botón o dejarlo
 * muerto. `accion` completa la frase "…para que ___" (ej. "cree el usuario").
 */
export default function SoloAdminDialog({
  accion,
  onClose,
}: {
  accion: string;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title="No tienes permiso para esto"
      message={`Esta acción es solo para administradores: tu rol tiene acceso de solo lectura en esta pantalla. Contacta a un administrador de tu empresa para que ${accion}.`}
      confirmLabel="Entendido"
      hideCancel
      onConfirm={onClose}
      onCancel={onClose}
    />
  );
}
