import { useEffect, useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import ErrorBanner from '../common/ErrorBanner';
import NumInput from './cotizador/NumInput';
import { useToast } from '../../contexts/ToastContext';
import { getUser } from '../../services/auth.service';
import { getTarifasCustodia, guardarTarifasCustodia } from '../../services/cotizador-custodia.service';
import type { ExtraCustodia, TarifasCustodia } from '../../utils/cotizador/custodia';

const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <div className="cus-campo">
      <label>
        <span>{etiqueta}</span>
        {children}
      </label>
      {ayuda && <small>{ayuda}</small>}
    </div>
  );
}

const nuevoId = () => `extra-${Math.random().toString(36).slice(2, 8)}`;

// Configuración → «Tarifas de custodia»: todo lo que usa la calculadora de custodia móvil del Cotizador.
// Son costos internos: solo un administrador o gerente de la empresa los cambia.
export default function CustodiaTarifasSection({ puedeEditar }: { puedeEditar: boolean }) {
  const { showToast } = useToast();
  const rol = getUser()?.role ?? '';
  const puede = puedeEditar && (rol === 'ADMIN' || rol === 'MANAGER');
  const [t, setT] = useState<TarifasCustodia | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    getTarifasCustodia().then(setT).catch((err) => setError(mensajeDe(err, 'No se pudieron cargar las tarifas.')));
  }, []);

  if (!t) return error ? <ErrorBanner mensaje={error} /> : <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>;

  const num = (clave: keyof TarifasCustodia, etiqueta: string, ayuda?: string, max?: number) => (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      <NumInput
        value={t[clave] as number}
        min={0}
        max={max}
        disabled={!puede}
        ariaLabel={etiqueta}
        onCommit={(n) => setT({ ...t, [clave]: n ?? 0 })}
      />
    </Campo>
  );

  const cambiarExtra = (id: string, p: Partial<ExtraCustodia>) =>
    setT({ ...t, extras: t.extras.map((e) => (e.id === id ? { ...e, ...p } : e)) });

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      setT(await guardarTarifasCustodia(t));
      showToast('Tarifas de custodia guardadas.', 'success');
    } catch (err) {
      setError(mensajeDe(err, 'No se pudieron guardar las tarifas. Intenta de nuevo.'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="cfg-custodia">
      <ErrorBanner mensaje={error} />
      {!puede && (
        <p className="cfg-aviso-lectura" role="note">
          <strong>Solo lectura.</strong> Estas tarifas son costos internos: las cambia un administrador o gerente de la empresa.
        </p>
      )}
      <p style={{ fontSize: 13, color: '#4a5568' }}>
        Valores con los que arranca la calculadora de <strong>Custodia móvil</strong> del Cotizador. Si cambias una tarifa, las cotizaciones ya guardadas
        <strong> no se mueven</strong>: conservan el precio con el que se hicieron (se pueden recalcular una por una).
      </p>

      <h4>Vehículo y combustible</h4>
      <div className="cus-fila">
        {num('combustibleGalon', 'Combustible ($/galón)')}
        {num('rendimientoKmGalon', 'Rendimiento (km/galón)', 'Considera carga, terreno y ciudad.')}
        {num('mantenimientoKm', 'Mantenimiento propio ($/km)')}
        {num('depreciacionKm', 'Depreciación propia ($/km)')}
        {num('alquilerDia', 'Alquiler del vehículo ($/día)')}
        {num('seguroAlquilerDia', 'Seguro del alquiler ($/día)')}
        {num('cargoKmAlquilado', 'Cargo por km alquilado ($/km)', 'Solo si el contrato de alquiler lo cobra.')}
        {num('esperaVehiculoHora', 'Espera del vehículo ($/hora)', 'Costo de tenerlo detenido, por vehículo.')}
      </div>

      <h4>Personal por viaje, según región</h4>
      <div className="cfg-lista">
        {t.regiones.map((r, i) => (
          <div className="cfg-lista-fila" key={i}>
            <input
              value={r.nombre}
              disabled={!puede}
              maxLength={40}
              aria-label="Nombre de la región"
              onChange={(e) => setT({ ...t, regiones: t.regiones.map((x, k) => (k === i ? { ...x, nombre: e.target.value } : x)) })}
            />
            <NumInput
              value={r.agente}
              min={0}
              disabled={!puede}
              ariaLabel={`Tarifa del agente en ${r.nombre || 'la región'}`}
              onCommit={(n) => setT({ ...t, regiones: t.regiones.map((x, k) => (k === i ? { ...x, agente: n ?? 0 } : x)) })}
            />
            <small>$ por agente y viaje</small>
            {puede && (
              <button
                type="button"
                className="btn-secondary icon-btn"
                title="Quitar región"
                aria-label={`Quitar la región ${r.nombre}`}
                disabled={t.regiones.length <= 1}
                onClick={() => setT({ ...t, regiones: t.regiones.filter((_, k) => k !== i) })}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
        {puede && (
          <button type="button" className="btn-secondary" onClick={() => setT({ ...t, regiones: [...t.regiones, { nombre: '', agente: 0 }] })}>
            <Plus size={14} /> Agregar región
          </button>
        )}
      </div>
      <div className="cus-fila" style={{ marginTop: 10 }}>
        {num('adicionalChofer', 'Adicional por chofer ($/viaje)', 'El chofer cobra la tarifa de la región más este valor.')}
        {num('minAgentes', 'Mínimo de custodios por servicio', 'Sin llegar a este número no se puede cotizar. Los choferes no cuentan.', 20)}
      </div>

      <h4>Viáticos y costos fijos</h4>
      <div className="cus-fila">
        {num('comida', 'Alimentación por comida ($)')}
        {num('hospedaje', 'Hospedaje por noche ($)')}
        {num('seguroOperacion', 'Seguro de la operación ($)')}
        {num('administracionFija', 'Administración fija ($)', 'Coordinación, planificación y control.')}
        {num('equipos', 'Equipos y comunicaciones ($)', 'Radio, GPS, monitoreo.')}
      </div>

      <h4>Política comercial</h4>
      <div className="cus-fila">
        {num('imprevistosPct', 'Imprevistos (%)', 'Reserva sobre el costo directo.', 100)}
        {num('margenPct', 'Margen sobre el precio (%)', 'Precio = costo ÷ (1 − margen). 30 % = de cada $100, $30 son utilidad. No es un recargo sobre el costo.', 95)}
        {num('ivaPct', 'IVA (%)', 'Confirma con contabilidad si la custodia lleva IVA y a qué tasa.', 100)}
      </div>

      <h4>Extras opcionales</h4>
      <p style={{ fontSize: 12.5, color: '#718096', marginTop: 0 }}>
        Costos que no son parte de la plantilla básica (recargo nocturno, pernocta, seguro de carga…). El vendedor los marca en cada cotización solo si aplican.
        «Fijo» multiplica el valor por la cantidad; «Porcentaje» es un % del costo normal. Un extra con valor 0 no suma nada.
      </p>
      <div className="cfg-lista">
        {t.extras.map((x) => (
          <div className="cfg-lista-fila cfg-extra" key={x.id}>
            <input value={x.nombre} disabled={!puede} maxLength={80} aria-label="Nombre del extra" onChange={(e) => cambiarExtra(x.id, { nombre: e.target.value })} />
            <select value={x.modo} disabled={!puede} aria-label="Tipo de extra" onChange={(e) => cambiarExtra(x.id, { modo: e.target.value as ExtraCustodia['modo'] })}>
              <option value="FIJO">Fijo ($)</option>
              <option value="PORCENTAJE">Porcentaje (%)</option>
            </select>
            <NumInput value={x.valor} min={0} max={x.modo === 'PORCENTAJE' ? 100 : undefined} disabled={!puede} ariaLabel={`Valor de ${x.nombre}`} onCommit={(n) => cambiarExtra(x.id, { valor: n ?? 0 })} />
            <input value={x.unidad} disabled={!puede || x.modo === 'PORCENTAJE'} maxLength={30} placeholder="por…" aria-label="Qué cuenta la cantidad" onChange={(e) => cambiarExtra(x.id, { unidad: e.target.value })} />
            {puede && (
              <button type="button" className="btn-secondary icon-btn" title="Quitar extra" aria-label={`Quitar ${x.nombre}`} onClick={() => setT({ ...t, extras: t.extras.filter((e) => e.id !== x.id) })}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
        {puede && (
          <button type="button" className="btn-secondary" onClick={() => setT({ ...t, extras: [...t.extras, { id: nuevoId(), nombre: '', modo: 'FIJO', valor: 0, unidad: '' }] })}>
            <Plus size={14} /> Agregar extra
          </button>
        )}
      </div>

      {puede && (
        <button type="button" className="auth-btn" style={{ marginTop: 16 }} disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando...' : 'Guardar tarifas'}
        </button>
      )}
    </div>
  );
}
