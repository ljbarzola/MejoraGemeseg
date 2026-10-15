import { useEffect, useState } from 'react';
import { getMe } from '../../services/user.service';
import ChangePasswordModal from '../../pages/profile/ChangePasswordModal';

/**
 * Cambio de contraseña obligatorio para administradores (2026-10-14): mientras
 * el servidor diga que está pendiente se muestra un modal que no se puede
 * cerrar. Al guardar, el servidor marca la bandera como hecha y la sesión sigue
 * abierta con el token nuevo. Si no se puede consultar el perfil, no se bloquea
 * a nadie.
 */
export default function CambioContrasenaObligatorio() {
  const [pendiente, setPendiente] = useState(false);

  useEffect(() => {
    let vivo = true;
    getMe()
      .then((perfil) => {
        if (vivo) setPendiente(!!perfil.debeCambiarContrasena);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  if (!pendiente) return null;
  return <ChangePasswordModal obligatorio onClose={() => setPendiente(false)} />;
}
