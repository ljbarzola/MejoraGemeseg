// Los campos de la guía que completa el custodio desde el celular: cuáles son, cuáles faltan y cómo se aplican
// los cambios que todavía no llegaron al servidor (para que la pantalla muestre lo que la persona acaba de escribir).

import type { CampoGuia, GuiaCustodia, ValorCampo } from '../types/custodiaGuia';
import type { CambioGuia } from '../types/custodiaCampo';

export interface GrupoCampos {
  clave: string;
  titulo: string;
  bloque: CambioGuia['bloque'];
  indice?: number;
  campos: CampoGuia[];
  valores: Record<string, ValorCampo>;
}

export const vacio = (v: ValorCampo | undefined): boolean => v === undefined || v === null || v === '';

/** Los grupos de campos que le toca llenar al CUSTODIO (activos y aplicables al tipo de servicio), con sus valores. */
export function gruposDelCustodio(tipo: string, definiciones: CampoGuia[], guia: GuiaCustodia): GrupoCampos[] {
  const aplicables = definiciones
    .filter((c) => c.activo !== false && c.llenaQuien === 'CUSTODIO' && (c.tipoServicio === 'TODOS' || c.tipoServicio === tipo))
    .sort((a, b) => Number(b.esSello) - Number(a.esSello) || a.orden - b.orden);
  const de = (bloque: string) => aplicables.filter((c) => c.bloque === bloque);
  const grupos: GrupoCampos[] = [];

  const generales = de('GENERAL');
  if (generales.length) grupos.push({ clave: 'GENERAL', titulo: 'Datos del viaje', bloque: 'GENERAL', campos: generales, valores: guia.campos ?? {} });

  const deContenedor = de('CONTENEDOR');
  if (deContenedor.length) {
    (guia.contenedores ?? []).forEach((c, i) => {
      grupos.push({
        clave: `CONTENEDOR:${i}`, titulo: `Contenedor ${i + 1}${c.numero ? ` · ${c.numero}` : ''}`, bloque: 'CONTENEDOR', indice: i,
        campos: deContenedor, valores: c.campos ?? {},
      });
    });
  }

  const deHacienda = de('HACIENDA');
  if (deHacienda.length) {
    (guia.haciendas ?? []).forEach((h, i) => {
      grupos.push({
        clave: `HACIENDA:${i}`, titulo: `Hacienda ${i + 1}${h.nombre ? ` · ${h.nombre}` : ''}`, bloque: 'HACIENDA', indice: i,
        campos: deHacienda, valores: h.campos ?? {},
      });
    });
  }
  return grupos;
}

/** Los obligatorios que siguen vacíos, con el nombre que se le muestra a la persona. */
export function camposFaltantes(grupos: GrupoCampos[]): string[] {
  const falta: string[] = [];
  for (const g of grupos) {
    for (const c of g.campos) {
      if (c.obligatorio && vacio(g.valores[String(c.id)])) falta.push(g.bloque === 'GENERAL' ? c.nombre : `${c.nombre} (${g.titulo.split(' · ')[0].toLowerCase()})`);
    }
  }
  return falta;
}

/** Copia de la guía con los cambios aplicados (los que están en la cola sin enviar). */
export function aplicarCambios(guia: GuiaCustodia, cambios: CambioGuia[]): GuiaCustodia {
  if (!cambios.length) return guia;
  const g: GuiaCustodia = JSON.parse(JSON.stringify(guia ?? {}));
  for (const c of cambios) {
    const clave = c.campoId;
    if (c.bloque === 'GENERAL') {
      g.campos = { ...(g.campos ?? {}), [clave]: c.valor };
    } else if (c.bloque === 'CONTENEDOR') {
      const x = g.contenedores?.[c.indice ?? -1];
      if (x) x.campos = { ...(x.campos ?? {}), [clave]: c.valor };
    } else {
      const x = g.haciendas?.[c.indice ?? -1];
      if (x) x.campos = { ...(x.campos ?? {}), [clave]: c.valor };
    }
  }
  return g;
}
