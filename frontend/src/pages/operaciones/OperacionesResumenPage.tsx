import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, ShieldCheck, Truck } from 'lucide-react';
import { usePerm } from '../../contexts/PermissionsContext';
import PageTabs from '../../components/common/PageTabs';
import CustodiasDashboard from '../custodias/CustodiasDashboard';
import { getOpcionesBitacora } from '../../services/bitacoras.service';
import type { FiltrosBitacoras, OpcionPuestoBitacora } from '../../types/bitacoras';
import OperacionesPageHeader from '../../components/operaciones/OperacionesPageHeader';
import ClearFiltersButton from '../../components/common/ClearFiltersButton';
import DateInput from '../../components/common/DateInput';
import FilterField from '../../components/common/FilterField';
import BitacorasResumen from './bitacoras/BitacorasResumen';
import PuestosHoy from './PuestosHoy';
import AvisoHorasCodigos from '../../components/operaciones/AvisoHorasCodigos';

/**
 * Resumen de Operaciones, la primera pantalla del módulo. Tres pestañas: «Hoy» (solo lo de hoy: quién debe
 * estar en cada puesto, si se cumple la cobertura y qué bitácoras faltan por subir), «Bitácoras» (lo que
 * dejan las hojas de guardianía en un período y cómo cuadran con el horario: novedades, rondas, ingresos,
 * hallazgos abiertos) y «Custodias». Antes «Hoy» y lo de las bitácoras estaban juntos en una sola pestaña.
 */
export default function OperacionesResumenPage() {
  const { canView } = usePerm();
  const [params, setParams] = useSearchParams();
  // «Custodias» es una ventana más del Resumen (2026-11-16): los viajes ya no son un módulo aparte.
  // Desde 2026-11-18 los viajes los gobierna el mismo permiso de Operaciones.
  const hayCustodias = canView('OPERACIONES');
  const pedida = params.get('vista');
  const vista: 'hoy' | 'bitacoras' | 'custodias' =
    hayCustodias && pedida === 'custodias' ? 'custodias' : pedida === 'bitacoras' ? 'bitacoras' : 'hoy';
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
        description="Hoy: quién debe estar en cada puesto y qué hojas faltan por subir. Bitácoras: lo que dejan las hojas en un período (novedades, rondas, ingresos y hallazgos abiertos). Custodias: cómo van los viajes."
      />

      <PageTabs
        label="Resumen de Operaciones"
        tabs={[
          { key: 'hoy' as const, label: 'Hoy', icon: ShieldCheck },
          { key: 'bitacoras' as const, label: 'Bitácoras', icon: ClipboardList },
          ...(hayCustodias ? [{ key: 'custodias' as const, label: 'Custodias', icon: Truck }] : []),
        ]}
        value={vista}
        onChange={(key) => setParams(key === 'hoy' ? {} : { vista: key }, { replace: true })}
      />

      {vista === 'custodias' && <CustodiasDashboard incrustado />}

      {vista === 'hoy' && (
      <>
      <AvisoHorasCodigos />

      <PuestosHoy />
      </>
      )}

      {vista === 'bitacoras' && (
      <>
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
      </>
      )}
    </div>
  );
}
