import { useMemo, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import RowActionsMenu, { type RowAction } from '../common/RowActionsMenu';
import ColumnFilter, { FilaSinResultados } from '../common/ColumnFilter';
import { useResizableColumns } from '../../hooks/useResizableColumns';
import type { ColumnFilters } from '../../hooks/useColumnFilters';
import type { SalesClient } from '../../services/ventas.service';
import {
  COLOR_HOY,
  COLOR_VENCIDO,
  diaDe,
  formatDia,
  hoyISO,
  ordenarPorUrgencia,
  urgenciaDe,
} from '../../utils/seguimientoVentas';

interface Props {
  clientes: SalesClient[];
  // Clave para guardar los anchos de columna (una por pantalla).
  storageKey: string;
  // Muestra la columna del responsable (cuando se miran clientes de otras personas).
  mostrarResponsable?: boolean;
  onHecho: (client: SalesClient) => void;
  onEditar: (client: SalesClient) => void;
  // Si se pasa, el nombre abre la ficha del cliente.
  onAbrirFicha?: (client: SalesClient) => void;
  accionesFila: (client: SalesClient) => RowAction[];
  // Contenido opcional bajo el nombre (p. ej. el chip «Por contratar»).
  extraNombre?: (client: SalesClient) => ReactNode;
  // Filtros y orden por columna (botón único de la cabecera). La pantalla los crea sobre `clientes` YA ordenados por
  // urgencia (así ese es el orden hasta que alguien ordene por otra columna) y se encarga de los chips y de limpiarlos.
  // Sin `cf`, la tabla queda con el orden fijo por urgencia.
  cf?: ColumnFilters<SalesClient>;
  onLimpiarFiltros?: () => void;
}

// Tabla de trabajo "Hoy": por defecto orden por urgencia (vencidos, hoy, sin fecha),
// columnas fijas y el botón «Hecho». La comparten Clientes (quienes ya
// contratan) y Oportunidades (negociaciones en curso).
export default function SeguimientoHoyTable({
  clientes, storageKey, mostrarResponsable = false, onHecho, onEditar, onAbrirFicha, accionesFila, extraNombre, cf, onLimpiarFiltros,
}: Props) {
  const hoy = hoyISO();
  const porUrgencia = useMemo(() => ordenarPorUrgencia(clientes, hoy), [clientes, hoy]);
  const filas = cf ? cf.filas : porUrgencia;
  const columnas = ['name', 'siguiente', 'para', 'etapa', 'phone', ...(mostrarResponsable ? ['responsable'] : []), 'acciones'];
  const tablaRef = useResizableColumns(storageKey, columnas);

  const botonTexto = (c: SalesClient, esFecha: boolean) => {
    const urgencia = urgenciaDe(c, hoy);
    const dia = diaDe(c);
    const vacio = esFecha ? !dia : !c.nextActionText;
    const color = urgencia === 'vencido' ? COLOR_VENCIDO : urgencia === 'hoy' ? COLOR_HOY : undefined;
    return (
      <button
        type="button"
        onClick={() => onEditar(c)}
        title="Editar el siguiente paso"
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left',
          color: vacio ? '#a0aec0' : esFecha ? color : undefined,
          fontWeight: esFecha && color ? 600 : undefined,
          whiteSpace: esFecha ? 'nowrap' : undefined,
        }}
      >
        {vacio
          ? (esFecha ? 'Sin fecha' : '+ Definir')
          : esFecha
            ? `${urgencia === 'vencido' ? 'Vencido · ' : urgencia === 'hoy' ? 'Hoy · ' : ''}${formatDia(dia!)}`
            : c.nextActionText}
      </button>
    );
  };

  return (
    <div className="tasks-table-wrapper">
      <table className="tasks-table resizable-table" ref={tablaRef}>
        <thead>
          <tr>
            <th>Nombre {cf && <ColumnFilter cf={cf} col="name" orden={cf.ordenDe('name')} />}</th>
            <th>Siguiente paso {cf && <ColumnFilter cf={cf} col="siguiente" orden={cf.ordenDe('siguiente')} />}</th>
            <th>Para cuándo {cf && <ColumnFilter cf={cf} col="para" orden={cf.ordenDe('para')} />}</th>
            <th>Etapa {cf && <ColumnFilter cf={cf} col="etapa" orden={cf.ordenDe('etapa')} />}</th>
            <th>Teléfono {cf && <ColumnFilter cf={cf} col="phone" orden={cf.ordenDe('phone')} />}</th>
            {mostrarResponsable && <th>Responsable {cf && <ColumnFilter cf={cf} col="responsable" orden={cf.ordenDe('responsable')} />}</th>}
            <th className="col-acciones col-acciones--ancha" title="Acciones">
              <span className="visually-hidden">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <FilaSinResultados
              columnas={columnas.length}
              mensaje="No hay contactos que coincidan con los filtros."
              onLimpiar={onLimpiarFiltros}
            />
          )}
          {filas.map((c) => (
            <tr key={c.id}>
              <td style={{ fontWeight: 600 }}>
                {onAbrirFicha ? (
                  <a href={`/ventas/clientes?ficha=${c.id}`} className="enlace-tabla" title="Abrir la ficha"
                    onClick={(e) => { e.preventDefault(); onAbrirFicha(c); }}>
                    {c.name}
                  </a>
                ) : c.name}
                {extraNombre?.(c)}
              </td>
              <td>{botonTexto(c, false)}</td>
              <td>{botonTexto(c, true)}</td>
              <td>
                {c.stage ? (
                  <span className="status-badge" style={{ backgroundColor: c.stage.color + '22', color: c.stage.color }}>
                    {c.stage.label}
                  </span>
                ) : '—'}
              </td>
              <td>{c.phone || '—'}</td>
              {mostrarResponsable && (
                <td>{c.assignedUser ? c.assignedUser.fullName : <span style={{ color: '#a0aec0' }}>Sin asignar</span>}</td>
              )}
              <td className="col-acciones col-acciones--ancha">
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button type="button" onClick={() => onHecho(c)}
                    title="Ya lo atendí: dejar el siguiente paso"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                      padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                      fontSize: 12.5, fontWeight: 600, color: '#276749', background: '#f0fff4', border: '1px solid #9ae6b4',
                    }}>
                    <Check size={14} /> Hecho
                  </button>
                  <RowActionsMenu actions={accionesFila(c)} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
