import { useEffect, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { InventarioDePuesto } from '../../../types/inventario';
import { CATEGORIA_ARMA_LABEL, CLASE_ARMA_LABEL, ESTADO_PERMISO_LABEL } from '../../../types/inventario';
import Cifra from './Cifra';
import { formatoFecha, nombreArticulo, pluralUnidad } from './inventarioUi';

const sinDato = <span style={{ color: '#a0aec0' }}>—</span>;

/** Armas y equipo de un puesto: lo que tiene asignado, en solo lectura. */
function PuestoBloque({ puesto }: { puesto: InventarioDePuesto }) {
  const resumen = [
    puesto.totalArmas > 0 ? `${puesto.totalArmas} ${puesto.totalArmas === 1 ? 'arma' : 'armas'}` : null,
    puesto.chalecos > 0 ? `${puesto.chalecos} ${puesto.chalecos === 1 ? 'chaleco' : 'chalecos'}` : null,
    puesto.municion > 0 ? `${puesto.municion} de munición` : null,
    puesto.otroEquipo > 0 ? `${puesto.otroEquipo} de otro equipo` : null,
  ].filter(Boolean);

  return (
    <div id={`inv-puesto-${puesto.puestoId}`} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, scrollMarginTop: 80 }}>
      <h4 style={{ margin: '0 0 10px', color: 'var(--azul-oscuro)', display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'baseline' }}>
        {puesto.nombre}
        <span style={{ fontWeight: 500, fontSize: '0.82rem', color: '#718096' }}>{resumen.join(' · ')}</span>
      </h4>

      {puesto.armas.length > 0 && (
        <div className="tasks-table-wrapper" style={{ marginBottom: puesto.equipo.length > 0 ? 12 : 0 }}>
          <table className="tasks-table">
            <thead>
              <tr>
                <th>Serie</th>
                <th>Arma</th>
                <th>Categoría</th>
                <th>Municiones</th>
                <th>Permiso</th>
              </tr>
            </thead>
            <tbody>
              {puesto.armas.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {a.serie}
                    {a.requiereCorreccion && (
                      <div>
                        <span className="status-badge" style={{ background: '#feebc8', color: '#c05621', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <AlertTriangle size={12} /> Por corregir
                        </span>
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{[CLASE_ARMA_LABEL[a.clase], a.marca, a.modelo, a.calibre].filter(Boolean).join(' · ')}</td>
                  <td>{a.categoria ? CATEGORIA_ARMA_LABEL[a.categoria] : sinDato}</td>
                  <td>{a.municiones ?? sinDato}</td>
                  <td style={{ fontSize: '0.82rem', color: a.permiso === 'VENCIDO' ? '#c53030' : undefined }}>
                    {a.permisoVence ? `${ESTADO_PERMISO_LABEL[a.permiso]} · ${formatoFecha(a.permisoVence)}` : ESTADO_PERMISO_LABEL[a.permiso]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {puesto.equipo.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.9rem' }}>
          {puesto.equipo.map((e) => (
            <li key={e.articuloId}>
              {nombreArticulo(e.articulo, e.variante)}: <strong>{e.cantidad}</strong> {pluralUnidad(e.unidad, e.cantidad)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Pestaña «Armas y equipo» de un contrato (Operaciones): lo que tiene cada uno de sus puestos, con totales arriba.
 * Solo se mira; para cambiar algo se va a Inventario. `enfocar` baja hasta ese puesto (viene del contador de la
 * pestaña Puestos).
 */
export default function ArmasYEquipoContrato({
  puestos,
  cargando,
  enfocar,
}: {
  puestos: InventarioDePuesto[];
  cargando: boolean;
  enfocar?: number | null;
}) {
  const navigate = useNavigate();

  const totales = useMemo(() => {
    const t = { armas: 0, chalecos: 0, municion: 0, otroEquipo: 0, vencidos: 0, porVencer: 0 };
    for (const p of puestos) {
      t.armas += p.totalArmas;
      t.chalecos += p.chalecos;
      t.municion += p.municion;
      t.otroEquipo += p.otroEquipo;
      for (const a of p.armas) {
        if (a.permiso === 'VENCIDO') t.vencidos++;
        if (a.permiso === 'POR_VENCER') t.porVencer++;
      }
    }
    return t;
  }, [puestos]);

  const conAlgo = puestos.filter((p) => p.totalArmas > 0 || p.totalEquipo > 0);
  const sinNada = puestos.filter((p) => p.totalArmas === 0 && p.totalEquipo === 0);

  useEffect(() => {
    if (enfocar == null || cargando) return;
    document.getElementById(`inv-puesto-${enfocar}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [enfocar, cargando, puestos]);

  if (cargando) return <div className="loading-state">Cargando armas y equipo...</div>;

  const irAInventario = (
    <button type="button" className="enlace-tabla" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => navigate('/operaciones/inventario?pestana=contratos')}>
      Ver en Inventario
    </button>
  );

  if (puestos.length === 0) {
    return <div className="empty-state">Este contrato todavía no tiene puestos, así que no hay armas ni equipo que mostrar.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        <Cifra valor={totales.armas} etiqueta="armas" />
        <Cifra valor={totales.chalecos} etiqueta="chalecos" />
        <Cifra valor={totales.municion} etiqueta="munición" />
        <Cifra valor={totales.otroEquipo} etiqueta="otro equipo" />
        <Cifra valor={totales.vencidos} etiqueta="permisos vencidos" alerta />
        <Cifra valor={totales.porVencer} etiqueta="permisos por vencer" alerta />
      </div>

      {conAlgo.length === 0 ? (
        <div className="empty-state">
          Ningún puesto de este contrato tiene armas ni equipo asignado todavía. Si ya están cargados con otro nombre de puesto, aparecen en
          Inventario, en «Sin puesto enlazado». {irAInventario}
        </div>
      ) : (
        conAlgo.map((p) => <PuestoBloque key={p.puestoId} puesto={p} />)
      )}

      {sinNada.length > 0 && conAlgo.length > 0 && (
        <div style={{ fontSize: '0.85rem', color: '#718096' }}>Sin armas ni equipo: {sinNada.map((p) => p.nombre).join(', ')}.</div>
      )}

      <div style={{ fontSize: '0.82rem', color: '#718096' }}>
        Se muestra lo asignado a los puestos de este contrato. Lo guardado en el rastrillo o sin puesto enlazado está en Inventario. {irAInventario}
      </div>
    </div>
  );
}
