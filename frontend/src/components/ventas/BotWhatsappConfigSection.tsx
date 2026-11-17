import { useEffect, useState } from 'react';
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

  useEffect(() => {
    getAjustesBot().then(setA).catch((err) => setError(mensajeDe(err, 'No se pudieron cargar los ajustes del bot.')));
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
        guion: a.guion, plantilla: a.plantilla, cotizacion: a.cotizacion,
      });
      setA(r);
      showToast('Ajustes del bot guardados.', 'success');
    } catch (err) {
      setError(mensajeDe(err, 'No se pudieron guardar los ajustes. Intenta de nuevo.'));
    } finally {
      setGuardando(false);
    }
  };

  const urlWebhook = `${window.location.origin}/api/ventas/whatsapp-bot/webhook`;

  return (
    <div className="cfg-bot">
      <ErrorBanner mensaje={error} />

      <p className={a.conectado ? 'cfg-bot-estado cfg-bot-estado--ok' : 'cfg-bot-estado'} role="status">
        {a.conectado
          ? 'El servidor ya tiene la conexión con Meta: los mensajes se envían por WhatsApp.'
          : 'Este servidor todavía no tiene la conexión con Meta. Mientras tanto, en tu computador los envíos son simulados y en producción no saldrá ningún mensaje.'}
      </p>

      <div className="form-group">
        <label>
          <input type="checkbox" checked={a.activo} disabled={!puedeEditar} onChange={(e) => cambiar({ activo: e.target.checked })} />{' '}
          <strong>Bot activado</strong>
        </label>
        <small>Apagado, los mensajes que lleguen se ignoran. Enciéndelo cuando el número esté conectado en Meta.</small>
      </div>

      <div className="form-group">
        <label htmlFor="bot-modo"><strong>Cómo responde</strong></label>
        <select id="bot-modo" value={a.modo} disabled={!puedeEditar} onChange={(e) => cambiar({ modo: e.target.value as AjustesBot['modo'] })}>
          <option value="AUTO">Automático: el bot conversa y pregunta solo; las cotizaciones con precio las aprueba una persona</option>
          <option value="COPILOTO">Copiloto: el bot propone y una persona aprueba cada mensaje (para las primeras pruebas)</option>
        </select>
        <small>
          En automático el bot hace las preguntas necesarias hasta entender qué quiere el cliente y, cuando lo tiene claro, le avisa que lo pondrá en contacto con un asesor
          (y el equipo recibe la notificación con el resumen). También pasa a una persona los reclamos y lo que no sabe. Solo las cotizaciones con precio esperan aprobación.
        </small>
      </div>

      <div className="form-group">
        <label htmlFor="bot-numero"><strong>Identificador del número en Meta</strong></label>
        <input id="bot-numero" value={a.phoneNumberId} disabled={!puedeEditar} placeholder="Ej.: 123456789012345" onChange={(e) => cambiar({ phoneNumberId: e.target.value })} />
        <small>Lo ves en Meta → WhatsApp → Configuración de la API («Identificador del número de teléfono»). No es el número de teléfono.</small>
      </div>

      <div className="form-group">
        <label><strong>Horario de los asesores</strong></label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="time" aria-label="Hora de inicio" value={a.horario.inicio} disabled={!puedeEditar} onChange={(e) => cambiar({ horario: { ...a.horario, inicio: e.target.value } })} />
          <span>a</span>
          <input type="time" aria-label="Hora de fin" value={a.horario.fin} disabled={!puedeEditar} onChange={(e) => cambiar({ horario: { ...a.horario, fin: e.target.value } })} />
          {DIAS.map((d) => (
            <label key={d.n} style={{ fontSize: 13 }}>
              <input type="checkbox" checked={a.horario.dias.includes(d.n)} disabled={!puedeEditar} onChange={() => alternarDia(d.n)} /> {d.label}
            </label>
          ))}
        </div>
        <small>Hora de Ecuador. Fuera de este horario el bot atiende igual, toma los datos y avisa que un asesor responderá el siguiente día hábil.</small>
      </div>

      <div className="form-group">
        <label htmlFor="bot-conocimiento"><strong>Qué sabe el bot</strong></label>
        <textarea
          id="bot-conocimiento" rows={14} value={a.conocimiento} disabled={!puedeEditar}
          placeholder={'Escribe aquí lo que el bot puede contarle a un cliente: servicios, ciudades donde operan, horarios, cómo contratar, preguntas frecuentes…'}
          onChange={(e) => cambiar({ conocimiento: e.target.value })}
        />
        <small>
          Es lo ÚNICO que el bot usa para responder, y lo que escribas aquí lo puede leer un cliente: no pongas costos internos, márgenes ni datos de otras personas.
          Las respuestas que un asesor corrige se las aprende solo.
        </small>
      </div>

      <div className="form-group">
        <label><strong>Áreas de servicio y cómo indaga el bot</strong></label>
        <small>
          Con un posible cliente nuevo, el bot primero pregunta por cuál de estas áreas le interesa y luego hace las preguntas de esa área, de a poco.
          Lo que cotiza el bot lo calcula el sistema con las tarifas del Cotizador y siempre queda para que una persona lo revise antes de salir.
        </small>
        {a.guion.pilares.map((p, i) => (
          <div key={i} className="cfg-bot-pilar">
            <div className="cfg-bot-pilar-fila">
              <input aria-label="Nombre del área" placeholder="Nombre del área" value={p.nombre} disabled={!puedeEditar} onChange={(e) => cambiarPilar(i, { nombre: e.target.value })} />
              <label style={{ fontSize: 13 }}>
                <input type="checkbox" checked={p.activo} disabled={!puedeEditar} onChange={(e) => cambiarPilar(i, { activo: e.target.checked })} /> Activa
              </label>
              {puedeEditar && <button type="button" className="btn-secondary" onClick={() => quitarPilar(i)}>Quitar</button>}
            </div>
            <input aria-label="Qué incluye el área" placeholder="Qué incluye (el bot lo usa para explicarle al cliente)" value={p.descripcion} disabled={!puedeEditar} onChange={(e) => cambiarPilar(i, { descripcion: e.target.value })} />
            <textarea
              aria-label="Preguntas del área" rows={4} disabled={!puedeEditar} value={p.preguntas.join('\n')}
              placeholder="Una pregunta por línea: lo que el bot debe averiguar en esta área"
              onChange={(e) => cambiarPilar(i, { preguntas: e.target.value.split('\n') })}
            />
            <div className="cfg-bot-pilar-fila" style={{ fontSize: 13 }}>
              <span>El bot puede cotizar:</span>
              <label><input type="checkbox" checked={p.cotiza.includes('CATALOGO')} disabled={!puedeEditar} onChange={() => alternarCotiza(i, 'CATALOGO')} /> Productos del Cotizador</label>
              <label><input type="checkbox" checked={p.cotiza.includes('CUSTODIA')} disabled={!puedeEditar} onChange={() => alternarCotiza(i, 'CUSTODIA')} /> Custodia móvil</label>
              <span style={{ color: '#666' }}>(sin marcar: reúne los datos y lo cotiza un asesor)</span>
            </div>
          </div>
        ))}
        {puedeEditar && (
          <div className="cfg-bot-pilar-fila">
            <button type="button" className="btn-secondary" onClick={anadirPilar}>Añadir área</button>
            {a.guion.pilares.length === 0 && (
              <button type="button" className="btn-secondary" onClick={() => cambiar({ guion: { ...a.guion, pilares: PILARES_EJEMPLO } })}>
                Cargar ejemplo con los tres pilares de Gemeseg
              </button>
            )}
          </div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="bot-pregunta-inicial"><strong>Pregunta de apertura (opcional)</strong></label>
        <input id="bot-pregunta-inicial" value={a.guion.preguntaInicial} disabled={!puedeEditar} placeholder="Ej.: ¿Sobre cuál de nuestras áreas quieres información?" onChange={(e) => cambiar({ guion: { ...a.guion, preguntaInicial: e.target.value } })} />
        <small>Si la dejas vacía, el bot la redacta nombrando las áreas.</small>
      </div>

      <div className="form-group">
        <label htmlFor="bot-sedes"><strong>Sedes de la empresa (una ciudad por línea)</strong></label>
        <textarea
          id="bot-sedes" rows={4} disabled={!puedeEditar} value={a.guion.sedes.join('\n')}
          placeholder={'Ej.:\nQuito\nGuayaquil'}
          onChange={(e) => cambiar({ guion: { ...a.guion, sedes: e.target.value.split('\n') } })}
        />
        <small>
          El bot pregunta en qué ciudad sería el servicio. Si es en una ciudad que no es sede (por ejemplo, una custodia hacia otra ciudad), no cotiza ni promete:
          reúne los datos y lo pasa a un asesor para que confirme la cobertura. Si la dejas vacía, no se revisa la ciudad.
        </small>
      </div>

      <div className="form-group">
        <label htmlFor="bot-minimo"><strong>Mensajes mínimos del cliente antes de pasarlo a un asesor</strong></label>
        <input id="bot-minimo" type="number" min={1} max={12} style={{ width: 80 }} value={a.guion.minimoRespuestas} disabled={!puedeEditar}
          onChange={(e) => cambiar({ guion: { ...a.guion, minimoRespuestas: Number(e.target.value) } })} />
        <small>
          Evita que el bot cierre con un pedido a medias. Si cree que ya entendió antes de este número de mensajes del cliente (el saludo cuenta), se le obliga a preguntar más.
          No aplica a quejas, emergencias ni cuando el cliente pide hablar con una persona.
        </small>
      </div>

      <div className="form-group">
        <label htmlFor="bot-privacidad"><strong>Aviso de datos personales</strong></label>
        <textarea id="bot-privacidad" rows={3} value={a.guion.privacidad} disabled={!puedeEditar} placeholder="Texto que el bot muestra tras avisar que es una IA, en el primer mensaje: para qué se usan sus datos y cómo pedir que se borren." onChange={(e) => cambiar({ guion: { ...a.guion, privacidad: e.target.value } })} />
        <small>El texto lo define y lo revisa la empresa (pendiente de revisión legal); el bot lo muestra tal cual.</small>
      </div>

      <div className="form-group">
        <label><strong>Márgenes de las cotizaciones del bot</strong></label>
        <div className="cfg-bot-pilar-fila" style={{ fontSize: 13 }}>
          <label>Custodia móvil (% sobre el precio){' '}
            <input type="number" min={0} max={95} style={{ width: 80 }} value={a.cotizacion.margenCustodiaPct} disabled={!puedeEditar}
              onChange={(e) => cambiar({ cotizacion: { ...a.cotizacion, margenCustodiaPct: Number(e.target.value) } })} />
          </label>
          <label>Productos (% sobre el costo){' '}
            <input type="number" min={0} max={500} style={{ width: 80 }} value={a.cotizacion.margenProductosPct ?? ''} disabled={!puedeEditar} placeholder="auto"
              onChange={(e) => cambiar({ cotizacion: { ...a.cotizacion, margenProductosPct: e.target.value === '' ? null : Number(e.target.value) } })} />
          </label>
        </div>
        <small>En productos, vacío usa la regla del Cotizador (la ganancia de cada proveedor). El bot nunca ve costos ni márgenes.</small>
      </div>

      <div className="form-group">
        <label><strong>Plantilla para escribir pasadas 24 horas</strong></label>
        <div className="cfg-bot-pilar-fila" style={{ fontSize: 13 }}>
          <input aria-label="Nombre de la plantilla" style={{ width: 240 }} placeholder="nombre_de_la_plantilla" value={a.plantilla.nombre} disabled={!puedeEditar} onChange={(e) => cambiar({ plantilla: { ...a.plantilla, nombre: e.target.value } })} />
          <input aria-label="Idioma de la plantilla" style={{ width: 70 }} placeholder="es" value={a.plantilla.idioma} disabled={!puedeEditar} onChange={(e) => cambiar({ plantilla: { ...a.plantilla, idioma: e.target.value } })} />
          <label><input type="checkbox" checked={a.plantilla.conNombre} disabled={!puedeEditar} onChange={(e) => cambiar({ plantilla: { ...a.plantilla, conNombre: e.target.checked } })} /> Lleva el nombre del cliente en {'{{1}}'}</label>
        </div>
        <small>WhatsApp solo deja escribir primero con una plantilla aprobada por Meta. Si pasaron 24 h desde el último mensaje del cliente, se envía esta para que responda; después ya se puede escribir libre. Vacío: no se usa.</small>
      </div>

      <details className="cfg-bot-meta">
        <summary>Datos para conectar el webhook en Meta</summary>
        <p>URL de devolución de llamada: <code>{urlWebhook}</code></p>
        <p>
          El «token de verificación» y el secreto de la app los guarda Sistemas en el servidor (variables <code>WHATSAPP_VERIFY_TOKEN</code>, <code>WHATSAPP_APP_SECRET</code> y{' '}
          <code>WHATSAPP_ACCESS_TOKEN</code>); no se escriben en esta pantalla. Suscribe el campo «messages».
        </p>
      </details>

      {puedeEditar && (
        <button type="button" className="auth-btn" disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando...' : 'Guardar'}
        </button>
      )}
    </div>
  );
}
