import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Plus } from 'lucide-react';
import { getArticulos, getResumenInventario } from '../../../services/inventario.service';
import { getOpcionesBitacora } from '../../../services/bitacoras.service';
import type { Articulo, ResumenInventario, TipoMovimiento } from '../../../types/inventario';
import { CLASE_ARMA_LABEL, ESTADO_PERMISO_LABEL, TIPO_ARTICULO_LABEL } from '../../../types/inventario';
import { usePerm } from '../../../contexts/PermissionsContext';
import OperacionesPageHeader from '../../../components/operaciones/OperacionesPageHeader';
import PageTabs, { type PageTab } from '../../../components/common/PageTabs';
import ExistenciasTab from './ExistenciasTab';
import ArmasTab from './ArmasTab';
import TenenciasTab from './TenenciasTab';
import MovimientosTab from './MovimientosTab';
import MovimientoModal from './MovimientoModal';
import { COLOR_PERMISO, formatoFecha, mensajeError, nombreArticulo } from './inventarioUi';

type Pestana = 'resumen' | 'existencias' | 'armas' | 'tenencias' | 'movimientos';
const PESTANAS: PageTab<Pestana>[] = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'existencias', label: 'Existencias', title: 'Uniformes, implementos y municiones' },
  { key: 'armas', label: 'Armas' },
  { key: 'tenencias', label: 'Quién tiene qué', title: 'Lo entregado y aún no devuelto' },
  { key: 'movimientos', label: 'Movimientos', title: 'El kardex: entradas, entregas, devoluciones, bajas y ajustes' },
];

function Cifra({ valor, etiqueta, alerta }: { valor: number; etiqueta: string; alerta?: boolean }) {
  const color = alerta && valor > 0 ? '#c53030' : 'var(--azul-oscuro)';
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1 }}>{valor}</span>
      <span style={{ fontSize: '0.78rem', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{etiqueta}</span>
    </div>
  );
}

