import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, FileText, HardDrive, HelpCircle, KeyRound, Mail, Pencil, Plus, Route, Smartphone } from 'lucide-react';
import PageTabs from '../../components/common/PageTabs';
import ErrorBanner from '../../components/common/ErrorBanner';
import FirmasConfig from '../../components/custodias/config/FirmasConfig';
import RutasConfig from '../../components/custodias/config/RutasConfig';
import CamposConfig from '../../components/custodias/config/CamposConfig';
import FotosConfig from '../../components/custodias/config/FotosConfig';
import CorreoConfig from '../../components/custodias/config/CorreoConfig';
import CelularesConfig from '../../components/custodias/config/CelularesConfig';
import PinesConfig from '../../components/custodias/config/PinesConfig';
import EspacioConfig from '../../components/custodias/config/EspacioConfig';
import { getConfigCustodias } from '../../services/custodia.service';
import { usePermissions } from '../../hooks/usePermissions';
import type { ConfigCustodias } from '../../types/custodiaGuia';

type Pestana = 'firmas' | 'rutas' | 'campos' | 'fotos' | 'correo' | 'celulares' | 'pines' | 'espacio';

const PESTANAS = [
  { key: 'firmas' as const, label: 'Firmas', icon: Pencil },
  { key: 'rutas' as const, label: 'Rutas', icon: Route },
  { key: 'campos' as const, label: 'Campos de la guía', icon: FileText },
  { key: 'fotos' as const, label: 'Fotos', icon: Camera },
  { key: 'correo' as const, label: 'Correo', icon: Mail },
  { key: 'celulares' as const, label: 'Celulares', icon: Smartphone },
  { key: 'pines' as const, label: 'Custodios con PIN', icon: KeyRound },
  { key: 'espacio' as const, label: 'Espacio', icon: HardDrive },
];

const PASOS: { titulo: string; texto: string }[] = [
  { titulo: 'Firmas', texto: 'En qué momento firma el cliente la guía (al salir, al llegar o en los dos), si la firma es obligatoria y qué clientes tienen un acuerdo distinto al general. Cada viaje también puede cambiarlo.' },
  { titulo: 'Rutas', texto: 'Los recorridos que se repiten, con sus puntos de control y los minutos estimados entre uno y otro. Al elegir una ruta en un viaje, la hoja de ruta sale con esos puntos.' },
  { titulo: 'Campos de la guía', texto: 'Los datos que se piden además de los fijos, como los sellos de los contenedores. Cada campo dice dónde va (viaje, contenedor u hacienda), qué tipo de dato es, si es obligatorio, quién lo llena y si sale en el PDF. Desactivar un campo no borra lo que ya se escribió en los viajes. Aquí también se cambia el prefijo de la numeración automática de las guías (por ejemplo GEM-0001).' },
  { titulo: 'Fotos', texto: 'Las fotos que el celular le pide al custodio al salir y al llegar, para cada tipo de servicio (Puerto, Hacienda, VIP). Cada una puede ser obligatoria (si falta, el custodio escribe por qué) y admitir varias fotos, como la carga vista desde varios lados. El custodio puede tomarlas con la cámara o subirlas de la galería, y siempre puede agregar fotos sueltas.' },
  { titulo: 'Correo', texto: 'Las copias, el asunto y el texto que vienen escritos al enviar una guía al cliente. Puedes usar {guia}, {cliente} y {fecha}.' },
  { titulo: 'Celulares', texto: 'Los celulares de la empresa que usan los custodios en ruta. Cada uno se vincula una sola vez con un código de 10 minutos. Al crear un viaje eliges su celular y el viaje aparece solo ahí. «Desvincular» cierra sus sesiones y lo deja sin viajes; si hace falta usarlo otra vez, «Vincular de nuevo» da un código nuevo.' },
  { titulo: 'Custodios con PIN', texto: 'Quién puede entrar al celular del viaje: cada persona usa su cédula y un PIN de 4 dígitos. Se muestra una sola vez al crearlo. Todo lo que hace en el celular queda a su nombre.' },
  { titulo: 'Espacio', texto: 'Cuántas fotos de los viajes hay guardadas y cuánto ocupan. Un administrador puede borrar las fotos de los viajes anteriores a una fecha; las firmas y los PDF enviados no cambian.' },
];

