import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  buscarClientesCustodia, createCustodia, getCamposCustodia, getCelularesCustodia, getCustodia, getPinesCustodia,
  getNumeracionGuias, getRutasCustodia, updateCustodia,
} from '../../services/custodia.service';
import EmpleadoSelect from './EmpleadoSelect';
import ClienteSelect, { mensajeDeError } from './ClienteSelect';
import CampoInput from './CampoInput';
import DateInput from '../common/DateInput';
import FormModal from '../common/FormModal';
import {
  MAX_CONTENEDORES, MAX_HACIENDAS,
  type CampoGuia, type ContactoCliente, type EtiquetaCampo, type GuiaCustodia, type MomentoFirma,
  type RefCustodio, type RutaCustodia, type ValorCampo,
} from '../../types/custodiaGuia';
import type { CelularCustodia, PinCustodio, RolCustodio } from '../../types/custodiaCampo';
import { cedulaMostrable } from '../../utils/postulacionValidacion';

interface Persona { nombre: string; cedula: string }

interface ContenedorForm {
  numero: string;
  choferNombre: string;
  choferCedula: string;
  placaCabezal: string;
  guia: string;
  lote: string;
  cabinaCustodio: RefCustodio | '';
  cabinaPlaca: string;
  cabinaTipo: string;
  campos: Record<string, ValorCampo>;
  /** Sello del formato anterior: se pasa al primer campo de sello cuando se cargan los campos. */
  selloLegacy?: string;
}

interface HaciendaForm {
  nombre: string;
  guia: string;
  sacos: string;
  campos: Record<string, ValorCampo>;
}

interface FormState {
  tipoCustodia: string;
  clienteId: number | null;
  clienteNombre: string;
  contactoNombre: string;
  contactoTelefono: string;
  rutaId: number | null;
  patrulla: string;
  placa: string;
  fechaSalida: string;
  horaSalida: string;
  ciudadSalida: string;
  direccionSalida: string;
  fechaLlegada: string;
  horaLlegada: string;
  ciudadLlegada: string;
  direccionLlegada: string;
  chofer: Persona;
  /** Entre 2 y 4 custodios; el primero es el «Custodio 1». */
  custodios: Persona[];
  contenedores: ContenedorForm[];
  furgonPlaca: string;
  furgonChoferNombre: string;
  furgonChoferCedula: string;
  haciendas: HaciendaForm[];
  camposGenerales: Record<string, ValorCampo>;
  firmaMomento: '' | MomentoFirma;
  observaciones: string;
  /** Celular del viaje (Fase 2): el viaje aparece solo en ese celular. */
  dispositivoId: number | null;
  /** Quién del viaje maneja el celular: chofer o uno de los custodios. */
  custodioACargo: '' | RolCustodio;
}

const REFS: RefCustodio[] = ['custodio1', 'custodio2', 'custodio3', 'custodio4'];

const contenedorVacio = (): ContenedorForm => ({
  numero: '', choferNombre: '', choferCedula: '', placaCabezal: '', guia: '', lote: '',
  cabinaCustodio: '', cabinaPlaca: '', cabinaTipo: '', campos: {},
});
const haciendaVacia = (): HaciendaForm => ({ nombre: '', guia: '', sacos: '', campos: {} });

const formularioNuevo = (): FormState => ({
  tipoCustodia: 'HACIENDA', clienteId: null, clienteNombre: '', contactoNombre: '', contactoTelefono: '',
  rutaId: null, patrulla: '', placa: '',
  fechaSalida: '', horaSalida: '', ciudadSalida: '', direccionSalida: '',
  fechaLlegada: '', horaLlegada: '', ciudadLlegada: '', direccionLlegada: '',
  chofer: { nombre: '', cedula: '' },
  custodios: [{ nombre: '', cedula: '' }, { nombre: '', cedula: '' }],
  contenedores: [contenedorVacio()], furgonPlaca: '', furgonChoferNombre: '', furgonChoferCedula: '',
  haciendas: [haciendaVacia()], camposGenerales: {}, firmaMomento: '', observaciones: '',
  dispositivoId: null, custodioACargo: '',
});

// Las fechas se guardan como instante (UTC) y en pantalla se editan en hora de Ecuador (UTC-5), igual que al crear.
function aCampos(iso?: string | null): { fecha: string; hora: string } {
  if (!iso) return { fecha: '', hora: '' };
  const d = new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString();
  return { fecha: d.slice(0, 10), hora: d.slice(11, 16) };
}

// Los viajes viejos guardaban cada contenedor como texto «NUM (Sello:X) (Guía:Y) (BL:Z)»; al editar se separan de nuevo.
function contenedorViejo(texto: string): { numero: string; sello: string; guia: string; bl: string } {
  const sacar = (etiqueta: string) => new RegExp(`\\(${etiqueta}:([^)]*)\\)`).exec(texto)?.[1] ?? '';
  return {
    numero: texto.replace(/\s*\((Sello|Guía|BL):[^)]*\)/g, '').trim(),
    sello: sacar('Sello'),
    guia: sacar('Guía'),
    bl: sacar('BL'),
  };
}

/** ¿Es un viaje guardado antes de la guía digital? (tiene contenedores u hacienda en las columnas, pero no en `guia`). */
function esFormatoViejo(c: any): boolean {
  const g: GuiaCustodia = c.guia ?? {};
  const puertoViejo = c.tipoCustodia === 'PUERTO' && (c.contenedores ?? []).length > 0 && !(g.contenedores ?? []).length;
  const haciendaVieja = c.tipoCustodia === 'HACIENDA' && !!c.nombreHacienda && !(g.haciendas ?? []).length;
  return puertoViejo || haciendaVieja;
}