/** Resumen: lo que pide atención hoy. Las cuentas salen de los movimientos; nada se escribe aquí. */
function ResumenTab({ recarga, onIr }: { recarga: number; onIr: (p: Pestana) => void }) {
  const [datos, setDatos] = useState<ResumenInventario | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getResumenInventario()
      .then((d) => { setDatos(d); setError(''); })
      .catch((err) => setError(mensajeError(err, 'No se pudo cargar el resumen del inventario.')));
  }, [recarga]);

  if (error) return <div className="form-error">{error}</div>;
  if (!datos) return <div className="loading-state">Cargando…</div>;

  const { articulos: a, armas: r } = datos;
  const vacio = a.total === 0 && r.total === 0;

  return (
    <>
      <div className="admin-section" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          <Cifra valor={a.total} etiqueta="artículos" />
          <Cifra valor={a.porReponer} etiqueta="por reponer" alerta />
          <Cifra valor={r.total} etiqueta="armas" />
          <Cifra valor={r.asignadas} etiqueta="asignadas" />
          <Cifra valor={r.permisosVencidos} etiqueta="permisos vencidos" alerta />
          <Cifra valor={r.permisosPorVencer} etiqueta="permisos por vencer" alerta />
        </div>
      </div>

      {vacio && (
        <div className="admin-section">
          <div className="empty-state">
            El inventario está vacío. En <button type="button" className="enlace-tabla" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => onIr('existencias')}>Existencias</button>{' '}
            crea los artículos que manejas (uniformes por talla, implementos, municiones) y registra su primera entrada; las armas se registran por serie en <button type="button" className="enlace-tabla" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }} onClick={() => onIr('armas')}>Armas</button>.
          </div>
        </div>
      )}

      {!vacio && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          <div className="admin-section">
            <h3 style={{ margin: '0 0 10px', fontSize: '1.05rem', color: 'var(--azul-oscuro)' }}>Por reponer</h3>
            {datos.reposicion.length === 0 ? (
              <div style={{ color: '#718096', fontSize: '0.9rem' }}>Todo está sobre el mínimo.</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {datos.reposicion.map((x) => (
                  <li key={x.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.9rem' }}>
                    <span>
                      <strong style={{ fontWeight: 600 }}>{nombreArticulo(x.nombre, x.variante)}</strong>{' '}
                      <span style={{ color: '#718096' }}>· {TIPO_ARTICULO_LABEL[x.tipo]}</span>
                    </span>
                    <span style={{ color: x.enBodega <= 0 ? '#c53030' : '#c05621', whiteSpace: 'nowrap' }}>
                      {x.enBodega <= 0 ? 'Agotado' : `Quedan ${x.enBodega}`}
                      {x.reponer > 0 && ` · reponer ${x.reponer}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="admin-section">
            <h3 style={{ margin: '0 0 10px', fontSize: '1.05rem', color: 'var(--azul-oscuro)' }}>Permisos de armas</h3>
            {datos.permisos.length === 0 ? (
              <div style={{ color: '#718096', fontSize: '0.9rem' }}>
                Ningún permiso vence en los próximos 30 días.
                {r.sinPermiso > 0 && ` ${r.sinPermiso} ${r.sinPermiso === 1 ? 'arma no tiene' : 'armas no tienen'} permiso registrado.`}
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {datos.permisos.map((p) => (
                  <li key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.9rem', alignItems: 'center' }}>
                    <span>
                      <strong style={{ fontWeight: 600, fontFamily: 'monospace' }}>{p.serie}</strong>{' '}
                      <span style={{ color: '#718096' }}>· {CLASE_ARMA_LABEL[p.clase]}</span>
                    </span>
                    <span className="status-badge" style={{ background: COLOR_PERMISO[p.permiso].bg, color: COLOR_PERMISO[p.permiso].fg }}>
                      {ESTADO_PERMISO_LABEL[p.permiso]} · {formatoFecha(p.permisoVence)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Inventario de Operaciones (2026-11-06): uniformes, implementos y municiones con kardex, y armas por serie.
 * El saldo de cada artículo se calcula siempre desde sus movimientos. Avisa por la campana cuando un artículo
 * llega al mínimo y marca los permisos de armas vencidos o por vencer.
 */
export default function InventarioPage() {
  const { canWrite } = usePerm();
  const puedeEscribir = canWrite('OPERACIONES');
  const [searchParams, setSearchParams] = useSearchParams();
  const pedida = searchParams.get('pestana') as Pestana | null;
  const pestana: Pestana = PESTANAS.some((t) => t.key === pedida) ? (pedida as Pestana) : 'resumen';
  const irA = useCallback(
    (p: Pestana) => {
      const next = new URLSearchParams(searchParams);
      if (p === 'resumen') next.delete('pestana');
      else next.set('pestana', p);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // Se suma cuando algo cambia en una pestaña para que las demás vuelvan a cargar.
  const [recarga, setRecarga] = useState(0);
  const cambio = () => setRecarga((n) => n + 1);

  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [puestosOpc, setPuestosOpc] = useState<{ id: number; texto: string }[]>([]);
  const [crearArticulo, setCrearArticulo] = useState(false);
  const [crearArma, setCrearArma] = useState(false);
  const [movimiento, setMovimiento] = useState<{ articuloId?: number; tipo?: TipoMovimiento } | null>(null);

  useEffect(() => {
    getArticulos().then(setArticulos).catch(() => setArticulos([]));
  }, [recarga]);
  useEffect(() => {
    getOpcionesBitacora()
      .then((o) => setPuestosOpc(o.flatMap((c) => c.puestos.map((p) => ({ id: p.id, texto: `${c.entidadNombre} — ${p.nombre}` })))))
      .catch(() => setPuestosOpc([]));
  }, []);

  const activos = useMemo(() => articulos.filter((a) => a.activo), [articulos]);

  const acciones = puedeEscribir ? (
    <>
      <button className="btn-secondary" onClick={() => setMovimiento({})} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <ArrowLeftRight size={15} /> Registrar movimiento
      </button>
      {pestana === 'armas' ? (
        <button className="auth-btn" onClick={() => setCrearArma(true)}><Plus size={16} /> Nueva arma</button>
      ) : (
        <button className="auth-btn" onClick={() => { setCrearArticulo(true); if (pestana !== 'existencias') irA('existencias'); }}>
          <Plus size={16} /> Nuevo artículo
        </button>
      )}
    </>
  ) : undefined;

  return (
    <div className="page-container">
      <OperacionesPageHeader
        pantalla="inventario"
        title="Inventario"
        description="Uniformes, implementos, municiones y armas: cuánto hay, quién lo tiene y qué toca reponer o renovar."
        actions={acciones}
      />
      <PageTabs tabs={PESTANAS} value={pestana} onChange={irA} label="Secciones del inventario" />

      {pestana === 'resumen' && <ResumenTab recarga={recarga} onIr={irA} />}
      {pestana === 'existencias' && (
        <ExistenciasTab
          puedeEscribir={puedeEscribir}
          recarga={recarga}
          crearAbierto={crearArticulo}
          onCrearCerrado={() => setCrearArticulo(false)}
          onMovimiento={(articuloId, tipo) => setMovimiento({ articuloId, tipo })}
          onCambio={cambio}
        />
      )}
      {pestana === 'armas' && (
        <ArmasTab
          puedeEscribir={puedeEscribir}
          puestos={puestosOpc}
          recarga={recarga}
          crearAbierto={crearArma}
          onCrearCerrado={() => setCrearArma(false)}
          onCambio={cambio}
        />
      )}
      {pestana === 'tenencias' && <TenenciasTab recarga={recarga} />}
      {pestana === 'movimientos' && <MovimientosTab recarga={recarga} />}

      {movimiento && (
        <MovimientoModal
          articulos={activos}
          puestos={puestosOpc}
          inicial={movimiento}
          onClose={() => setMovimiento(null)}
          onSaved={() => { setMovimiento(null); cambio(); }}
        />
      )}
    </div>
  );
}
