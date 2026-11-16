import { useCallback, useEffect, useMemo, useState } from 'react';
import ErrorBanner from '../common/ErrorBanner';
import FilterField from '../common/FilterField';
import { useToast } from '../../contexts/ToastContext';
import { diaEcuador } from '../../utils/rangoFechas';
import {
  getMetas,
  guardarMetas,
  type MetasListado,
  type TipoMeta,
} from '../../services/ventas.service';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const TIPOS: { key: TipoMeta; label: string; paso: string }[] = [
  { key: 'MONTO', label: 'Ventas (USD)', paso: '0.01' },
  { key: 'CLIENTES_NUEVOS', label: 'Clientes nuevos', paso: '1' },
  { key: 'IMPACTOS', label: 'Impactos', paso: '1' },
];

const llave = (userId: number | null, kind: TipoMeta) => `${userId ?? 0}|${kind}`;
const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

// Configuración → Metas: lo que gerencia espera vender en un mes o en un año, de la empresa y de cada persona.
// Solo administradores y gerentes escriben; el resto ve su propia meta y la de la empresa. El Dashboard → Metas
// compara contra estos números. La meta de una semana es la mensual entre 4.
export default function MetasConfigSection({ puedeEditar }: { puedeEditar: boolean }) {
  const { showToast } = useToast();
  const hoy = diaEcuador();
  const [tipo, setTipo] = useState<'MES' | 'ANIO'>('MES');
  const [year, setYear] = useState(Number(hoy.slice(0, 4)));
  const [month, setMonth] = useState(Number(hoy.slice(5, 7)));
  const [datos, setDatos] = useState<MetasListado | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const aTexto = (d: MetasListado) => {
    const r: Record<string, string> = {};
    for (const m of d.metas) r[llave(m.userId, m.kind)] = String(m.target);
    return r;
  };

  const cargar = useCallback(async () => {
    setError('');
    try {
      const d = await getMetas({ periodKind: tipo, year, month: tipo === 'MES' ? month : undefined });
      setDatos(d);
      setValores(aTexto(d));
      setOriginal(aTexto(d));
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudieron cargar las metas. Intenta de nuevo.'));
    }
  }, [tipo, year, month]);
  useEffect(() => { cargar(); }, [cargar]);

  const editable = !!datos?.editable && puedeEditar;
  const sucio = useMemo(() => {
    const claves = new Set([...Object.keys(valores), ...Object.keys(original)]);
    return [...claves].some((k) => (valores[k] ?? '').trim() !== (original[k] ?? ''));
  }, [valores, original]);

  const years = [Number(hoy.slice(0, 4)) - 1, Number(hoy.slice(0, 4)), Number(hoy.slice(0, 4)) + 1];

  // El periodo anterior: el mes de antes (o el diciembre del año anterior) o el año de antes.
  const anterior = tipo === 'MES'
    ? { year: month === 1 ? year - 1 : year, month: month === 1 ? 12 : month - 1 }
    : { year: year - 1, month: undefined as number | undefined };
  const etiquetaAnterior = tipo === 'MES' ? `${MESES[anterior.month! - 1].toLowerCase()} de ${anterior.year}` : String(anterior.year);

  const copiarAnterior = async () => {
    setError('');
    try {
      const d = await getMetas({ periodKind: tipo, year: anterior.year, month: anterior.month });
      if (d.metas.length === 0) {
        showToast(`No hay metas fijadas en ${etiquetaAnterior}.`, 'info');
        return;
      }
      setValores(aTexto(d));
      showToast(`Se copiaron las metas de ${etiquetaAnterior}. Revísalas y guarda.`, 'info');
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudieron copiar las metas del periodo anterior.'));
    }
  };

  const guardar = async () => {
    if (!datos) return;
    setError('');
    const filas: { userId: number | null; kind: TipoMeta; target: number | null }[] = [];
    const personas: (number | null)[] = [null, ...datos.vendedores.map((v) => v.id)];
    for (const uid of personas) {
      for (const t of TIPOS) {
        const k = llave(uid, t.key);
        const actual = (valores[k] ?? '').trim();
        if (actual === (original[k] ?? '')) continue;
        if (actual === '') {
          filas.push({ userId: uid, kind: t.key, target: null });
          continue;
        }
        const n = Number(actual.replace(',', '.'));
        if (!Number.isFinite(n) || n < 0) {
          setError('Las metas deben ser números de 0 en adelante.');
          return;
        }
        filas.push({ userId: uid, kind: t.key, target: n });
      }
    }
    if (filas.length === 0) {
      showToast('No hay cambios para guardar.', 'info');
      return;
    }
    setGuardando(true);
    try {
      const d = await guardarMetas({ periodKind: tipo, year, month: tipo === 'MES' ? month : undefined, metas: filas });
      setDatos(d);
      setValores(aTexto(d));
      setOriginal(aTexto(d));
      showToast('Metas guardadas.', 'success');
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudieron guardar las metas. Intenta de nuevo.'));
    } finally {
      setGuardando(false);
    }
  };

  const filas: { id: number | null; nombre: string }[] = datos
    ? [{ id: null, nombre: 'Meta de la empresa' }, ...datos.vendedores.map((v) => ({ id: v.id, nombre: v.nombre }))]
    : [];

  return (
    <div>
      <div className="metas-config-barra">
        <FilterField label="Meta por">
          <select className="filter-select" value={tipo} disabled={sucio} onChange={(e) => setTipo(e.target.value as 'MES' | 'ANIO')}>
            <option value="MES">Mes</option>
            <option value="ANIO">Año</option>
          </select>
        </FilterField>
        {tipo === 'MES' && (
          <FilterField label="Mes">
            <select className="filter-select" value={month} disabled={sucio} onChange={(e) => setMonth(Number(e.target.value))}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </FilterField>
        )}
        <FilterField label="Año">
          <select className="filter-select" value={year} disabled={sucio} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </FilterField>
        {editable && (
          <button type="button" className="btn-secondary" onClick={copiarAnterior} disabled={guardando}>
            Copiar de {etiquetaAnterior}
          </button>
        )}
      </div>

      {sucio && (
        <p className="metas-config-ayuda" role="status">
          Tienes cambios sin guardar. Guárdalos o descártalos para cambiar de periodo.
        </p>
      )}

      <ErrorBanner mensaje={error} />

      {!datos ? (
        !error && <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
      ) : (
        <>
          {!editable && (
            <p className="cfg-aviso-lectura" role="note">
              <strong>Solo gerencia y administradores fijan las metas.</strong> Aquí ves la meta de la empresa y la tuya.
            </p>
          )}
          <div className="tasks-table-wrapper">
            <table className="tasks-table metas-config-tabla">
              <thead>
                <tr>
                  <th>Persona</th>
                  {TIPOS.map((t) => <th key={t.key}>{t.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id ?? 'empresa'} className={f.id === null ? 'metas-fila-global' : undefined}>
                    <td><span className="truncate">{f.nombre}</span></td>
                    {TIPOS.map((t) => {
                      const k = llave(f.id, t.key);
                      return (
                        <td key={t.key}>
                          {editable ? (
                            <input
                              type="number" inputMode="decimal" min={0} step={t.paso} value={valores[k] ?? ''}
                              aria-label={`${t.label} de ${f.nombre}`} placeholder="—"
                              onChange={(e) => setValores((v) => ({ ...v, [k]: e.target.value }))}
                            />
                          ) : (
                            valores[k] ?? '—'
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editable && (
            <div className="metas-config-pie">
              <button type="button" className="auth-btn" onClick={guardar} disabled={guardando || !sucio}>
                {guardando ? 'Guardando...' : 'Guardar metas'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setValores(original)} disabled={guardando || !sucio}>
                Descartar cambios
              </button>
            </div>
          )}

          <p className="metas-config-ayuda">
            Deja una casilla vacía si no hay meta de ese tipo. La meta de cada semana es la mensual dividida entre 4.
            «Ventas» suma el monto cotizado de las oportunidades aceptadas; un «impacto» es cada oportunidad aceptada; un
            «cliente nuevo» es quien compra por primera vez.
          </p>
        </>
      )}
    </div>
  );
}
