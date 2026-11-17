import { useEffect, useState } from 'react';
import { getClientesImpactados, type ClientesImpactados } from '../../../services/ventas.service';
import { Contador, KpiFila, SinDatos, Tarjeta, dinero } from './DashboardBits';

type Grupo = 'impactados' | 'nuevos' | 'recurrentes';
const TITULO: Record<Grupo, string> = {
  impactados: 'Clientes impactados',
  nuevos: 'Clientes nuevos',
  recurrentes: 'Clientes recurrentes',
};

/**
 * Clientes nuevos, impactados y recurrentes del periodo (2026-11-17, pedido del asesor comercial).
 * Venta = oportunidad aceptada en el periodo (misma regla de Metas). Cada cifra abre su lista; cada nombre, su ficha.
 */
export default function DashboardImpactados({
  alcance,
  desde,
  hasta,
  onFicha,
}: {
  alcance: string;
  desde: string;
  hasta: string;
  onFicha: (clienteId: number) => void;
}) {
  const [datos, setDatos] = useState<ClientesImpactados | null>(null);
  const [error, setError] = useState(false);
  const [lista, setLista] = useState<Grupo | null>(null);

  useEffect(() => {
    let vigente = true;
    setError(false);
    getClientesImpactados({ alcance, desde, hasta })
      .then((d) => vigente && setDatos(d))
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
  }, [alcance, desde, hasta]);

  const filas = !datos
    ? []
    : datos.clientes.filter((c) => lista === 'impactados' || (lista === 'nuevos' ? !c.recurrente : c.recurrente));

  return (
    <Tarjeta
      titulo="Clientes nuevos, impactados y recurrentes"
      hint="Empresas o personas con al menos una oportunidad aceptada en el periodo. Nuevas: compraron por primera vez; recurrentes: ya habían comprado antes"
    >
      {error ? (
        <SinDatos texto="No se pudo cargar esta cifra." />
      ) : !datos ? (
        <SinDatos texto="Cargando..." />
      ) : (
        <KpiFila>
          <Contador
            titulo="Impactados" valor={datos.impactados} color="#2b6cb0"
            detalle="Con al menos una venta en el periodo" onClick={() => setLista('impactados')}
          />
          <Contador
            titulo="Nuevos" valor={datos.nuevos} color="#2f855a"
            detalle="Su primera compra" onClick={() => setLista('nuevos')}
          />
          <Contador
            titulo="Recurrentes" valor={datos.recurrentes} color="#b7791f"
            detalle="Ya habían comprado antes" onClick={() => setLista('recurrentes')}
          />
        </KpiFila>
      )}

      {lista && datos && (
        <div className="modal-overlay" onClick={() => setLista(null)}>
          <div className="modal modal-ventas-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dash-imp-title">
            <div className="modal-header">
              <h3 id="dash-imp-title">{TITULO[lista]} · {filas.length}</h3>
              <button className="modal-close" onClick={() => setLista(null)} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal-body">
              {filas.length === 0 ? (
                <p style={{ margin: 0, color: '#718096', fontSize: 13 }}>No hay clientes en este grupo para el periodo.</p>
              ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  {filas.map((c, i) => (
                    <div
                      key={c.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i === 0 ? 'none' : '1px solid #edf2f7', fontSize: 13 }}
                    >
                      <a
                        href="#ficha" className="enlace-tabla" style={{ flex: 1, minWidth: 0 }}
                        onClick={(e) => { e.preventDefault(); setLista(null); onFicha(c.id); }}
                      >
                        {c.nombre}
                      </a>
                      {lista === 'impactados' && (
                        <span style={{ fontSize: 11.5, color: c.recurrente ? '#b7791f' : '#2f855a', fontWeight: 600 }}>
                          {c.recurrente ? 'Recurrente' : 'Nuevo'}
                        </span>
                      )}
                      <span style={{ color: '#718096', whiteSpace: 'nowrap' }}>{c.ventas} {c.ventas === 1 ? 'venta' : 'ventas'}</span>
                      <strong style={{ whiteSpace: 'nowrap' }}>{dinero(c.monto)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setLista(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </Tarjeta>
  );
}