function formularioDe(c: any): { form: FormState; avisoViejo: string } {
  const g: GuiaCustodia = c.guia ?? {};
  const salida = aCampos(c.fechaHoraSalida);
  const llegada = aCampos(c.fechaHoraLlegada);
  let observaciones: string = c.observaciones ?? '';
  const notasBl: string[] = [];

  let contenedores: ContenedorForm[];
  if ((g.contenedores ?? []).length) {
    contenedores = g.contenedores!.map((x) => ({
      numero: x.numero ?? '', choferNombre: x.choferNombre ?? '', choferCedula: x.choferCedula ?? '',
      placaCabezal: x.placaCabezal ?? '', guia: x.guia ?? '', lote: x.lote ?? '',
      cabinaCustodio: x.cabina?.custodio ?? '', cabinaPlaca: x.cabina?.placa ?? '', cabinaTipo: x.cabina?.tipoVehiculo ?? '',
      campos: { ...(x.campos ?? {}) },
    }));
  } else if (c.tipoCustodia === 'PUERTO' && (c.contenedores ?? []).length) {
    contenedores = (c.contenedores as string[]).map((t) => {
      const v = contenedorViejo(t);
      if (v.bl) notasBl.push(`BL del contenedor ${v.numero}: ${v.bl}`);
      return { ...contenedorVacio(), numero: v.numero, guia: v.guia, selloLegacy: v.sello || undefined };
    });
  } else {
    contenedores = [contenedorVacio()];
  }

  let haciendas: HaciendaForm[];
  if ((g.haciendas ?? []).length) {
    haciendas = g.haciendas!.map((h) => ({
      nombre: h.nombre ?? '', guia: h.guia ?? '', sacos: h.sacos ? String(h.sacos) : '', campos: { ...(h.campos ?? {}) },
    }));
  } else if (c.nombreHacienda) {
    haciendas = [{ nombre: c.nombreHacienda, guia: '', sacos: c.cantidadSacos ? String(c.cantidadSacos) : '', campos: {} }];
  } else {
    haciendas = [haciendaVacia()];
  }

  const custodios: Persona[] = [
    { nombre: c.custodio1Name ?? '', cedula: c.custodio1Cedula ?? '' },
    { nombre: c.custodio2Name ?? '', cedula: c.custodio2Cedula ?? '' },
  ];
  if (c.custodio3Name) custodios.push({ nombre: c.custodio3Name, cedula: c.custodio3Cedula ?? '' });
  if (c.custodio4Name) custodios.push({ nombre: c.custodio4Name, cedula: c.custodio4Cedula ?? '' });

  if (notasBl.length) observaciones = [observaciones, ...notasBl].filter(Boolean).join('\n');

  const form: FormState = {
    tipoCustodia: c.tipoCustodia ?? 'HACIENDA',
    clienteId: c.clienteId ?? null,
    clienteNombre: c.cliente ?? '',
    contactoNombre: g.contactoSitio?.nombre ?? '',
    contactoTelefono: g.contactoSitio?.telefono ?? '',
    rutaId: c.rutaId ?? null,
    patrulla: c.patrulla ?? '',
    placa: c.placa ?? '',
    fechaSalida: salida.fecha, horaSalida: salida.hora,
    ciudadSalida: c.ciudadSalida ?? '', direccionSalida: c.direccionSalida ?? '',
    fechaLlegada: llegada.fecha, horaLlegada: llegada.hora,
    ciudadLlegada: c.ciudadLlegada ?? '', direccionLlegada: c.direccionLlegada ?? '',
    chofer: { nombre: c.choferName ?? '', cedula: c.choferCedula ?? '' },
    custodios,
    contenedores,
    furgonPlaca: g.furgon?.placa ?? '', furgonChoferNombre: g.furgon?.choferNombre ?? '', furgonChoferCedula: g.furgon?.choferCedula ?? '',
    haciendas,
    camposGenerales: { ...(g.campos ?? {}) },
    firmaMomento: g.firmaMomento ?? '',
    observaciones,
    dispositivoId: c.dispositivoId ?? c.dispositivo?.id ?? null,
    custodioACargo: c.custodioACargo ?? '',
  };
  const avisoViejo = esFormatoViejo(c)
    ? 'Este viaje se guardó con el formato anterior. Sus datos se pasaron a los campos nuevos' +
      (notasBl.length ? ' y el BL quedó anotado en las observaciones.' : '.')
    : '';
  return { form, avisoViejo };
}

const subtitulo: React.CSSProperties = {
  fontSize: '0.82rem', fontWeight: 700, color: '#1e3a5f', textTransform: 'uppercase', margin: '20px 0 10px',
};
const tarjeta: React.CSSProperties = { padding: 14, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0' };
const subtarjeta: React.CSSProperties = { padding: 12, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 };
const dosColumnas: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 };
const ayudaTxt: React.CSSProperties = { fontSize: '0.75rem', color: '#718096', margin: '0 0 10px' };
const grupo: React.CSSProperties = { minWidth: 150 };

const ayudaChica: React.CSSProperties = { fontSize: '0.72rem', color: '#718096' };

/**
 * Cada grupo del formulario va en su propio bloque con el título adentro y un marco neutro.
 * Solo los bloques cuyo contenido cambia según el tipo de servicio (azul: Contenedores/Puerto,
 * amarillo: Furgón/Haciendas) llevan fondo de color; todos los demás van sin fondo.
 */
type TonoBloque = 'neutro' | 'azul' | 'amarillo';
const TONOS: Record<TonoBloque, { fondo: string; borde: string }> = {
  neutro: { fondo: 'transparent', borde: '#e2e8f0' },
  azul: { fondo: '#eff6ff', borde: '#3b82f640' },
  amarillo: { fondo: '#fefce8', borde: '#eab30840' },
};

