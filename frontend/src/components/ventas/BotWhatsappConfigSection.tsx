import { useEffect, useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import ErrorBanner from '../common/ErrorBanner';
import '../../styles/conversaciones.css';
import { useToast } from '../../contexts/ToastContext';
import { getAjustesBot, guardarAjustesBot, type AjustesBot, type PilarBot } from '../../services/whatsappBot.service';

// Ejemplo para empezar (se carga en pantalla, no se guarda hasta pulsar «Guardar»): los tres pilares de Gemeseg.
// Cada empresa los cambia a su gusto; lo que se pregunte y qué cotice el bot se prueba y ajusta desde aquí.
const PILARES_EJEMPLO: PilarBot[] = [
  {
    id: 'gemeseg', nombre: 'Gemeseg (Seguridad Física)', activo: true, cotiza: ['CUSTODIA'],
    descripcion: 'Guardianía, custodia móvil y seguridad física de instalaciones, personas y mercadería',
    preguntas: [
      '¿Qué necesita proteger: unas instalaciones, personas o mercadería en tránsito?',
      '¿En qué ciudad o ruta sería el servicio?',
      '¿Cuántos guardias o custodios necesita y en qué horario?',
      '¿Desde cuándo lo necesitaría?',
    ],
  },
  {
    id: 'megamont', nombre: 'Megamont (Monitoreo)', activo: true, cotiza: [],
    descripcion: 'Monitoreo y central de alarmas',
    preguntas: ['¿Qué tipo de lugar quiere monitorear (casa, local, empresa)?', '¿En qué ciudad está?', '¿Ya tiene alarma o cámaras instaladas?'],
  },
  {
    id: 'adasmeg', nombre: 'Adasmeg (Soluciones Tecnológicas)', activo: true, cotiza: ['CATALOGO'],
    descripcion: 'Cámaras, alarmas, control de acceso y otros equipos',
    preguntas: ['¿Qué equipos o solución necesita?', '¿Cuántos puntos o cámaras serían?', '¿Necesita también la instalación?'],
  },
];

const DIAS: { n: number; label: string }[] = [
  { n: 1, label: 'Lun' }, { n: 2, label: 'Mar' }, { n: 3, label: 'Mié' }, { n: 4, label: 'Jue' },
  { n: 5, label: 'Vie' }, { n: 6, label: 'Sáb' }, { n: 7, label: 'Dom' },
];

const mensajeDe = (err: any, porDefecto: string) => {
  const m = err?.response?.data?.message;
  return (Array.isArray(m) ? m[0] : m) || porDefecto;
};

// Configuración → «Bot de WhatsApp»: lo que decide la empresa. Las credenciales de Meta NO se escriben
// aquí (van en el servidor); aquí solo se dice qué número atiende, cuándo y con qué conocimiento.
export default function BotWhatsappConfigSection({ puedeEditar }: { puedeEditar: boolean }) {
  const { showToast } = useToast();
  const [a, setA] = useState<AjustesBot | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Se edita como texto (separado por comas o líneas) y el servidor lo limpia a solo dígitos.
  const [telefonosTexto, setTelefonosTexto] = useState('');

  useEffect(() => {
    getAjustesBot().then((r) => { setA(r); setTelefonosTexto((r.telefonosPrueba ?? []).join(', ')); }).catch((err) => setError(mensajeDe(err, 'No se pudieron cargar los ajustes del bot.')));
  }, []);

  if (!a) return error ? <ErrorBanner mensaje={error} /> : <p style={{ color: '#888', fontSize: 13 }}>Cargando...</p>;

  const cambiar = (parcial: Partial<AjustesBot>) => setA({ ...a, ...parcial });
  const alternarDia = (n: number) => {
    const dias = a.horario.dias.includes(n) ? a.horario.dias.filter((d) => d !== n) : [...a.horario.dias, n].sort();
    cambiar({ horario: { ...a.horario, dias } });
  };

  const cambiarPilar = (i: number, parcial: Partial<PilarBot>) =>
    cambiar({ guion: { ...a.guion, pilares: a.guion.pilares.map((p, k) => (k === i ? { ...p, ...parcial } : p)) } });
  const alternarCotiza = (i: number, tipo: 'CATALOGO' | 'CUSTODIA') => {
    const actual = a.guion.pilares[i].cotiza;
    cambiarPilar(i, { cotiza: actual.includes(tipo) ? actual.filter((t) => t !== tipo) : [...actual, tipo] });
  };
  const anadirPilar = () =>
    cambiar({ guion: { ...a.guion, pilares: [...a.guion.pilares, { id: '', nombre: '', descripcion: '', cotiza: [], preguntas: [], activo: true }] } });
  const quitarPilar = (i: number) => cambiar({ guion: { ...a.guion, pilares: a.guion.pilares.filter((_, k) => k !== i) } });

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      const r = await guardarAjustesBot({
        phoneNumberId: a.phoneNumberId.trim(), activo: a.activo, modo: a.modo, conocimiento: a.conocimiento, horario: a.horario,
        guion: a.guion, plantilla: a.plantilla, cotizacion: a.cotizacion, telefonosPrueba: telefonosTexto as unknown as string[],
      });
      setA(r);
      setTelefonosTexto((r.telefonosPrueba ?? []).join(', '));
      showToast('Ajustes del bot guardados.', 'success');
    } catch (err) {
      setError(mensajeDe(err, 'No se pudieron guardar los ajustes. Intenta de nuevo.'));
    } finally {
      setGuardando(false);
    }
  };

  const urlWebhook = `${window.location.origin}/api/ventas/whatsapp-bot/webhook`;

  const bloque = (titulo: string, descripcion: ReactNode, campos: ReactNode) => (
    <section className="cfg-bloque">
      <div className="cfg-bloque-info">
        <h3>{titulo}</h3>
        <p>{descripcion}</p>
      </div>
      <div className="cfg-bloque-campos">{campos}</div>
    </section>
  );

  return (
    <div className="cfg-bot">
      <ErrorBanner mensaje={error} />

      {bloque('Estado', 'Si está apagado, los mensajes que lleguen se ignoran.', (
        <>
          <p className={a.conectado ? 'cfg-bot-estado cfg-bot-estado--ok' : 'cfg-bot-estado'} role="status">
            {a.conectado
              ? 'Conectado con Meta: los mensajes salen por WhatsApp.'
              : 'Aún sin conexión con Meta: en tu computador los envíos son simulados y en producción no sale ningún mensaje.'}
          </p>
          <div className="form-group">
            <label className="casilla">
              <input type="checkbox" checked={a.activo} disabled={!puedeEditar} onChange={(e) => cambiar({ activo: e.target.checked })} />
              <strong>Bot activado</strong>
            </label>
          </div>
          <div className="form-group">
            <label htmlFor="bot-modo">Cómo responde</label>
            <select id="bot-modo" value={a.modo} disabled={!puedeEditar} onChange={(e) => cambiar({ modo: e.target.value as AjustesBot['modo'] })}>
              <option value="AUTO">Automático</option>
              <option value="COPILOTO">Copiloto</option>
            </select>
            <small>
              {a.modo === 'AUTO'
                ? 'Conversa solo hasta entender qué necesita el cliente y luego lo pasa a un asesor. Las cotizaciones con precio las aprueba una persona.'
                : 'Propone cada respuesta y una persona la aprueba antes de enviarla. Útil para las primeras pruebas.'}
            </small>
          </div>
        </>
      ))}

      {bloque('Horario de los asesores', 'Hora de Ecuador. Fuera de este horario el bot toma los datos y avisa que un asesor responde el siguiente día hábil.', (
        <>
          <div className="cfg-campos-2" style={{ maxWidth: 360 }}>
            <div className="form-group">
              <label htmlFor="bot-hora-inicio">Desde</label>
              <input id="bot-hora-inicio" type="time" value={a.horario.inicio} disabled={!puedeEditar} onChange={(e) => cambiar({ horario: { ...a.horario, inicio: e.target.value } })} />
            </div>
            <div className="form-group">
              <label htmlFor="bot-hora-fin">Hasta</label>
              <input id="bot-hora-fin" type="time" value={a.horario.fin} disabled={!puedeEditar} onChange={(e) => cambiar({ horario: { ...a.horario, fin: e.target.value } })} />
            </div>
          </div>
          <div className="form-group">
            <label>Días</label>
            <div className="cfg-dias">
              {DIAS.map((d) => (
                <button key={d.n} type="button" className="cfg-dia" aria-pressed={a.horario.dias.includes(d.n)} disabled={!puedeEditar} onClick={() => alternarDia(d.n)}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ))}

      {bloque('Qué sabe el bot', 'Es lo único que usa para responder, y un cliente lo puede leer: no pongas costos internos, márgenes ni datos de otras personas.', (
        <div className="form-group">
          <label htmlFor="bot-conocimiento">Información para los clientes</label>
          <textarea
            id="bot-conocimiento" rows={10} value={a.conocimiento} disabled={!puedeEditar}
            placeholder="Servicios, ciudades donde operan, horarios, cómo contratar, preguntas frecuentes…"
            onChange={(e) => cambiar({ conocimiento: e.target.value })}
          />
          <small>Las respuestas que un asesor corrige, el bot las aprende solo.</small>
        </div>
      ))}

      {bloque('Áreas de servicio', 'Con un contacto nuevo, el bot pregunta primero cuál área le interesa y luego hace las preguntas de esa área, de a poco.', (
        <>
          <div className="form-group">
            <label htmlFor="bot-pregunta-inicial">Pregunta de apertura (opcional)</label>
            <input id="bot-pregunta-inicial" value={a.guion.preguntaInicial} disabled={!puedeEditar} placeholder="Ej.: ¿Sobre cuál de nuestras áreas quieres información?" onChange={(e) => cambiar({ guion: { ...a.guion, preguntaInicial: e.target.value } })} />
            <small>Vacía: el bot la redacta nombrando las áreas.</small>
          </div>
          {a.guion.pilares.map((p, i) => (
            <div key={i} className="cfg-bot-pilar">
              <div className="cfg-bot-pilar-cab">
                <div className="form-group">
                  <label htmlFor={`bot-area-${i}`}>Área</label>
                  <input id={`bot-area-${i}`} placeholder="Ej.: Seguridad física" value={p.nombre} disabled={!puedeEditar} onChange={(e) => cambiarPilar(i, { nombre: e.target.value })} />
                </div>
                <label className="casilla">
                  <input type="checkbox" checked={p.activo} disabled={!puedeEditar} onChange={(e) => cambiarPilar(i, { activo: e.target.checked })} /> Activa
                </label>
                {puedeEditar && (
                  <button type="button" className="btn-secondary icon-btn" title="Quitar área" aria-label={`Quitar el área ${p.nombre}`} onClick={() => quitarPilar(i)}>
                    <Trash2 size={15} color="#c53030" />
                  </button>
                )}
              </div>
              <div className="form-group">
                <label htmlFor={`bot-area-desc-${i}`}>Qué incluye</label>
                <input id={`bot-area-desc-${i}`} placeholder="El bot lo usa para explicarle al cliente" value={p.descripcion} disabled={!puedeEditar} onChange={(e) => cambiarPilar(i, { descripcion: e.target.value })} />
              </div>
              <div className="form-group">
                <label htmlFor={`bot-area-preg-${i}`}>Preguntas que hace (una por línea)</label>
                <textarea
                  id={`bot-area-preg-${i}`} rows={4} disabled={!puedeEditar} value={p.preguntas.join('\n')}
                  placeholder="Lo que el bot debe averiguar en esta área"
                  onChange={(e) => cambiarPilar(i, { preguntas: e.target.value.split('\n') })}
                />
              </div>
              <div className="form-group">
                <label>Puede cotizar</label>
                <div className="cfg-bot-pilar-fila">
                  <label className="casilla"><input type="checkbox" checked={p.cotiza.includes('CATALOGO')} disabled={!puedeEditar} onChange={() => alternarCotiza(i, 'CATALOGO')} /> Productos del Cotizador</label>
                  <label className="casilla"><input type="checkbox" checked={p.cotiza.includes('CUSTODIA')} disabled={!puedeEditar} onChange={() => alternarCotiza(i, 'CUSTODIA')} /> Custodia móvil</label>
                </div>
                <small>Sin marcar: reúne los datos y cotiza un asesor.</small>
              </div>
            </div>
          ))}
          {puedeEditar && (
            <div className="cfg-bot-pilar-fila">
              <button type="button" className="btn-secondary" onClick={anadirPilar}><Plus size={14} /> Añadir área</button>
              {a.guion.pilares.length === 0 && (
                <button type="button" className="btn-secondary" onClick={() => cambiar({ guion: { ...a.guion, pilares: PILARES_EJEMPLO } })}>
                  Cargar ejemplo de Gemeseg
                </button>
              )}
            </div>
          )}
        </>
      ))}

      {bloque('Reglas de la conversación', 'Lo que el bot revisa antes de pasar a un cliente a un asesor.', (
        <>
          <div className="form-group">
            <label htmlFor="bot-sedes">Ciudades donde opera la empresa (una por línea)</label>
            <textarea
              id="bot-sedes" rows={3} disabled={!puedeEditar} value={a.guion.sedes.join('\n')}
              placeholder={'Ej.:\nQuito\nGuayaquil'}
              onChange={(e) => cambiar({ guion: { ...a.guion, sedes: e.target.value.split('\n') } })}
            />
            <small>Si el servicio es en otra ciudad, no cotiza: lo pasa a un asesor para confirmar la cobertura. Vacía: no se revisa.</small>
          </div>
          <div className="form-group" style={{ maxWidth: 360 }}>
            <label htmlFor="bot-minimo">Mensajes mínimos del cliente</label>
            <input id="bot-minimo" type="number" min={1} max={12} value={a.guion.minimoRespuestas} disabled={!puedeEditar}
              onChange={(e) => cambiar({ guion: { ...a.guion, minimoRespuestas: Number(e.target.value) } })} />
            <small>Antes de este número (el saludo cuenta) sigue preguntando. No aplica a quejas, emergencias ni si piden una persona.</small>
          </div>
          <div className="form-group">
            <label htmlFor="bot-privacidad">Aviso de datos personales</label>
            <textarea id="bot-privacidad" rows={3} value={a.guion.privacidad} disabled={!puedeEditar} placeholder="Para qué se usan sus datos y cómo pedir que se borren." onChange={(e) => cambiar({ guion: { ...a.guion, privacidad: e.target.value } })} />
            <small>Se muestra tal cual en el primer mensaje, después de avisar que es una IA. Pendiente de revisión legal.</small>
          </div>
        </>
      ))}

      {bloque('Precios del bot', 'El bot nunca ve costos ni márgenes, y toda cotización con precio la revisa una persona antes de salir.', (
        <div className="cfg-campos-2">
          <div className="form-group">
            <label htmlFor="bot-margen-custodia">Margen en custodia móvil (%)</label>
            <input id="bot-margen-custodia" type="number" min={0} max={95} value={a.cotizacion.margenCustodiaPct} disabled={!puedeEditar}
              onChange={(e) => cambiar({ cotizacion: { ...a.cotizacion, margenCustodiaPct: Number(e.target.value) } })} />
            <small>Sobre el precio.</small>
          </div>
          <div className="form-group">
            <label htmlFor="bot-margen-productos">Margen en productos (%)</label>
            <input id="bot-margen-productos" type="number" min={0} max={500} value={a.cotizacion.margenProductosPct ?? ''} disabled={!puedeEditar} placeholder="Automático"
              onChange={(e) => cambiar({ cotizacion: { ...a.cotizacion, margenProductosPct: e.target.value === '' ? null : Number(e.target.value) } })} />
            <small>Sobre el costo. Vacío: la ganancia de cada proveedor del Cotizador.</small>
          </div>
        </div>
      ))}

      {bloque('Conexión con Meta', 'Datos técnicos del número de WhatsApp. Las claves secretas no se escriben aquí: las guarda Sistemas en el servidor.', (
        <>
          <div className="form-group">
            <label htmlFor="bot-numero">Identificador del número</label>
            <input id="bot-numero" value={a.phoneNumberId} disabled={!puedeEditar} placeholder="Ej.: 123456789012345" onChange={(e) => cambiar({ phoneNumberId: e.target.value })} />
            <small>En Meta → WhatsApp → Configuración de la API. No es el número de teléfono.</small>
          </div>
          <div className="form-group">
            <label htmlFor="bot-telefonos-prueba">Teléfonos de prueba</label>
            <input id="bot-telefonos-prueba" value={telefonosTexto} disabled={!puedeEditar} placeholder="Ej.: 0979459793, +593 99 123 4567" onChange={(e) => setTelefonosTexto(e.target.value)} />
            <small>Conversan con el bot como un cliente, pero no avisan al equipo. Sepáralos con comas y quítalos al terminar.</small>
          </div>
          <div className="form-group">
            <label htmlFor="bot-plantilla">Plantilla para escribir pasadas 24 horas</label>
            <div className="cfg-campos-2" style={{ gridTemplateColumns: 'minmax(0, 1fr) 90px' }}>
              <input id="bot-plantilla" placeholder="nombre_de_la_plantilla" value={a.plantilla.nombre} disabled={!puedeEditar} onChange={(e) => cambiar({ plantilla: { ...a.plantilla, nombre: e.target.value } })} />
              <input aria-label="Idioma de la plantilla" placeholder="es" value={a.plantilla.idioma} disabled={!puedeEditar} onChange={(e) => cambiar({ plantilla: { ...a.plantilla, idioma: e.target.value } })} />
            </div>
            <label className="casilla">
              <input type="checkbox" checked={a.plantilla.conNombre} disabled={!puedeEditar} onChange={(e) => cambiar({ plantilla: { ...a.plantilla, conNombre: e.target.checked } })} />
              Lleva el nombre del cliente en {'{{1}}'}
            </label>
            <small>WhatsApp solo deja escribir primero con una plantilla aprobada por Meta. Vacía: no se usa.</small>
          </div>
          <details className="cfg-bot-meta">
            <summary>Datos para conectar el webhook en Meta</summary>
            <p>URL de devolución de llamada: <code>{urlWebhook}</code></p>
            <p>
              El token de verificación y los secretos van en el servidor (<code>WHATSAPP_VERIFY_TOKEN</code>, <code>WHATSAPP_APP_SECRET</code>,{' '}
              <code>WHATSAPP_ACCESS_TOKEN</code>). Suscribe el campo «messages».
            </p>
          </details>
        </>
      ))}

      {puedeEditar && (
        <div className="cfg-guardar">
          <button type="button" className="auth-btn" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
          <small>Nada cambia hasta que guardes.</small>
        </div>
      )}
    </div>
  );
}
