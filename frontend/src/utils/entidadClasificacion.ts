// Sector y ubicación de una entidad de Contratación Pública (2026-11-18). Copia de
// backend/src/modules/contratacion-publica/entidades/entidad-clasificacion.util.ts: si cambia una
// lista, se cambia en los DOS (el servidor rechaza lo que no esté en la suya).
import type { TipoEntidad } from '../types/contratacion-publica';

export const SECTORES_PUBLICA = ['Ministerio', 'GAD', 'Empresa pública', 'Salud', 'Educación', 'Seguridad', 'Otra'];
export const SECTORES_PRIVADA = ['Industria', 'Comercio', 'Residencial', 'Agrícola', 'Otra'];

export const sectoresDe = (tipo: TipoEntidad | undefined | null) => (tipo === 'PRIVADA' ? SECTORES_PRIVADA : SECTORES_PUBLICA);

// Las 24 provincias, en el mismo orden que PROVINCIAS_EC del servidor (ventas/ubicacion.util.ts).
export const PROVINCIAS = [
  'Azuay', 'Bolívar', 'Cañar', 'Carchi', 'Chimborazo', 'Cotopaxi', 'El Oro', 'Esmeraldas', 'Galápagos', 'Guayas',
  'Imbabura', 'Loja', 'Los Ríos', 'Manabí', 'Morona Santiago', 'Napo', 'Orellana', 'Pastaza', 'Pichincha',
  'Santa Elena', 'Santo Domingo de los Tsáchilas', 'Sucumbíos', 'Tungurahua', 'Zamora Chinchipe',
];