function Bloque({ titulo, tono, ayuda, children }: { titulo: string; tono: TonoBloque; ayuda?: ReactNode; children: ReactNode }) {
  const t = TONOS[tono];
  return (
    <div style={{ padding: 16, background: t.fondo, borderRadius: 12, border: `1px solid ${t.borde}` }}>
      <h3 style={{ ...subtitulo, margin: ayuda ? '0 0 4px' : '0 0 10px' }}>{titulo}</h3>
      {ayuda && <p style={ayudaTxt}>{ayuda}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  );
}

/** ¿La llegada queda antes de la salida? Con fecha y hora compara el instante; si falta una hora, solo los días. */
function llegadaAntesDeSalida(f: Pick<FormState, 'fechaSalida' | 'horaSalida' | 'fechaLlegada' | 'horaLlegada'>): boolean {
  if (!f.fechaSalida || !f.fechaLlegada) return false;
  if (f.fechaLlegada !== f.fechaSalida) return f.fechaLlegada < f.fechaSalida;
  if (f.horaSalida && f.horaLlegada) return f.horaLlegada < f.horaSalida;
  return false;
}

const vacioValor = (v: ValorCampo | undefined) => v === undefined || v === null || v === '';

/** Los campos de la guía que se llenan de verdad (sin vacíos), listos para guardar. */
function limpiarCampos(campos: Record<string, ValorCampo>): Record<string, ValorCampo> {
  const salida: Record<string, ValorCampo> = {};
  for (const [k, v] of Object.entries(campos)) if (!vacioValor(v)) salida[k] = v;
  return salida;
}

/**
 * «Nueva custodia» y «Editar custodia» en una ventana sobre el listado de Viajes (2026-11-16). Desde Fase 1 de
 * «Custodias en campo» se arma por secciones, como la hoja de ruta en papel: servicio, salida y llegada, personal
 * (hasta 4 custodios), contenedores (puerto) o furgón y haciendas, campos configurados, firma y observaciones.
 * Sin `custodia` crea; con `custodia` edita ese viaje (el estado no se cambia aquí, sino desde el listado).
 */
export default function CustodiaFormModal({
  custodia,
  onClose,
  onGuardada,
}: {
  custodia?: any;
  onClose: () => void;
  onGuardada: (custodia: any, esNueva: boolean) => void;
}) {
  const editando = !!custodia;
  const inicial = useMemo(() => (custodia ? formularioDe(custodia) : { form: formularioNuevo(), avisoViejo: '' }), [custodia]);
  const [form, setForm] = useState<FormState>(inicial.form);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [campos, setCampos] = useState<CampoGuia[]>([]);
  const [camposCargados, setCamposCargados] = useState(false);
  const [rutas, setRutas] = useState<RutaCustodia[]>([]);
  const [contactos, setContactos] = useState<ContactoCliente[]>([]);
  const [avisoCarga, setAvisoCarga] = useState('');
  const [celulares, setCelulares] = useState<CelularCustodia[]>([]);
  const [pines, setPines] = useState<PinCustodio[] | null>(null);
  const [avisosServidor, setAvisosServidor] = useState<string[]>([]);
  // El número de guía lo asigna el servidor al guardar; aquí solo se muestra cuál será (vista previa).
  const [siguienteGuia, setSiguienteGuia] = useState('');

  // La llegada no puede ser antes de la salida: se marca en vivo y, al intentar guardar, se trae a la vista.
  const llegadaAntes = llegadaAntesDeSalida(form);
  const errorFechasRef = useRef<HTMLSpanElement>(null);
  const [intentosFechas, setIntentosFechas] = useState(0);
  useEffect(() => {
    if (intentosFechas > 0) errorFechasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [intentosFechas]);

  const cambiar = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const onInput = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  // Campos configurados (solo los activos) y rutas (las activas; la del viaje se muestra aunque ya esté apagada).
  useEffect(() => {
    let vigente = true;
    getCamposCustodia()
      .then((c) => { if (vigente) setCampos(c); })
      .catch(() => { if (vigente) setAvisoCarga('No se pudieron cargar los campos de la guía. Puedes guardar sin ellos.'); })
      .finally(() => { if (vigente) setCamposCargados(true); });
    getRutasCustodia(true)
      .then((r) => { if (vigente) setRutas(r.filter((x) => x.activo || x.id === custodia?.rutaId)); })
      .catch(() => { /* la ruta es opcional: sin lista simplemente no se ofrece */ });
    return () => { vigente = false; };
  }, [custodia?.rutaId]);

  useEffect(() => {
    if (editando) return;
    let vigente = true;
    getNumeracionGuias().then((n) => { if (vigente) setSiguienteGuia(n.siguiente); }).catch(() => { /* sin vista previa: el número se asigna igual al guardar */ });
    return () => { vigente = false; };
  }, [editando]);

  // Celulares vinculados y PIN creados (Fase 2). Son opcionales: sin ellos el viaje se guarda igual, sin celular.
  useEffect(() => {
    let vigente = true;
    getCelularesCustodia().then((l) => { if (vigente) setCelulares(l); }).catch(() => { /* sin lista, no se ofrece celular */ });
    getPinesCustodia().then((l) => { if (vigente) setPines(l); }).catch(() => { /* sin lista de PIN no se avisa de PIN */ });
    // Los avisos del servidor (p. ej. «todavía no tiene PIN») vienen con el detalle del viaje.
    if (custodia?.id) {
      getCustodia(custodia.id).then((c) => { if (vigente) setAvisosServidor(Array.isArray(c?.avisos) ? c.avisos : []); }).catch(() => { /* se usan solo los avisos locales */ });
    }
    return () => { vigente = false; };
  }, [custodia?.id]);

  // Con un viaje que ya tiene cliente del Directorio, se traen sus contactos para ofrecerlos como contacto en sitio.
  useEffect(() => {
    if (!custodia?.clienteId || !custodia?.cliente) return;
    let vigente = true;
    buscarClientesCustodia(custodia.cliente)
      .then((r) => { if (vigente) setContactos(r.find((c) => c.id === custodia.clienteId)?.contactos ?? []); })
      .catch(() => { /* sin contactos del cliente: el contacto se escribe a mano */ });
    return () => { vigente = false; };
  }, [custodia?.clienteId, custodia?.cliente]);

  const aplicables = useMemo(
    () => campos.filter((c) => c.activo && (c.tipoServicio === 'TODOS' || c.tipoServicio === form.tipoCustodia)),
    [campos, form.tipoCustodia],
  );
  const ordenados = (bloque: string) =>
    aplicables.filter((c) => c.bloque === bloque).sort((a, b) => Number(b.esSello) - Number(a.esSello) || a.orden - b.orden);
  const camposGenerales = ordenados('GENERAL');
  const camposContenedor = ordenados('CONTENEDOR');
  const camposHacienda = ordenados('HACIENDA');

  // El sello del formato anterior pasa al primer campo de sello (o, si no hay, a las observaciones).
  useEffect(() => {
    if (!camposCargados) return;
    setForm((f) => {
      if (!f.contenedores.some((c) => c.selloLegacy)) return f;
      const primerSello = campos.find((c) => c.activo && c.esSello && c.bloque === 'CONTENEDOR');
      let obs = f.observaciones;
      const contenedores = f.contenedores.map((c) => {
        if (!c.selloLegacy) return c;
        const { selloLegacy, ...resto } = c;
        if (primerSello) return { ...resto, campos: { ...resto.campos, [String(primerSello.id)]: selloLegacy } };
        obs = [obs, `Sello del contenedor ${c.numero}: ${selloLegacy}`].filter(Boolean).join('\n');
        return resto;
      });
      return { ...f, contenedores, observaciones: obs };
    });
  }, [camposCargados, campos]);

  const nombresCustodios = form.custodios.map((c) => c.nombre.trim());

  // Las personas del viaje que pueden llevar el celular, con el rol con que el servidor las reconoce.
  const personasDelViaje = useMemo(() => {
    const lista: { rol: RolCustodio; etiqueta: string; nombre: string; cedula: string }[] = [
      { rol: 'chofer', etiqueta: 'Chofer', nombre: form.chofer.nombre.trim(), cedula: form.chofer.cedula.trim() },
      ...form.custodios.map((c, i) => ({ rol: REFS[i] as RolCustodio, etiqueta: `Custodio ${i + 1}`, nombre: c.nombre.trim(), cedula: c.cedula.trim() })),
    ];
    return lista.filter((p) => p.nombre);
  }, [form.chofer, form.custodios]);
  const aCargo = personasDelViaje.find((p) => p.rol === form.custodioACargo);
  const avisosCelular = useMemo(() => {
    const sinPunto = (t: string) => t.replace(/\.$/, '');
    const lista: string[] = [];
    if (form.dispositivoId && aCargo) {
      if (!cedulaMostrable(aCargo.cedula)) lista.push(`${aCargo.nombre} no tiene cédula registrada: agrégala en Personal para darle un PIN.`);
      else if (pines && !pines.some((p) => p.cedula === aCargo.cedula)) lista.push(`${aCargo.nombre} todavía no tiene PIN.`);
    }
    for (const a of avisosServidor) if (!lista.some((x) => sinPunto(x) === sinPunto(a))) lista.push(a);
    return lista;
  }, [form.dispositivoId, aCargo, pines, avisosServidor]);
  const custodiosConNombre = form.custodios.map((c, i) => ({ ref: REFS[i], etiqueta: `Custodio ${i + 1}`, nombre: c.nombre.trim() })).filter((c) => c.nombre);

  // ---- cambios de lista ----
  const setCustodio = (i: number, v: Persona) =>
    setForm((f) => ({ ...f, custodios: f.custodios.map((c, j) => (j === i ? v : c)) }));
  const agregarCustodio = () => setForm((f) => (f.custodios.length >= 4 ? f : { ...f, custodios: [...f.custodios, { nombre: '', cedula: '' }] }));
  const quitarUltimoCustodio = () =>
    setForm((f) => {
      if (f.custodios.length <= 2) return f;
      const ref = REFS[f.custodios.length - 1];
      return {
        ...f,
        custodios: f.custodios.slice(0, -1),
        // Si el custodio quitado era quien lleva el celular, queda sin elegir.
        custodioACargo: f.custodioACargo === ref ? '' : f.custodioACargo,
        // Una cabina que iba con el custodio quitado se queda sin elegir.
        contenedores: f.contenedores.map((c) => (c.cabinaCustodio === ref ? { ...c, cabinaCustodio: '' } : c)),
      };
    });

  const setContenedor = (i: number, patch: Partial<ContenedorForm>) =>
    setForm((f) => ({ ...f, contenedores: f.contenedores.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const setHacienda = (i: number, patch: Partial<HaciendaForm>) =>
    setForm((f) => ({ ...f, haciendas: f.haciendas.map((h, j) => (j === i ? { ...h, ...patch } : h)) }));

  function elegirRuta(valor: string) {
    const id = valor ? Number(valor) : null;
    const ruta = rutas.find((r) => r.id === id);
    setForm((f) => ({
      ...f,
      rutaId: id,
      // Origen y destino de la ruta rellenan las ciudades solo si están vacías: no pisan lo ya escrito.
      ciudadSalida: f.ciudadSalida || ruta?.origen || '',
      ciudadLlegada: f.ciudadLlegada || ruta?.destino || '',
    }));
  }

  function elegirContacto(valor: string) {
    const c = contactos.find((x) => String(x.id) === valor);
    if (c) cambiar({ contactoNombre: c.name, contactoTelefono: c.phones?.[0] ?? '' });
  }

  async function handleSubmit() {
    setError('');
    const f = form;
    const tipo = f.tipoCustodia;

    if (llegadaAntesDeSalida(f)) { setIntentosFechas((n) => n + 1); return; }

    if (!f.chofer.nombre.trim()) { setError('Nombre del chofer es requerido'); return; }
    if (!f.custodios[0].nombre.trim()) { setError('Nombre del custodio 1 es requerido'); return; }
    if (!f.custodios[1].nombre.trim()) { setError('Nombre del custodio 2 es requerido'); return; }
    for (let i = 2; i < f.custodios.length; i++) {
      if (!f.custodios[i].nombre.trim()) { setError(`Elige al custodio ${i + 1} o quítalo.`); return; }
    }

    // La misma persona no puede ir dos veces: se reconoce por la cédula o, si aún no la tiene (es opcional), por el nombre.
    const claves = [f.chofer, ...f.custodios]
      .filter((p) => p.nombre.trim() || p.cedula.trim())
      .map((p) => p.cedula.trim() || p.nombre.trim().toLowerCase());
    if (new Set(claves).size < claves.length) { setError('Chofer y custodios deben ser personas distintas.'); return; }

    // Celular y custodio a cargo (Fase 2): el custodio tiene que seguir en el viaje.
    if (f.dispositivoId && f.custodioACargo && !personasDelViaje.some((p) => p.rol === f.custodioACargo)) {
      setError('El custodio a cargo del celular ya no está en el viaje. Elige otro.'); return;
    }

    // Contenedores (solo puerto): se descartan las tarjetas totalmente vacías.
    const contenedoresUsados = tipo === 'PUERTO'
      ? f.contenedores.filter((c) =>
        [c.numero, c.choferNombre, c.choferCedula, c.placaCabezal, c.guia, c.lote, c.cabinaPlaca, c.cabinaTipo].some((x) => x.trim())
        || c.cabinaCustodio || Object.values(c.campos).some((v) => !vacioValor(v)))
      : [];
    if (tipo === 'PUERTO') {
      if (!contenedoresUsados.some((c) => c.numero.trim())) { setError('Debe registrar al menos un contenedor'); return; }
      for (let i = 0; i < contenedoresUsados.length; i++) {
        const c = contenedoresUsados[i];
        const n = i + 1;
        if (!c.numero.trim()) { setError(`Falta el número del contenedor ${n}. Complétalo o quita ese contenedor.`); return; }
        if (c.cabinaCustodio) {
          const idx = REFS.indexOf(c.cabinaCustodio);
          if (!nombresCustodios[idx]) { setError(`El custodio de cabina del contenedor ${n} ya no está en el viaje. Elige otro.`); return; }
        }
        for (const campo of camposContenedor) {
          if (campo.obligatorio && campo.llenaQuien === 'OFICINA' && vacioValor(c.campos[String(campo.id)])) {
            setError(`Falta "${campo.nombre}" en el contenedor ${n}`); return;
          }
        }
      }
    }

    // Haciendas (solo hacienda).
    const haciendasUsadas = tipo === 'HACIENDA'
      ? f.haciendas.filter((h) => h.nombre.trim() || h.guia.trim() || h.sacos.trim() || Object.values(h.campos).some((v) => !vacioValor(v)))
      : [];
    if (tipo === 'HACIENDA') {
      const primera = haciendasUsadas[0];
      if (!primera || !primera.nombre.trim()) { setError('Nombre de la hacienda es requerido'); return; }
      if (!primera.sacos || Number(primera.sacos) <= 0) { setError('Cantidad de sacos es requerida'); return; }
      for (let i = 0; i < haciendasUsadas.length; i++) {
        const h = haciendasUsadas[i];
        const n = i + 1;
        if (!h.nombre.trim()) { setError(`Falta el nombre de la hacienda ${n}. Complétalo o quita esa hacienda.`); return; }
        if (h.sacos && Number(h.sacos) < 0) { setError(`Los sacos de la hacienda ${n} no pueden ser negativos.`); return; }
        for (const campo of camposHacienda) {
          if (campo.obligatorio && campo.llenaQuien === 'OFICINA' && vacioValor(h.campos[String(campo.id)])) {
            setError(`Falta "${campo.nombre}" en la hacienda ${n}`); return;
          }
        }
      }
    }

    for (const campo of camposGenerales) {
      if (campo.obligatorio && campo.llenaQuien === 'OFICINA' && vacioValor(f.camposGenerales[String(campo.id)])) {
        setError(`Falta "${campo.nombre}"`); return;
      }
    }

    // Foto de los campos usados: así el viaje se lee igual aunque luego se renombre u oculte un campo.
    const anteriores: Record<string, EtiquetaCampo> = custodia?.guia?.etiquetas ?? {};
    const etiquetas: Record<string, EtiquetaCampo> = {};
    const usarEtiquetas = (valores: Record<string, ValorCampo>) => {
      for (const id of Object.keys(valores)) {
        const c = campos.find((x) => String(x.id) === id);
        if (c) etiquetas[id] = { nombre: c.nombre, tipo: c.tipo, bloque: c.bloque, enPdf: c.enPdf, esSello: c.esSello, orden: c.orden };
        else if (anteriores[id]) etiquetas[id] = anteriores[id];
      }
    };
    const generalesLimpios = limpiarCampos(f.camposGenerales);
    usarEtiquetas(generalesLimpios);

    const guia: GuiaCustodia = {
      contactoSitio: f.contactoNombre.trim() || f.contactoTelefono.trim()
        ? { nombre: f.contactoNombre.trim(), telefono: f.contactoTelefono.trim() }
        : null,
      firmaMomento: f.firmaMomento || null,
      campos: generalesLimpios,
      contenedores: contenedoresUsados.map((c) => {
        const cc = limpiarCampos(c.campos);
        usarEtiquetas(cc);
        const hayCabina = c.cabinaCustodio || c.cabinaPlaca.trim() || c.cabinaTipo.trim();
        return {
          numero: c.numero.trim(), choferNombre: c.choferNombre.trim(), choferCedula: c.choferCedula.trim(),
          placaCabezal: c.placaCabezal.trim(), guia: c.guia.trim(), lote: c.lote.trim(),
          cabina: hayCabina ? { custodio: c.cabinaCustodio || null, placa: c.cabinaPlaca.trim(), tipoVehiculo: c.cabinaTipo.trim() } : null,
          campos: cc,
        };
      }),
      furgon: tipo === 'HACIENDA' && (f.furgonPlaca.trim() || f.furgonChoferNombre.trim() || f.furgonChoferCedula.trim())
        ? { placa: f.furgonPlaca.trim(), choferNombre: f.furgonChoferNombre.trim(), choferCedula: f.furgonChoferCedula.trim() }
        : null,
      haciendas: haciendasUsadas.map((h) => {
        const cc = limpiarCampos(h.campos);
        usarEtiquetas(cc);
        return { nombre: h.nombre.trim(), guia: h.guia.trim(), sacos: h.sacos ? Number(h.sacos) : null, campos: cc };
      }),
      etiquetas,
    };

    setSaving(true);
    try {
      const isoSalida = f.fechaSalida && f.horaSalida ? new Date(`${f.fechaSalida}T${f.horaSalida}:00-05:00`).toISOString() : null;
      const isoLlegada = f.fechaLlegada && f.horaLlegada ? new Date(`${f.fechaLlegada}T${f.horaLlegada}:00-05:00`).toISOString() : null;
      const cust = (i: number) => f.custodios[i] ?? { nombre: '', cedula: '' };

      const payload: any = {
        tipoCustodia: tipo,
        choferName: f.chofer.nombre,
        choferCedula: f.chofer.cedula,
        custodio1Name: cust(0).nombre, custodio1Cedula: cust(0).cedula,
        custodio2Name: cust(1).nombre, custodio2Cedula: cust(1).cedula,
        custodio3Name: cust(2).nombre, custodio3Cedula: cust(2).cedula,
        custodio4Name: cust(3).nombre, custodio4Cedula: cust(3).cedula,
        // El nombre del cliente se guarda también como texto: Contabilidad, el dashboard y el Agente lo leen así.
        cliente: f.clienteNombre,
        clienteId: f.clienteId,
        rutaId: f.rutaId,
        patrulla: f.patrulla,
        placa: f.placa,
        ciudadSalida: f.ciudadSalida,
        ciudadLlegada: f.ciudadLlegada,
        direccionSalida: f.direccionSalida,
        direccionLlegada: f.direccionLlegada,
        fechaHoraSalida: isoSalida,
        fechaHoraLlegada: isoLlegada,
        observaciones: editando ? f.observaciones : f.observaciones || undefined,
        guia,
        dispositivoId: f.dispositivoId,
        custodioACargo: f.dispositivoId ? f.custodioACargo || null : null,
      };
      // El servidor las recalcula desde la guía; se mandan iguales por si una versión anterior las lee.
      if (tipo === 'HACIENDA') {
        payload.nombreHacienda = haciendasUsadas[0].nombre.trim();
        const total = haciendasUsadas.reduce((s, h) => s + (Number(h.sacos) || 0), 0);
        if (total > 0) payload.cantidadSacos = total;
      }
      if (tipo === 'PUERTO') payload.contenedores = contenedoresUsados.map((c) => c.numero.trim());

      onGuardada(editando ? await updateCustodia(custodia.id, payload) : await createCustodia(payload), !editando);
    } catch (err: any) {
      setError(mensajeDeError(err, 'No se pudo guardar la custodia. Inténtalo de nuevo.'));
    } finally {
      setSaving(false);
    }
  }

  const esPuerto = form.tipoCustodia === 'PUERTO';
  const esHacienda = form.tipoCustodia === 'HACIENDA';
  const bloqueCampos = (lista: CampoGuia[], valores: Record<string, ValorCampo>, poner: (id: string, v: ValorCampo) => void) =>
    lista.length > 0 && (
      <div className="form-row">
        {lista.map((c) => (
          <CampoInput key={c.id} campo={c} valor={valores[String(c.id)]} onChange={(v) => poner(String(c.id), v)} />
        ))}
      </div>
    );

  return (
    <FormModal
      title={editando ? `Editar custodia ${custodia.numeroGuia}` : 'Nueva custodia'}
      descripcion={editando
        ? (custodia.estado === 'LLEGO'
          ? 'Este viaje ya llegó: si cambias el tipo o el personal, cambia también lo que se paga en Contabilidad.'
          : 'Corrige los datos del viaje. Su estado se cambia desde el listado.')
        : 'Registra un viaje de custodia como en la hoja de ruta. Después de guardarlo podrás descargar su orden en PDF.'}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={editando ? 'Guardar cambios' : 'Registrar custodia'}
      saving={saving}
      error={error}
      ancho={940}
    >
      {inicial.avisoViejo && <div style={{ fontSize: '0.8rem', color: '#2b6cb0', background: '#ebf4ff', borderRadius: 8, padding: '8px 12px' }}>{inicial.avisoViejo}</div>}
      {avisoCarga && <div style={{ fontSize: '0.8rem', color: '#b7791f', background: '#fffbeb', borderRadius: 8, padding: '8px 12px' }}>{avisoCarga}</div>}

      {/* 1. Servicio */}
      <Bloque titulo="Servicio" tono="neutro">
        <div className="form-row">
          <div className="form-group" style={grupo}>
            <label>Tipo de servicio *</label>
            <select name="tipoCustodia" value={form.tipoCustodia} onChange={onInput}>
              <option value="HACIENDA">Hacienda</option>
              <option value="PUERTO">Puerto</option>
              <option value="VIP">VIP</option>
            </select>
          </div>
          <div className="form-group" style={grupo}>
            <label>Número de guía</label>
            <div
              aria-label="Número de guía"
              style={{
                display: 'flex', alignItems: 'center', minHeight: 48, boxSizing: 'border-box', padding: '0 16px',
                border: '2px solid #e2e8f0', borderRadius: 12, background: '#fff', color: '#1e3a5f', fontWeight: 700, letterSpacing: '0.02em',
              }}
            >
              {editando ? custodia.numeroGuia : siguienteGuia || 'Automático'}
            </div>
            {!editando && siguienteGuia && <span style={ayudaChica}>Automático: se asigna al guardar</span>}
          </div>
          <div className="form-group" style={grupo}>
            <label>Patrulla</label>
            <input name="patrulla" value={form.patrulla} onChange={onInput} placeholder="N.º de patrulla" />
          </div>
          <div className="form-group" style={grupo}>
            <label>Placa Gemeseg (vehículo)</label>
            <input name="placa" value={form.placa} onChange={onInput} placeholder="Ej: GEM-101" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group" style={{ minWidth: 280 }}>
            <label>Cliente</label>
            <ClienteSelect
              value={{ id: form.clienteId, nombre: form.clienteNombre }}
              onChange={(c) => {
                setContactos(c?.contactos ?? []);
                cambiar({ clienteId: c?.id ?? null, clienteNombre: c?.name ?? '' });
              }}
            />
          </div>
          <div className="form-group" style={grupo}>
            <label>Ruta (opcional)</label>
            <select value={form.rutaId ?? ''} onChange={(e) => elegirRuta(e.target.value)}>
              <option value="">Sin ruta</option>
              {rutas.map((r) => <option key={r.id} value={r.id}>{r.nombre}{r.activo ? '' : ' (desactivada)'}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          {contactos.length > 0 && (
            <div className="form-group" style={grupo}>
              <label>Contacto del cliente</label>
              <select value="" onChange={(e) => elegirContacto(e.target.value)}>
                <option value="">Elegir un contacto...</option>
                {contactos.map((c) => <option key={c.id} value={c.id}>{c.name}{c.role ? ` (${c.role})` : ''}</option>)}
              </select>
            </div>
          )}
          <div className="form-group" style={grupo}>
            <label>Contacto en sitio</label>
            <input name="contactoNombre" value={form.contactoNombre} onChange={onInput} placeholder="Nombre" />
          </div>
          <div className="form-group" style={grupo}>
            <label>Teléfono del contacto</label>
            <input name="contactoTelefono" value={form.contactoTelefono} onChange={onInput} placeholder="Teléfono" />
          </div>
        </div>
      </Bloque>

      {/* 2. Salida y llegada: dos tarjetas lado a lado */}
      <Bloque titulo="Salida y llegada" tono="neutro">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
          <div style={subtarjeta}>
            <strong style={{ fontSize: '0.85rem', color: '#1e3a5f' }}>Salida</strong>
            <div style={dosColumnas}>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Fecha de salida</label>
                <DateInput value={form.fechaSalida} onChange={(v) => cambiar({ fechaSalida: v })} />
              </div>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Hora de salida</label>
                <input type="time" name="horaSalida" value={form.horaSalida} onChange={onInput} />
              </div>
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label>Ciudad de salida</label>
              <input name="ciudadSalida" value={form.ciudadSalida} onChange={onInput} />
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label>Dirección de salida</label>
              <input name="direccionSalida" value={form.direccionSalida} onChange={onInput} />
            </div>
          </div>
          <div style={subtarjeta}>
            <strong style={{ fontSize: '0.85rem', color: '#1e3a5f' }}>Llegada</strong>
            <div style={dosColumnas}>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Fecha de llegada</label>
                <DateInput
                  value={form.fechaLlegada}
                  onChange={(v) => cambiar({ fechaLlegada: v })}
                  min={form.fechaSalida || undefined}
                  className={llegadaAntes ? 'input-error' : undefined}
                />
              </div>
              <div className="form-group" style={{ minWidth: 0 }}>
                <label>Hora de llegada</label>
                <input type="time" name="horaLlegada" value={form.horaLlegada} onChange={onInput} className={llegadaAntes ? 'input-error' : undefined} />
              </div>
            </div>
            {llegadaAntes && (
              <span ref={errorFechasRef} className="field-error" role="alert" style={{ marginTop: -4 }}>La llegada no puede ser antes de la salida.</span>
            )}
            <div className="form-group" style={{ minWidth: 0 }}>
              <label>Ciudad de llegada</label>
              <input name="ciudadLlegada" value={form.ciudadLlegada} onChange={onInput} />
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label>Dirección de llegada</label>
              <input name="direccionLlegada" value={form.direccionLlegada} onChange={onInput} />
            </div>
          </div>
        </div>
      </Bloque>

      {/* 3. Personal */}
      <Bloque
        titulo="Personal asignado"
        tono="neutro"
        ayuda="Escribe para buscar por nombre o cédula entre el personal de Recursos Humanos y el de los horarios de Operaciones (la cédula es opcional: quien aún no la tiene aparece como «Sin cédula»). Si alguien no está, usa «Créalo aquí» al pie de la lista. Puedes agregar hasta 4 custodios."
      >
        <div className="form-row">
          <div className="form-group" style={grupo}>
            <EmpleadoSelect
              label="Chofer"
              value={form.chofer}
              onChange={(v) => cambiar({ chofer: v })}
              excludeCedulas={form.custodios.map((c) => c.cedula).filter(Boolean)}
              excludeNombres={nombresCustodios}
              permitirCrear
              required
            />
          </div>
          {form.custodios.map((c, i) => {
            const otros = [form.chofer, ...form.custodios.filter((_, j) => j !== i)];
            return (
              <div className="form-group" style={grupo} key={i}>
                <EmpleadoSelect
                  label={`Custodio ${i + 1}`}
                  value={c}
                  onChange={(v) => setCustodio(i, v)}
                  excludeCedulas={otros.map((p) => p.cedula).filter(Boolean)}
                  excludeNombres={otros.map((p) => p.nombre)}
                  permitirCrear
                  required={i < 2}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {form.custodios.length < 4 && (
            <button type="button" className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={agregarCustodio}>
              <Plus size={14} /> Agregar custodio
            </button>
          )}
          {form.custodios.length > 2 && (
            <button type="button" className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.82rem' }} onClick={quitarUltimoCustodio}>
              Quitar custodio {form.custodios.length}
            </button>
          )}
        </div>
      </Bloque>

      {/* 3b. Celular y custodio a cargo (Fase 2) */}
      <Bloque
        titulo="Celular y custodio a cargo"
        tono="neutro"
        ayuda="El viaje aparece solo en el celular que elijas. La persona a cargo entra ahí con su cédula y su PIN; el resto del equipo también puede entrar con el suyo."
      >
        <div className="form-row">
          <div className="form-group" style={{ minWidth: 240 }}>
            <label>Celular</label>
            <select
              value={form.dispositivoId ?? ''}
              onChange={(e) => cambiar({ dispositivoId: e.target.value ? Number(e.target.value) : null, ...(e.target.value ? {} : { custodioACargo: '' as const }) })}
            >
              <option value="">Sin celular</option>
              {celulares
                .filter((c) => !c.revocado || c.id === form.dispositivoId)
                .map((c) => {
                  const ocupado = !!c.viajeActual && c.viajeActual.id !== custodia?.id;
                  return (
                    <option key={c.id} value={c.id} disabled={ocupado}>
                      {c.nombre}{c.revocado ? ' (desvinculado)' : ''}{ocupado ? ` · ocupado con ${c.viajeActual!.numeroGuia}` : ''}
                    </option>
                  );
                })}
            </select>
            {celulares.length === 0 && <span style={{ fontSize: '0.72rem', color: '#a0aec0' }}>No hay celulares vinculados. Se vinculan en Configuración › Custodias › Celulares.</span>}
          </div>
          <div className="form-group" style={{ minWidth: 240 }}>
            <label>Custodio a cargo del celular</label>
            <select
              value={form.custodioACargo}
              disabled={!form.dispositivoId}
              onChange={(e) => cambiar({ custodioACargo: e.target.value as '' | RolCustodio })}
            >
              <option value="">{form.dispositivoId ? 'Elegir...' : 'Primero elige un celular'}</option>
              {personasDelViaje.map((p) => <option key={p.rol} value={p.rol}>{p.etiqueta}: {p.nombre}</option>)}
            </select>
          </div>
        </div>
        {avisosCelular.map((a) => (
          <div key={a} style={{ fontSize: '0.8rem', color: '#b7791f', background: '#fffbeb', borderRadius: 8, padding: '8px 12px' }}>{a}</div>
        ))}
      </Bloque>

      {/* 4. Contenedores (puerto) */}
      {esPuerto && (
        <Bloque
          titulo="Contenedores"
          tono="azul"
          ayuda={`Hasta ${MAX_CONTENEDORES}. El número es obligatorio en cada contenedor que registres. El chofer del cabezal no es personal de Gemeseg: se escribe a mano.`}
        >
          {form.contenedores.map((c, i) => (
            <div key={i} style={tarjeta}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: '0.85rem', color: '#1e3a5f' }}>Contenedor {i + 1}</strong>
                {form.contenedores.length > 1 && (
                  <button
                    type="button" className="btn-secondary icon-btn" title={`Quitar contenedor ${i + 1}`} aria-label={`Quitar contenedor ${i + 1}`}
                    onClick={() => setForm((f) => ({ ...f, contenedores: f.contenedores.filter((_, j) => j !== i) }))}
                  >
                    <Trash2 size={14} color="#c53030" />
                  </button>
                )}
              </div>
              <div className="form-row">
                <div className="form-group" style={grupo}>
                  <label>N.º de contenedor *</label>
                  <input value={c.numero} onChange={(e) => setContenedor(i, { numero: e.target.value })} />
                </div>
                <div className="form-group" style={grupo}>
                  <label>Guía</label>
                  <input value={c.guia} onChange={(e) => setContenedor(i, { guia: e.target.value })} />
                </div>
                <div className="form-group" style={grupo}>
                  <label>Lote</label>
                  <input value={c.lote} onChange={(e) => setContenedor(i, { lote: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ minWidth: 200 }}>
                  <label>Chofer del cabezal</label>
                  <input value={c.choferNombre} onChange={(e) => setContenedor(i, { choferNombre: e.target.value })} placeholder="Nombre" />
                </div>
                <div className="form-group" style={grupo}>
                  <label>Cédula del chofer</label>
                  <input value={c.choferCedula} onChange={(e) => setContenedor(i, { choferCedula: e.target.value })} />
                </div>
                <div className="form-group" style={grupo}>
                  <label>Placa del cabezal</label>
                  <input value={c.placaCabezal} onChange={(e) => setContenedor(i, { placaCabezal: e.target.value })} />
                </div>
              </div>
              {bloqueCampos(camposContenedor, c.campos, (id, v) => setContenedor(i, { campos: { ...c.campos, [id]: v } }))}
              <div className="form-row" style={{ paddingTop: 10, borderTop: '1px dashed #e2e8f0' }}>
                <div className="form-group" style={{ minWidth: 200 }}>
                  <label>Custodio de cabina interna</label>
                  <select value={c.cabinaCustodio} onChange={(e) => setContenedor(i, { cabinaCustodio: e.target.value as RefCustodio | '' })}>
                    <option value="">Sin elegir</option>
                    {custodiosConNombre.map((x) => <option key={x.ref} value={x.ref}>{x.etiqueta}: {x.nombre}</option>)}
                  </select>
                </div>
                <div className="form-group" style={grupo}>
                  <label>Placa de su vehículo</label>
                  <input value={c.cabinaPlaca} onChange={(e) => setContenedor(i, { cabinaPlaca: e.target.value })} />
                </div>
                <div className="form-group" style={grupo}>
                  <label>Tipo de vehículo</label>
                  <input value={c.cabinaTipo} onChange={(e) => setContenedor(i, { cabinaTipo: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
          {form.contenedores.length < MAX_CONTENEDORES && (
            <button
              type="button" className="btn-secondary" style={{ alignSelf: 'flex-start', padding: '6px 14px', fontSize: '0.82rem' }}
              onClick={() => setForm((f) => ({ ...f, contenedores: [...f.contenedores, contenedorVacio()] }))}
            >
              <Plus size={14} /> Agregar contenedor
            </button>
          )}
        </Bloque>
      )}

      {/* 5. Furgón y haciendas */}
      {esHacienda && (
        <Bloque titulo="Furgón" tono="amarillo">
          <div className="form-row">
            <div className="form-group" style={grupo}>
              <label>Placa del furgón</label>
              <input name="furgonPlaca" value={form.furgonPlaca} onChange={onInput} />
            </div>
            <div className="form-group" style={{ minWidth: 200 }}>
              <label>Chofer del furgón</label>
              <input name="furgonChoferNombre" value={form.furgonChoferNombre} onChange={onInput} placeholder="Nombre" />
            </div>
            <div className="form-group" style={grupo}>
              <label>Cédula del chofer</label>
              <input name="furgonChoferCedula" value={form.furgonChoferCedula} onChange={onInput} />
            </div>
          </div>

          <h3 style={{ ...subtitulo, margin: '8px 0 -6px' }}>Haciendas</h3>
          <p style={{ ...ayudaTxt, margin: 0 }}>Hasta {MAX_HACIENDAS}. La primera es obligatoria, con su cantidad de sacos.</p>
          {form.haciendas.map((h, i) => (
            <div key={i} style={tarjeta}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: '0.85rem', color: '#1e3a5f' }}>Hacienda {i + 1}</strong>
                {form.haciendas.length > 1 && (
                  <button
                    type="button" className="btn-secondary icon-btn" title={`Quitar hacienda ${i + 1}`} aria-label={`Quitar hacienda ${i + 1}`}
                    onClick={() => setForm((f) => ({ ...f, haciendas: f.haciendas.filter((_, j) => j !== i) }))}
                  >
                    <Trash2 size={14} color="#c53030" />
                  </button>
                )}
              </div>
              <div className="form-row">
                <div className="form-group" style={{ minWidth: 220 }}>
                  <label>Nombre de la hacienda {i === 0 ? '*' : ''}</label>
                  <input value={h.nombre} onChange={(e) => setHacienda(i, { nombre: e.target.value })} placeholder="Ej: La Esperanza" />
                </div>
                <div className="form-group" style={grupo}>
                  <label>Guía</label>
                  <input value={h.guia} onChange={(e) => setHacienda(i, { guia: e.target.value })} />
                </div>
                <div className="form-group" style={grupo}>
                  <label>Sacos {i === 0 ? '*' : ''}</label>
                  <input type="number" min="0" value={h.sacos} onChange={(e) => setHacienda(i, { sacos: e.target.value })} placeholder="Ej: 120" />
                </div>
              </div>
              {bloqueCampos(camposHacienda, h.campos, (id, v) => setHacienda(i, { campos: { ...h.campos, [id]: v } }))}
            </div>
          ))}
          {form.haciendas.length < MAX_HACIENDAS && (
            <button
              type="button" className="btn-secondary" style={{ alignSelf: 'flex-start', padding: '6px 14px', fontSize: '0.82rem' }}
              onClick={() => setForm((f) => ({ ...f, haciendas: [...f.haciendas, haciendaVacia()] }))}
            >
              <Plus size={14} /> Agregar hacienda
            </button>
          )}
        </Bloque>
      )}

      {/* 6. Campos generales configurados */}
      {camposGenerales.length > 0 && (
        <Bloque titulo="Otros datos de la guía" tono="neutro">
          {bloqueCampos(camposGenerales, form.camposGenerales, (id, v) => setForm((f) => ({ ...f, camposGenerales: { ...f.camposGenerales, [id]: v } })))}
        </Bloque>
      )}

      {/* 7. Firma */}
      <Bloque titulo="Firma del cliente" tono="neutro">
        <div className="form-row">
          <div className="form-group" style={{ minWidth: 260, maxWidth: 360 }}>
            <label>Momento de la firma</label>
            <select name="firmaMomento" value={form.firmaMomento} onChange={onInput}>
              <option value="">Según el cliente / configuración</option>
              <option value="SALIDA">Al salir</option>
              <option value="LLEGADA">Al llegar</option>
              <option value="AMBOS">En los dos momentos</option>
            </select>
            <span style={ayudaChica}>Solo cámbialo si este viaje es distinto al acuerdo con el cliente.</span>
          </div>
        </div>
      </Bloque>

      {/* 8. Observaciones */}
      <div className="form-group">
        <label>Observaciones (opcional)</label>
        <textarea name="observaciones" value={form.observaciones} onChange={onInput} rows={2} />
      </div>
    </FormModal>
  );
}
