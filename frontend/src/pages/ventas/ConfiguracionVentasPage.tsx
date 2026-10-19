import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ErrorBanner from '../../components/common/ErrorBanner';
import ConexionesConfigSection from '../../components/ventas/ConexionesConfigSection';
import MotivosCatalogo from '../../components/ventas/MotivosCatalogo';
import ServiciosConfigSection from '../../components/ventas/ServiciosConfigSection';
import { useCanalesLead } from '../../hooks/useCanalesLead';
import { usePerm } from '../../contexts/PermissionsContext';
import { GRUPOS_MOTIVOS, type GrupoMotivoClave } from '../../utils/motivosCierre';
import {
  getConfiguracionVentas,
  getServicios,
  type ConfiguracionVentas,
  type SalesServicio,
} from '../../services/ventas.service';

const GRUPO_LABEL = { ANUNCIO: 'Anuncios pagados', WEB: 'Sitio web', DIRECTO: 'Contacto directo' } as const;

const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

type Pestana = 'conexiones' | 'servicios' | 'descartes' | 'perdidas' | 'contratos' | 'fuentes';

// Cada pestaña de motivos es uno de los tres niveles del embudo.
const MOTIVOS_POR_PESTANA: Partial<Record<Pestana, GrupoMotivoClave>> = {
  descartes: 'POSIBLE_CLIENTE',
  perdidas: 'OPORTUNIDAD',
  contratos: 'CONTRATO',
};

const tituloMotivos = (clave: GrupoMotivoClave) => GRUPOS_MOTIVOS.find((g) => g.clave === clave)?.titulo ?? '';

const PESTANAS: { key: Pestana; label: string }[] = [
  { key: 'conexiones', label: 'Cómo llegan los posibles clientes' },
  { key: 'servicios', label: 'Servicios' },
  { key: 'descartes', label: tituloMotivos('POSIBLE_CLIENTE') },
  { key: 'perdidas', label: tituloMotivos('OPORTUNIDAD') },
  { key: 'contratos', label: tituloMotivos('CONTRATO') },
  { key: 'fuentes', label: 'Fuentes de posibles clientes' },
];

// Todo lo que una empresa cambia para usar el CRM a su manera. Se reparte en pestañas
// (antes era una página larga): «Conexiones» abre primero y lleva dentro Google Ads, el
// formulario web con sus landings y las claves. Lo ve cualquiera con acceso a Ventas; guarda
// quien tiene «puede editar» en Ventas (el administrador de la empresa lo asigna por usuario),
// sin depender de Sistemas.
export default function ConfiguracionVentasPage() {
  const { canales } = useCanalesLead();
  const { canWrite } = usePerm();
  const puedeEditar = canWrite('VENTAS');
  const [params, setParams] = useSearchParams();
  const pedida = params.get('tab') as Pestana | null;
  const pestana: Pestana = PESTANAS.some((p) => p.key === pedida) ? (pedida as Pestana) : 'conexiones';
  const elegir = (p: Pestana) => setParams(p === 'conexiones' ? {} : { tab: p }, { replace: true });

  const [config, setConfig] = useState<ConfiguracionVentas | null>(null);
  const [servicios, setServicios] = useState<SalesServicio[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    try {
      const [c, s] = await Promise.all([getConfiguracionVentas(), getServicios()]);
      setConfig(c);
      setServicios(s);
    } catch (err: any) {
      setError(mensajeDe(err, 'No se pudo cargar la configuración. Intenta de nuevo.'));
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  const ayuda = { fontSize: 13, color: '#666', margin: '0 0 12px' } as const;
  const grupoMotivos = MOTIVOS_POR_PESTANA[pestana];

  return (
    <div className="page-container">
      <div className="page-title-row">
        <div>
          <p className="page-eyebrow">Ventas y CRM</p>
          <h1>Configuración</h1>
        </div>
      </div>
      {!puedeEditar && (
        <p style={{ ...ayuda, margin: '-6px 0 10px' }}>
          <strong>Estás en solo lectura: para cambiar algo, pide a un administrador de tu empresa que te dé permiso de edición en Ventas.</strong>
        </p>
      )}

      <div role="tablist" aria-label="Secciones de la configuración"
        style={{ display: 'flex', gap: 2, borderBottom: '1px solid #e2e8f0', overflowX: 'auto', marginBottom: 16 }}>
        {PESTANAS.map((p) => {
          const activa = pestana === p.key;
          return (
            <button
              key={p.key} type="button" role="tab" aria-selected={activa}
              onClick={() => elegir(p.key)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                padding: '10px 14px', fontSize: 14, fontWeight: activa ? 700 : 500,
                color: activa ? '#2b6cb0' : '#718096',
                borderBottom: activa ? '2px solid #2b6cb0' : '2px solid transparent', marginBottom: -1,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <ErrorBanner mensaje={error} />

      {cargando || !config ? (
        <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
      ) : (
        <div role="tabpanel">
          {pestana === 'conexiones' && (
            <ConexionesConfigSection config={config} servicios={servicios} puedeEditar={puedeEditar} onRecargar={cargar} />
          )}

          {pestana === 'servicios' && (
            <ServiciosConfigSection puedeEditar={puedeEditar} onChanged={() => getServicios().then(setServicios).catch(() => {})} />
          )}

          {grupoMotivos && (
            <div id="motivos">
              <p style={ayuda}>
                El embudo se pierde en tres lugares y cada uno tiene SU lista de motivos (cada una en su pestaña). Así se puede analizar por separado en qué nivel y por qué se va la gente. Si un motivo ya se usó no se borra: se desactiva para que deje de ofrecerse sin perder lo registrado.
              </p>
              <MotivosCatalogo key={grupoMotivos} grupos={[grupoMotivos]} puedeEditar={puedeEditar} />
            </div>
          )}

          {pestana === 'fuentes' && (
            <div className="admin-section">
              <p style={ayuda}>
                Estas son las fuentes que ofrece «Nuevo posible cliente» y que el CRM reconoce solo cuando llega uno por la web (por el anuncio del que vino). Todo posible cliente lleva una fuente. La lista es fija; para conectar una fuente nueva ve a «Cómo llegan los posibles clientes».
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {canales.map((c) => (
                  <span key={c.key} className="status-badge" style={{ background: '#edf2f7', color: '#2d3748' }} title={GRUPO_LABEL[c.grupo]}>
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p style={{ ...ayuda, margin: '18px 0 0', paddingTop: 12, borderTop: '1px solid #edf2f7' }}>
            Las <strong>etapas</strong> están en Oportunidades (botón «Etapas») y los <strong>campos</strong> de la ficha en el Directorio (botón «Campos»).
          </p>
        </div>
      )}
    </div>
  );
}
