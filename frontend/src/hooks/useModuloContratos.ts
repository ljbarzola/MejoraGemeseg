import { useLocation } from 'react-router-dom';
import { usePerm } from '../contexts/PermissionsContext';

/**
 * Los contratos (con sus puestos y turnos) se ven desde dos módulos (2026-11-16): Operaciones
 * (`/operaciones/contratos`) y Contratación Pública (`/contratacion-publica/contratos`), con las mismas
 * pantallas. Este hook dice en cuál se está, a qué ruta volver y si la persona puede editar ahí.
 * En Contratación Pública no se muestran los horarios (son de Operaciones) ni la importación desde Excel.
 */
export function useModuloContratos() {
  const { pathname } = useLocation();
  const { canWrite } = usePerm();
  const enCP = pathname.startsWith('/contratacion-publica');
  return {
    enCP,
    base: enCP ? '/contratacion-publica/contratos' : '/operaciones/contratos',
    modulo: enCP ? 'Contratación Pública' : 'Operaciones',
    puedeEditar: canWrite('OPERACIONES') || canWrite('CONTRATACION_PUBLICA'),
  };
}
