import { useEffect, useState, type ComponentType } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Inbox, ListX, Package, Plug } from 'lucide-react';
import ErrorBanner from '../../components/common/ErrorBanner';
import PageTabs from '../../components/common/PageTabs';
import VentasPageHeader from '../../components/ventas/VentasPageHeader';
import ConexionesConfigSection from '../../components/ventas/ConexionesConfigSection';
import MotivosCatalogo from '../../components/ventas/MotivosCatalogo';
import ServiciosConfigSection from '../../components/ventas/ServiciosConfigSection';
import { useCanalesLead } from '../../hooks/useCanalesLead';
import { usePerm } from '../../contexts/PermissionsContext';
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

// `?tab=` se conserva tal cual: hay enlaces guardados. `descartes`, `perdidas` y `contratos`
// eran listas de motivos aparte; hoy las tres se ven a la vez bajo «Motivos de cierre».
type Seccion = 'conexiones' | 'fuentes' | 'servicios' | 'descartes' | 'perdidas' | 'contratos';
type Pestana = 'conexiones' | 'fuentes' | 'servicios' | 'motivos';

type Icono = ComponentType<{ size?: number }>;

const PESTANAS: { key: Pestana; label: string; icono: Icono; primera: Seccion }[] = [
  { key: 'conexiones', label: 'Conexiones', icono: Plug, primera: 'conexiones' },
  { key: 'fuentes', label: 'Fuentes', icono: Inbox, primera: 'fuentes' },
  { key: 'servicios', label: 'Servicios', icono: Package, primera: 'servicios' },
  { key: 'motivos', label: 'Motivos de cierre', icono: ListX, primera: 'descartes' },
];

const SECCIONES: Seccion[] = ['conexiones', 'fuentes', 'servicios', 'descartes', 'perdidas', 'contratos'];
const SECCIONES_MOTIVOS: Seccion[] = ['descartes', 'perdidas', 'contratos'];

const pestanaDe = (s: Seccion): Pestana => (SECCIONES_MOTIVOS.includes(s) ? 'motivos' : (s as Pestana));

// Todo lo que una empresa cambia para usar el CRM a su manera. Lo ve cualquiera con acceso a
// Ventas; guarda quien tiene «puede editar» en Ventas (el administrador de la empresa lo asigna
// por usuario), sin depender de Sistemas.
export default function ConfiguracionVentasPage() {
  const navigate = useNavigate();
  const { canales } = useCanalesLead();
  const { canWrite } = usePerm();
  const puedeEditar = canWrite('VENTAS');
  const [params, setParams] = useSearchParams();
  const pedida = params.get('tab') as Seccion | null;
  const seccion: Seccion = pedida && SECCIONES.includes(pedida) ? pedida : 'conexiones';
  const pestana = pestanaDe(seccion);
  const elegir = (s: Seccion) => setParams(s === 'conexiones' ? {} : { tab: s }, { replace: true });

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

  // Título y explicación de lo que se está viendo.
  const cabecera: { titulo: string; ayuda: string; detalle?: string } =
    pestana === 'motivos'
      ? {
        titulo: 'Motivos de cierre',
        ayuda: 'El embudo se pierde en tres lugares y cada uno tiene SU lista de motivos. Así se puede analizar por separado en qué nivel y por qué se va la gente.',
        detalle: 'Si un motivo ya se usó no se borra: se desactiva para que deje de ofrecerse sin perder lo registrado.',
      }
      : pestana === 'fuentes'
        ? {
          titulo: 'Fuentes de posibles clientes',
          ayuda: 'Las fuentes que ofrece «Nuevo posible cliente» y que el CRM reconoce solo cuando llega uno por la web. Todo posible cliente lleva una fuente.',
          detalle: 'La lista es fija. Para conectar una fuente nueva ve a Conexiones.',
        }
        : pestana === 'servicios'
          ? {
            titulo: 'Servicios que ofrecemos',
            ayuda: 'Lo que vende la empresa. Se eligen con casillas en Nueva oportunidad y en Contratos; aquí se crean, renombran o desactivan.',
            detalle: 'Si un servicio deja de ofrecerse, desactívalo: ya no sale para elegir en los nuevos, pero se conserva en los contratos que ya lo tienen.',
          }
          : {
            titulo: 'Cómo llegan los posibles clientes',
            ayuda: 'Las puertas por las que entran contactos al CRM: tu página web, tus landings y los anuncios. Abre una para ver su estado, sus claves y sus datos.',
          };

  return (
    <div className="page-container">
      <VentasPageHeader
        title="Configuración"
        description="Lo que la empresa ajusta del CRM: conexiones, fuentes, servicios y motivos de cierre."
      />

      <PageTabs
        label="Secciones de la configuración" value={pestana}
        onChange={(k) => elegir(PESTANAS.find((p) => p.key === k)!.primera)}
        tabs={PESTANAS.map((p) => ({ key: p.key, label: p.label, icon: p.icono }))}
      />

      <section className="cfg-panel" aria-labelledby="cfg-titulo" data-tablas-vivas="off">
        <header className="cfg-panel-cab">
          <h2 id="cfg-titulo">{cabecera.titulo}</h2>
          <p>{cabecera.ayuda}</p>
          {cabecera.detalle && <p>{cabecera.detalle}</p>}
        </header>

        {!puedeEditar && (
          <p className="cfg-aviso-lectura" role="note">
            <strong>Estás en solo lectura.</strong> Para cambiar algo, pide a un administrador de tu empresa que te dé permiso de edición en Ventas.
          </p>
        )}

        <ErrorBanner mensaje={error} />

        {cargando || !config ? (
          <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>
        ) : (
          <>
            {seccion === 'conexiones' && (
              <ConexionesConfigSection config={config} servicios={servicios} puedeEditar={puedeEditar} onRecargar={cargar} />
            )}

            {seccion === 'servicios' && (
              <ServiciosConfigSection puedeEditar={puedeEditar} onChanged={() => getServicios().then(setServicios).catch(() => {})} />
            )}

            {pestana === 'motivos' && <MotivosCatalogo puedeEditar={puedeEditar} />}

            {seccion === 'fuentes' && (
              <div className="cfg-fuentes">
                {(['ANUNCIO', 'WEB', 'DIRECTO'] as const).map((g) => {
                  const delGrupo = canales.filter((c) => c.grupo === g);
                  if (delGrupo.length === 0) return null;
                  return (
                    <div className="cfg-fuente-grupo" key={g}>
                      <h3>{GRUPO_LABEL[g]}</h3>
                      <ul>
                        {delGrupo.map((c) => (
                          <li key={c.key}>
                            {c.label}
                            {c.campos.length > 0 && <small>Pide: {c.campos.map((x) => x.label.toLowerCase()).join(', ')}</small>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      <p className="cfg-pie">
        Las <strong>etapas</strong> se cambian en <button type="button" onClick={() => navigate('/ventas/oportunidades')}>Oportunidades</button> (botón «Etapas») y los{' '}
        <strong>campos</strong> de la ficha en el <button type="button" onClick={() => navigate('/ventas/clientes')}>Directorio</button> (botón «Campos»).
      </p>
    </div>
  );
}
