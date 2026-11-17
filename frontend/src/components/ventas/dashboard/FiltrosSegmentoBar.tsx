import { useEffect, useState } from 'react';
import FilterField from '../../common/FilterField';
import ClearFiltersButton from '../../common/ClearFiltersButton';
import {
  FILTRO_OTRO,
  FILTRO_SIN_DATO,
  getLugaresOportunidades,
  getSalesClientFields,
  getServicios,
  type FiltrosDashboard,
  type SalesServicio,
} from '../../../services/ventas.service';

interface Opcion {
  key: string;
  label: string;
}

const opcionesDe = (options: unknown): Opcion[] =>
  (Array.isArray(options) ? options : [])
    .map((o: { key?: unknown; label?: unknown }) => ({ key: String(o?.key ?? ''), label: String(o?.label ?? o?.key ?? '') }))
    .filter((o) => o.key);

/**
 * Filtros del Dashboard comercial (2026-11-17, pedido del asesor comercial): tipo de negocio y público/privado de la
 * empresa o persona, servicio, y provincia/ciudad de la oportunidad (la ubicación es del lugar del servicio).
 */
export default function FiltrosSegmentoBar({
  valor,
  onChange,
}: {
  valor: FiltrosDashboard;
  onChange: (f: FiltrosDashboard) => void;
}) {
  const [tipos, setTipos] = useState<Opcion[]>([]);
  const [sectores, setSectores] = useState<Opcion[]>([]);
  const [servicios, setServicios] = useState<SalesServicio[]>([]);
  const [provincias, setProvincias] = useState<string[]>([]);
  const [ciudades, setCiudades] = useState<string[]>([]);

  useEffect(() => {
    getSalesClientFields()
      .then((fs) => {
        setTipos(opcionesDe(fs.find((f) => f.key === 'tipo_negocio')?.options));
        setSectores(opcionesDe(fs.find((f) => f.key === 'sector')?.options));
      })
      .catch(() => { /* sin campos: los filtros quedan con «Todos» */ });
    getServicios(true).then(setServicios).catch(() => { /* sin servicios */ });
    getLugaresOportunidades()
      .then((l) => { setProvincias(l.provincias); setCiudades(l.ciudades); })
      .catch(() => { /* sin lugares */ });
  }, []);

  const set = (k: keyof FiltrosDashboard, v: string) => onChange({ ...valor, [k]: v || undefined });
  const hay = Object.values(valor).some(Boolean);

  return (
    <div className="dash-barra dash-barra--filtros">
      <FilterField label="Tipo de negocio">
        <select className="filter-select" value={valor.tipoNegocio ?? ''} onChange={(e) => set('tipoNegocio', e.target.value)}>
          <option value="">Todos</option>
          {tipos.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          <option value={FILTRO_OTRO}>Otro (escrito a mano)</option>
          <option value={FILTRO_SIN_DATO}>Sin dato</option>
        </select>
      </FilterField>
      <FilterField label="Público / Privado">
        <select className="filter-select" value={valor.sector ?? ''} onChange={(e) => set('sector', e.target.value)}>
          <option value="">Todos</option>
          {sectores.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          <option value={FILTRO_SIN_DATO}>Sin dato</option>
        </select>
      </FilterField>
      <FilterField label="Servicio">
        <select className="filter-select" value={valor.servicioId ?? ''} onChange={(e) => set('servicioId', e.target.value)}>
          <option value="">Todos</option>
          {servicios.map((s) => <option key={s.id} value={String(s.id)}>{s.name}{s.isActive ? '' : ' (desactivado)'}</option>)}
        </select>
      </FilterField>
      <FilterField label="Provincia">
        <select className="filter-select" value={valor.provincia ?? ''} onChange={(e) => set('provincia', e.target.value)}>
          <option value="">Todas</option>
          {provincias.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </FilterField>
      <FilterField label="Ciudad">
        <select className="filter-select" value={valor.ciudad ?? ''} onChange={(e) => set('ciudad', e.target.value)}>
          <option value="">Todas</option>
          {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FilterField>
      <ClearFiltersButton onClear={() => onChange({})} disabled={!hay} />
    </div>
  );
}
