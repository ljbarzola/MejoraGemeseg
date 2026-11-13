import { useEffect, useMemo, useState } from 'react';
import { getOpcionesBitacora } from '../../services/bitacoras.service';
import type { FiltrosBitacoras, OpcionPuestoBitacora } from '../../types/bitacoras';
import OperacionesPageHeader from '../../components/operaciones/OperacionesPageHeader';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import DateInput from '../../components/common/DateInput';
import FilterField from '../../components/common/FilterField';
import BitacorasResumen from './bitacoras/BitacorasResumen';
import PuestosHoy from './PuestosHoy';

/**
 * Resumen de Operaciones, la primera pantalla del módulo. Arriba, «Hoy en los puestos» (quién debe
 * estar, si se cumple la cobertura y qué bitácoras faltan por subir); abajo, lo que dejan las bitácoras
 * de guardianía y cómo cuadran con el horario (novedad que más se repite, días y puestos con más
 * novedades, hallazgos abiertos). Lo de abajo antes era una pestaña dentro de Bitácoras.
 */
export default function OperacionesResumenPage() {
  const [opciones, setOpciones] = useState<OpcionPuestoBitacora[]>([]);
  const [filtros, setFiltros] = useState<FiltrosBitacoras>({});

  useEffect(() => {
    getOpcionesBitacora().then(setOpciones).catch(() => setOpciones([]));
  }, []);

  // Puestos para filtrar, con la entidad al lado para no confundir «Garita norte» de dos contratos.
  const puestosFiltro = useMemo(
    () => opciones.flatMap((o) => o.puestos.map((p) => ({ id: p.id, texto: `${o.entidadNombre} — ${p.nombre}` }))),
    [opciones],
  );
  const hayFiltros = Object.values(filtros).some(Boolean);

  return (
    <div className="page-container">
      <OperacionesPageHeader
        pantalla="resumen"
        title="Resumen"
        description="Cómo van los puestos hoy y lo que dejan las bitácoras: quién debe estar, qué hojas faltan por subir, qué porcentaje cuadra con el horario y qué hallazgos siguen abiertos."
      />

      <PuestosHoy />

      <h3 style={{ margin: '4px 0 10px', fontSize: '1.05rem', color: 'var(--azul-oscuro)' }}>Lo que dejan las bitácoras</h3>
      <div className="filter-bar">
        <div className="filter-bar-fields">
          <select
            className="filter-select"
            value={filtros.puestoId ?? ''}
            onChange={(e) => setFiltros((f) => ({ ...f, puestoId: e.target.value }))}
            aria-label="Puesto"
          >
            <option value="">Todos los puestos</option>
            {puestosFiltro.map((p) => <option key={p.id} value={p.id}>{p.texto}</option>)}
          </select>
          <FilterField label="Desde">
            <div className="filtro-fecha-dateinput">
              <DateInput className="filtro-fecha-dia" value={filtros.desde ?? ''} onChange={(v) => setFiltros((f) => ({ ...f, desde: v }))} max={filtros.hasta || undefined} />
            </div>
          </FilterField>
          <FilterField label="Hasta">
            <div className="filtro-fecha-dateinput">
              <DateInput className="filtro-fecha-dia" value={filtros.hasta ?? ''} onChange={(v) => setFiltros((f) => ({ ...f, hasta: v }))} min={filtros.desde || undefined} />
            </div>
          </FilterField>
        </div>
        <div className="filter-bar-actions">
          <ClearFiltersButton onClear={() => setFiltros({})} disabled={!hayFiltros} />
        </div>
      </div>

      <BitacorasResumen filtros={filtros} />
    </div>
  );
}