function Ayuda({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-ventas-md" role="dialog" aria-modal="true" aria-label="Cómo funciona la configuración de Custodias" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Configuración de Custodias</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          {PASOS.map((p) => (
            <div key={p.titulo}>
              <strong style={{ color: '#1e3a5f' }}>{p.titulo}</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.88rem', color: '#4a5568', lineHeight: 1.5 }}>{p.texto}</p>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="auth-btn" onClick={onClose}>Entendido</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Pestaña «Custodias» de Operaciones › Configuración (Fases 1 y 2 de «Custodias en campo»): lo que se ajusta una vez y usan
 * los viajes y la guía digital. Vive dentro de la Configuración de Operaciones para que el módulo tenga UNA sola
 * configuración. Quien solo puede ver Operaciones lo ve en solo lectura. La sub-pestaña viaja en `?sub=`.
 */
export default function CustodiasConfiguracion() {
  const { canWrite } = usePermissions();
  const soloLectura = !canWrite('OPERACIONES');
  const [params, setParams] = useSearchParams();
  const pedida = params.get('sub');
  const pestana: Pestana = PESTANAS.some((p) => p.key === pedida) ? (pedida as Pestana) : 'firmas';

  const [config, setConfig] = useState<ConfigCustodias | null>(null);
  const [error, setError] = useState('');
  const [ayuda, setAyuda] = useState(false);
  // «Nueva ruta» / «Nuevo campo» abren la ventana de la sub-pestaña: llegan como una señal que sube.
  const [nuevaRuta, setNuevaRuta] = useState(0);
  const [nuevoCampo, setNuevoCampo] = useState(0);
  const [nuevoCelular, setNuevoCelular] = useState(0);
  const [nuevoPin, setNuevoPin] = useState(0);

  const cargarConfig = useCallback(() => {
    getConfigCustodias()
      .then((c) => { setConfig(c); setError(''); })
      .catch(() => setError('No se pudo cargar la configuración. Inténtalo de nuevo.'));
  }, []);
  useEffect(cargarConfig, [cargarConfig]);

  const principal = !soloLectura && pestana === 'rutas'
    ? <button type="button" className="auth-btn" onClick={() => setNuevaRuta((n) => n + 1)}><Plus size={16} /> Nueva ruta</button>
    : !soloLectura && pestana === 'campos'
      ? <button type="button" className="auth-btn" onClick={() => setNuevoCampo((n) => n + 1)}><Plus size={16} /> Nuevo campo</button>
      : !soloLectura && pestana === 'celulares'
        ? <button type="button" className="auth-btn" onClick={() => setNuevoCelular((n) => n + 1)}><Plus size={16} /> Vincular celular</button>
        : !soloLectura && pestana === 'pines'
          ? <button type="button" className="auth-btn" onClick={() => setNuevoPin((n) => n + 1)}><Plus size={16} /> Dar PIN</button>
          : null;

  // El «?» y el botón principal viajan a la barra de cada sub-pestaña (a la derecha de «Columnas» y la escoba).
  const botonAyuda = (
    <button type="button" className="btn-secondary icon-btn" onClick={() => setAyuda(true)} title="Cómo funciona" aria-label="Cómo funciona la configuración de Custodias">
      <HelpCircle size={18} />
    </button>
  );
  const botones = <>{botonAyuda}{principal}</>;

  const cambiar = (key: Pestana) => setParams((prev) => {
    const sig = new URLSearchParams(prev);
    sig.set('sub', key);
    return sig;
  }, { replace: true });

  return (
    <>
      {/* Debajo de las pestañas va UNA sola barra (la de cada sub-pestaña): buscador a la izquierda; «Columnas», escoba, «?» y botón principal a la derecha. */}
      <PageTabs label="Configuración de Custodias" tabs={PESTANAS} value={pestana} onChange={cambiar} estilo="ventana" />
      <div style={{ height: 12 }} />

      {soloLectura && <p className="page-title-help" style={{ margin: '4px 0 8px' }}>Tienes acceso de solo lectura.</p>}
      <ErrorBanner mensaje={error} />

      {pestana === 'firmas' && config && (
        <FirmasConfig config={config} soloLectura={soloLectura} onConfig={setConfig} onRecargar={cargarConfig} ayuda={botonAyuda} />
      )}
      {pestana === 'fotos' && config && (
        <FotosConfig config={config} soloLectura={soloLectura} onConfig={setConfig} ayuda={botonAyuda} />
      )}
      {pestana === 'correo' && config && (
        <CorreoConfig config={config} soloLectura={soloLectura} onConfig={setConfig} ayuda={botonAyuda} />
      )}
      {(pestana === 'firmas' || pestana === 'fotos' || pestana === 'correo') && !config && !error && <div className="loading-state">Cargando...</div>}
      {pestana === 'rutas' && <RutasConfig soloLectura={soloLectura} solicitudNueva={nuevaRuta} botones={botones} />}
      {pestana === 'campos' && <CamposConfig soloLectura={soloLectura} solicitudNueva={nuevoCampo} botones={botones} />}
      {pestana === 'celulares' && <CelularesConfig soloLectura={soloLectura} solicitudNueva={nuevoCelular} botones={botones} />}
      {pestana === 'pines' && <PinesConfig soloLectura={soloLectura} solicitudNueva={nuevoPin} botones={botones} />}
      {pestana === 'espacio' && <EspacioConfig ayuda={botonAyuda} />}

      {ayuda && <Ayuda onClose={() => setAyuda(false)} />}
    </>
  );
}
