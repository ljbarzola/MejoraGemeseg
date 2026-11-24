import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FolderOpen, FileText, Lock, Package, Printer, Save, Plus, RotateCcw, Send, TriangleAlert, Users } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import DateInput from '../../components/common/DateInput';
import ErrorBanner from '../../components/common/ErrorBanner';
import SoloAdminDialog from '../../components/common/SoloAdminDialog';
import CatalogPanel from '../../components/ventas/cotizador/CatalogPanel';
import CatalogManager from '../../components/ventas/cotizador/CatalogManager';
import DuplicateQuoteModal from '../../components/ventas/cotizador/DuplicateQuoteModal';
import HistoryModal from '../../components/ventas/cotizador/HistoryModal';
import InstallPicker from '../../components/ventas/cotizador/InstallPicker';
import MarginConfig from '../../components/ventas/cotizador/MarginConfig';
import NumInput from '../../components/ventas/cotizador/NumInput';
import PriceChangesModal from '../../components/ventas/cotizador/PriceChangesModal';
import ProductDetailModal from '../../components/ventas/cotizador/ProductDetailModal';
import { ProductFormModal } from '../../components/ventas/cotizador/CatalogForms';
import VentasPageHeader from '../../components/ventas/VentasPageHeader';
import QuoteDetail from '../../components/ventas/cotizador/QuoteDetail';
import CustodiaModal from '../../components/ventas/cotizador/CustodiaModal';
import EnviarClienteModal from '../../components/ventas/cotizador/EnviarClienteModal';
import QuotePrint from '../../components/ventas/cotizador/QuotePrint';
import QuoteTotals from '../../components/ventas/cotizador/QuoteTotals';
import { EditAccessModal, ShareQuoteModal } from '../../components/ventas/cotizador/ShareModals';
import { SaveTemplateModal, TemplatesModal } from '../../components/ventas/cotizador/TemplatesModals';
import { useCompany } from '../../contexts/ThemeContext';
import { usePerm } from '../../contexts/PermissionsContext';
import { useToast } from '../../contexts/ToastContext';
import { getUser } from '../../services/auth.service';
import { getMe } from '../../services/user.service';
import { getSalesContacts, type SalesClient, type SalesContact } from '../../services/ventas.service';
import ClienteDirectorioInput from '../../components/ventas/cotizador/ClienteDirectorioInput';
import OportunidadSelector, { elegidaDe } from '../../components/ventas/cotizador/OportunidadSelector';
import { TELEFONO_POR_DEFECTO } from '../../utils/telefono';
import {
  changeCotQuoteStatus,
  checkCotQuoteNumber,
  createCotQuote,
  createCotTemplate,
  deleteCotQuote,
  deleteCotTemplate,
  getCotCatalogo,
  getCotCondicionesPilares,
  getCotLimites,
  getCotKits,
  getCotNextNumber,
  getCotQuote,
  getCotQuoteOportunidad,
  getCotQuotes,
  getCotTemplates,
  setCotQuoteOportunidad,
  updateCotQuote,
  getCotOportunidad,
  marcarCotizacionPrincipal,
  type CotDeOportunidad,
  type CotOportunidadOpcion,
  type CotQuoteInput,
} from '../../services/cotizador.service';
import {
  clearDraftLocal,
  DEFAULT_CONDITIONS,
  draftFromQuote,
  draftHasContent,
  emptyDraft,
  loadDraftLocal,
  saveDraftLocal,
  type QuoteDraft,
} from '../../utils/cotizador/draft';
import { apiError, todayISO } from '../../utils/cotizador/format';
import { debePreguntarReemplazo, pilarUnicoDeOportunidad } from '../../utils/cotizador/condiciones';
import { PILARES, nombrePilarServicio, SIN_PILAR_SERVICIO } from '../../utils/pilares';
import {
  buildCatalogMap,
  computeQuote,
  dropSnapshots,
  stripSnapshots,
  withSnapshots,
  type PriceChange,
} from '../../utils/cotizador/pricing';
import { calcularAlertas, SIN_LIMITES, type CotLimites } from '../../utils/cotizador/alertas';
import { addInstall, addKit, addOrReplaceCustodia, addProduct, newProductLine } from '../../utils/cotizador/quoteState';
import { lineaDesdeResultado, type CotCustodiaLine } from '../../utils/cotizador/custodia';
import { calcularCustodia } from '../../services/cotizador-custodia.service';
import { getConversacion } from '../../services/whatsappBot.service';
import type {
  CotInstall,
  CotKit,
  CotLine,
  CotProduct,
  CotQuote,
  CotStatus,
  CotTemplate,
  DiscountType,
} from '../../utils/cotizador/types';
import { COT_STATUS_LABEL } from '../../utils/cotizador/types';
import './cotizador.css';

const SPLIT_KEY = 'cotizador:ancho-catalogo';
const SPLIT_DEFAULT = 40;
const SPLIT_MIN = 25;
const SPLIT_MAX = 65;

type ClientField = 'name' | 'ruc' | 'phone' | 'email';
const REQUERIDOS: { key: ClientField; label: string }[] = [
  { key: 'name', label: 'Cliente' },
  { key: 'ruc', label: 'RUC/Cédula' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'email', label: 'Email' },
];

export default function CotizadorPage() {
  const user = getUser();
  const { showToast } = useToast();
  const { theme } = useCompany();
  const { canWrite } = usePerm();
  const puedeEscribir = canWrite('VENTAS');

  // Mi teléfono (de mi perfil): sale en el encabezado de las cotizaciones que son mías.
  const [miTelefono, setMiTelefono] = useState('');
  useEffect(() => {
    getMe()
      .then((p) => setMiTelefono(p.phone ?? ''))
      .catch(() => {
        /* sin teléfono propio se usa el de respaldo */
      });
  }, []);

  // ---------------- Ancho del catálogo (divisor arrastrable, como en el cotizador original) ----------------
  const splitRef = useRef<HTMLDivElement>(null);
  const [splitPct, setSplitPct] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(SPLIT_KEY));
      return Number.isFinite(v) && v >= SPLIT_MIN && v <= SPLIT_MAX ? v : SPLIT_DEFAULT;
    } catch {
      return SPLIT_DEFAULT;
    }
  });
  const [arrastrando, setArrastrando] = useState(false);
  const guardarSplit = useCallback((pct: number) => {
    const v = Math.round(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct)) * 10) / 10;
    setSplitPct(v);
    try {
      localStorage.setItem(SPLIT_KEY, String(v));
    } catch {
      /* sin almacenamiento: el ancho solo vale para esta visita */
    }
  }, []);
  const iniciarArrastre = (e: React.MouseEvent | React.TouchEvent) => {
    const caja = splitRef.current;
    if (!caja) return;
    e.preventDefault();
    setArrastrando(true);
    const mover = (ev: MouseEvent | TouchEvent) => {
      const x = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
      const r = caja.getBoundingClientRect();
      guardarSplit(((x - r.left) / r.width) * 100);
    };
    const soltar = () => {
      setArrastrando(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('touchmove', mover);
      window.removeEventListener('mouseup', soltar);
      window.removeEventListener('touchend', soltar);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', mover);
    window.addEventListener('touchmove', mover);
    window.addEventListener('mouseup', soltar);
    window.addEventListener('touchend', soltar);
  };

  // ---------------- Catálogo ----------------
  const [products, setProducts] = useState<CotProduct[]>([]); // activos E inactivos: las cotizaciones viejas los siguen usando
  const [installs, setInstalls] = useState<CotInstall[]>([]);
  const [kits, setKits] = useState<CotKit[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  const byCode = useMemo(() => buildCatalogMap(products), [products]);
  const listados = useMemo(() => products.filter((p) => p.isActive), [products]);
  // Mismos ayudantes que el Catálogo, para editar un producto desde la cotización con el mismo formulario.
  const subcats = useMemo(
    () => [...new Set(products.map((p) => p.subcategory).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [products],
  );
  const suppliers = useMemo(
    () => [...new Set(products.map((p) => p.supplier).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [products],
  );
  const esAdminOGerente = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const recargarCatalogo = useCallback(async () => {
    try {
      const [cat, ks] = await Promise.all([getCotCatalogo(true), getCotKits()]);
      setProducts(cat.productos);
      setInstalls(cat.instalaciones.filter((i) => i.isActive));
      setKits(ks);
      setErrorCarga('');
    } catch (e) {
      setErrorCarga(apiError(e, 'No se pudo cargar el catálogo. Revisa tu conexión e intenta de nuevo.'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargarCatalogo();
  }, [recargarCatalogo]);

  // ---------------- Límites de precio (solo avisos) ----------------
  const [limites, setLimites] = useState<CotLimites>(SIN_LIMITES);
  useEffect(() => {
    getCotLimites()
      .then(setLimites)
      .catch(() => {
        /* sin límites cargados no hay avisos; nunca se bloquea cotizar */
      });
  }, []);

  // ---------------- Borrador de la cotización ----------------
  const [draft, setDraft] = useState<QuoteDraft>(() => emptyDraft());
  const restaurado = useRef(false);

  // Al entrar se recupera el borrador que quedó en este navegador (como hacía el cotizador original)
  useEffect(() => {
    if (restaurado.current || !user) return;
    restaurado.current = true;
    const local = loadDraftLocal(user.id);
    if (local && draftHasContent(local)) {
      // Se retoma como cotización sin guardar: si el número ya existe, al guardar se ofrece actualizarla o crear una nueva
      setDraft({ ...local, quoteId: null, access: null });
    }
  }, [user]);

  // Guardado automático del borrador en el navegador
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      if (draftHasContent(draft)) saveDraftLocal(user.id, draft);
      else clearDraftLocal(user.id);
    }, 400);
    return () => clearTimeout(t);
  }, [draft, user]);

  // Número sugerido (no se gasta): el definitivo lo asigna el servidor al guardar
  useEffect(() => {
    if (draft.quoteId !== null || !draft.numberIsTentative) return;
    let vigente = true;
    getCotNextNumber(draft.quoteDate)
      .then((r) => {
        if (vigente) setDraft((d) => (d.numberIsTentative && d.quoteId === null ? { ...d, quoteNumber: r.quoteNumber } : d));
      })
      .catch(() => {
        /* sin número sugerido: se asigna al guardar */
      });
    return () => {
      vigente = false;
    };
  }, [draft.quoteId, draft.numberIsTentative, draft.quoteDate]);

  const patch = (p: Partial<QuoteDraft>) => setDraft((d) => ({ ...d, ...p }));
  const setItems = (items: CotLine[]) => patch({ items });

  const readOnly = draft.quoteId !== null && draft.access !== 'owner' && draft.access !== 'editor';

  // Firma de la última versión guardada: «Enviar al cliente» avisa si lo que hay en pantalla aún no se guardó
  // (el cliente ve la versión guardada, no la de la pantalla).
  const firmaGuardada = useRef<string | null>(null);
  const firmaDe = (d: QuoteDraft) =>
    JSON.stringify([d.quoteDate, d.client, d.items, d.supplierMargins, d.installMargin, d.discountType, d.discountValue, d.conditions, d.notes, d.pilar, d.oportunidad?.id ?? null]);
  // Cotización guardada cuya oportunidad ya se consultó al servidor: solo entonces «sin oportunidad» en
  // pantalla significa «se la quitaron» (y al guardar se quita también en el servidor).
  const oportunidadLeidaDe = useRef<number | null>(null);
  // Id de la oportunidad que el SERVIDOR tiene unida a la cotización en pantalla (null = ninguna o no se sabe).
  const oportunidadGuardada = useRef<number | null>(null);
  const oportunidadRef = useRef<HTMLInputElement | null>(null);
  const [errorOportunidad, setErrorOportunidad] = useState(false);
  const pedirOportunidad = (para: string) => {
    setErrorOportunidad(true);
    showToast(`Elige la oportunidad de esta cotización antes de ${para}.`, 'error');
    oportunidadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => oportunidadRef.current?.focus(), 300);
  };
  const [enviarCliente, setEnviarCliente] = useState(false);

  // Condiciones generales por pilar (Configuración → Servicios). Se leen al entrar; si falla la
  // consulta se sigue con el texto de siempre, que es con el que nacía la cotización.
  const condicionesPorPilar = useRef<Record<string, string>>({});
  const textoAutoRef = useRef<string | null>(null);
  const [preguntaPilar, setPreguntaPilar] = useState<{ pilar: string; texto: string } | null>(null);
  useEffect(() => {
    getCotCondicionesPilares()
      .then((filas) => {
        condicionesPorPilar.current = Object.fromEntries(filas.map((f) => [f.pilar, f.texto]));
      })
      .catch(() => {
        /* sin configuración: DEFAULT_CONDITIONS */
      });
  }, []);
  const textoDePilar = (pilar: string) => condicionesPorPilar.current[pilar] ?? DEFAULT_CONDITIONS;

  /** Cambia el pilar y ofrece su texto de condiciones, preguntando solo si el usuario editó el campo. */
  const aplicarPilar = (pilar: string | null, actual: string) => {
    if (!pilar) return patch({ pilar: null });
    const texto = textoDePilar(pilar);
    patch({ pilar });
    if (debePreguntarReemplazo(actual, textoAutoRef.current, DEFAULT_CONDITIONS)) {
      setPreguntaPilar({ pilar, texto });
      return;
    }
    patch({ conditions: texto });
    textoAutoRef.current = texto;
    setPreguntaPilar(null);
  };

  const comp = useMemo(
    () =>
      computeQuote({
        items: draft.items,
        catalog: byCode,
        supplierMargins: draft.supplierMargins,
        installMargin: draft.installMargin,
        discountType: draft.discountType,
        discountValue: draft.discountValue,
      }),
    [draft.items, draft.supplierMargins, draft.installMargin, draft.discountType, draft.discountValue, byCode],
  );
  // Avisos de precio bajo: solo avisan, nunca impiden guardar ni enviar
  const alertas = useMemo(() => calcularAlertas(comp, byCode, limites), [comp, byCode, limites]);

  // ---------------- Diálogos ----------------
  const [verHistorial, setVerHistorial] = useState(false);
  const [quotes, setQuotes] = useState<CotQuote[]>([]);
  const [quotesCargando, setQuotesCargando] = useState(false);
  const [quotesError, setQuotesError] = useState('');

  const [verPlantillas, setVerPlantillas] = useState(false);
  const [templates, setTemplates] = useState<CotTemplate[]>([]);
  const [tplCargando, setTplCargando] = useState(false);
  const [tplError, setTplError] = useState('');
  const [guardarPlantilla, setGuardarPlantilla] = useState(false);

  const [verCatalogo, setVerCatalogo] = useState(false);
  const [verAccesoEdicion, setVerAccesoEdicion] = useState(false);
  const [compartir, setCompartir] = useState<CotQuote | null>(null);
  const [elegirInstalacion, setElegirInstalacion] = useState(false);
  // Calculadora de custodia móvil: `linea` = una ya agregada que se recalcula; null = una nueva.
  const [custodiaModal, setCustodiaModal] = useState<{ linea: CotCustodiaLine | null } | null>(null);
  const [detalleCodigo, setDetalleCodigo] = useState<string | null>(null);
  // Producto del catálogo abierto para editar desde la cotización (solo quien puede editar Ventas).
  const [productoForm, setProductoForm] = useState<CotProduct | null>(null);
  const [cambiosPrecio, setCambiosPrecio] = useState<PriceChange[] | null>(null);
  const [confirmNueva, setConfirmNueva] = useState(false);
  const [soloAdmin, setSoloAdmin] = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState<{
    numero: string;
    canUpdate: boolean;
    resolver: (a: 'update' | 'create_new' | null) => void;
  } | null>(null);

  const pedirEscritura = (accion: string, fn: () => void) => (puedeEscribir ? fn() : setSoloAdmin(accion));

  const abrirHistorial = async () => {
    setVerHistorial(true);
    setQuotesCargando(true);
    setQuotesError('');
    try {
      setQuotes(await getCotQuotes());
    } catch (e) {
      setQuotesError(apiError(e, 'No se pudo cargar el historial. Intenta de nuevo.'));
    } finally {
      setQuotesCargando(false);
    }
  };

  const abrirPlantillas = async () => {
    setVerPlantillas(true);
    setTplCargando(true);
    setTplError('');
    try {
      setTemplates(await getCotTemplates());
    } catch (e) {
      setTplError(apiError(e, 'No se pudieron cargar las plantillas. Intenta de nuevo.'));
    } finally {
      setTplCargando(false);
    }
  };

  // ---------------- Agregar al carrito ----------------
  const avisoSoloLectura = () =>
    showToast('Esta cotización es de solo lectura. Usa "Crear copia" en el historial para editar una copia tuya.', 'error');

  const onAddProduct = (p: CotProduct) => {
    if (readOnly) return avisoSoloLectura();
    setItems(addProduct(draft.items, p));
    showToast(`✓ ${p.name.slice(0, 40)}${p.name.length > 40 ? '…' : ''} agregado`, 'success');
  };

  const onAddKit = (k: CotKit) => {
    if (readOnly) return avisoSoloLectura();
    const items = addKit(draft.items, k, byCode);
    if (items === draft.items) return showToast('El kit no tiene productos disponibles en el catálogo', 'error');
    setItems(items);
    showToast(`✓ Kit "${k.name}" agregado`, 'success');
  };

  const onConfirmCustodia = (linea: CotCustodiaLine) => {
    setItems(addOrReplaceCustodia(draft.items, linea));
    setCustodiaModal(null);
    showToast('✓ Custodia móvil agregada a la cotización', 'success');
  };

  const onPickInstall = (s: CotInstall) => {
    setItems(addInstall(draft.items, s));
    setElegirInstalacion(false);
    showToast(`✓ ${s.name.slice(0, 40)} agregado`, 'success');
  };

  // ---------------- Cargar una cotización / plantilla ----------------
  const cargarCotizacion = (q: CotQuote, copia = false) => {
    const d = draftFromQuote(q);
    if (copia) {
      // Copia independiente: queda sin guardar, con número nuevo sugerido y a mi nombre
      setDraft({
        ...d,
        quoteId: null,
        access: null,
        status: 'borrador',
        numberIsTentative: true,
        quoteNumber: '',
        quoteDate: todayISO(),
        ownerName: user?.fullName ?? '',
      });
      showToast('✓ Copia creada — edítala y guárdala como tuya', 'success');
    } else {
      setDraft(d);
      firmaGuardada.current = firmaDe(d);
      showToast(`✓ Cotización cargada: ${q.quoteNumber}`, 'success');
      const r = computeQuote({
        items: q.items,
        catalog: byCode,
        supplierMargins: q.supplierMargins,
        installMargin: q.installMargin,
        discountType: q.discountType,
        discountValue: q.discountValue,
      });
      if (r.priceChanges.length > 0) setCambiosPrecio(r.priceChanges);
    }
    setClientErrors({});
    setErrorOportunidad(false);
    setVerHistorial(false);
    // La oportunidad viene aparte. Una copia conserva la oportunidad del original (suele ser otra versión
    // de la misma negociación); se puede cambiar antes de guardarla.
    oportunidadLeidaDe.current = null;
    oportunidadGuardada.current = null;
    getCotQuoteOportunidad(q.id)
      .then((r) => {
        const opp = r.oportunidad ? elegidaDe(r.oportunidad) : null;
        if (!copia) {
          oportunidadLeidaDe.current = q.id;
          oportunidadGuardada.current = opp?.id ?? null;
        }
        setDraft((d) => {
          if (copia ? d.quoteId !== null : d.quoteId !== q.id) return d;
          const nuevo = { ...d, oportunidad: opp };
          if (!copia) firmaGuardada.current = firmaDe(nuevo);
          return nuevo;
        });
      })
      .catch(() => {
        /* sin la oportunidad a la vista: al enviar se pedirá elegirla */
      });
  };

  // Elegir oportunidad: los datos del cliente pasan a ser los de esa oportunidad (la cotización es para ese
  // cliente). Si ya estaban escritos los de otro cliente, se avisa del cambio.
  const elegirOportunidad = async (o: CotOportunidadOpcion | null) => {
    setErrorOportunidad(false);
    if (!o) return patch({ oportunidad: null });
    const mismo =
      (o.cliente.ruc && o.cliente.ruc.trim() === draft.client.ruc.trim()) ||
      o.cliente.nombre.trim().toLowerCase() === draft.client.name.trim().toLowerCase();
    setDraft((d) => ({ ...d, oportunidad: elegidaDe(o) }));
    // Un solo pilar en los servicios de la oportunidad → se preselecciona y se ofrece su texto.
    // Con varios, el selector queda abierto para que la persona elija.
    const pilar = pilarUnicoDeOportunidad(o.pilares);
    if (pilar) aplicarPilar(pilar, draft.conditions);
    else if (!o.pilares.includes(draft.pilar ?? '')) patch({ pilar: null });
    if (!mismo) {
      const habiaOtro = draft.client.name.trim() !== '';
      await traerDelDirectorio({
        id: o.cliente.id,
        name: o.cliente.nombre,
        ruc: o.cliente.ruc,
        phone: o.cliente.telefono,
        address: o.cliente.direccion,
        email: o.cliente.email,
      } as SalesClient);
      if (habiaOtro) showToast(`Los datos del cliente se cambiaron a los de «${o.cliente.nombre}».`, 'success');
    }
  };

  // Desde la notificación «Tu cotización fue vista» (/ventas/cotizador?cotizacion=<id>&seguimiento=1):
  // se carga esa cotización y se abre su seguimiento. Espera al catálogo para calcular bien los precios.
  const [searchParams, setSearchParams] = useSearchParams();
  // «Cotizar» desde Oportunidades (/ventas/cotizador?oportunidad=<id>): cotización nueva con el cliente ya
  // puesto y unida a esa oportunidad. Si hay una cotización sin guardar en pantalla, se pregunta antes.
  const [cotizarPara, setCotizarPara] = useState<CotOportunidadOpcion | null>(null);
  const empezarParaOportunidad = async (o: CotOportunidadOpcion) => {
    setCotizarPara(null);
    const pilar = pilarUnicoDeOportunidad(o.pilares);
    const texto = pilar ? textoDePilar(pilar) : DEFAULT_CONDITIONS;
    setDraft({
      ...emptyDraft(),
      conditions: texto,
      pilar,
      ownerName: user?.fullName ?? '',
      oportunidad: elegidaDe(o),
    });
    textoAutoRef.current = texto;
    setPreguntaPilar(null);
    setClientErrors({});
    setErrorGuardar('');
    setErrorOportunidad(false);
    firmaGuardada.current = null;
    oportunidadLeidaDe.current = null;
    oportunidadGuardada.current = null;
    await traerDelDirectorio({
      id: o.cliente.id,
      name: o.cliente.nombre,
      ruc: o.cliente.ruc,
      phone: o.cliente.telefono,
      address: o.cliente.direccion,
      email: o.cliente.email,
    } as SalesClient);
    showToast(`Nueva cotización para «${o.cliente.nombre}»`, 'success');
  };
  useEffect(() => {
    const oppId = Number(searchParams.get('oportunidad'));
    if (!oppId || cargando) return;
    setSearchParams({}, { replace: true });
    getCotOportunidad(oppId)
      .then((o) => {
        if (draftHasContent(draft) && draft.quoteId === null) setCotizarPara(o);
        else void empezarParaOportunidad(o);
      })
      .catch((e) => showToast(apiError(e, 'No se pudo abrir esa oportunidad.'), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, cargando]);

  // «Editar en el Cotizador» desde Ventas › Conversaciones (/ventas/cotizador?conversacion=<id>&mensaje=<id>):
  // abre la cotización que calculó el bot como borrador nuevo (con el nombre y teléfono del cliente de WhatsApp)
  // y deja UN botón para volver a esa conversación. Si hay una cotización sin guardar en pantalla, se pregunta.
  const navigate = useNavigate();
  const [volverA, setVolverA] = useState<number | null>(null);
  const [cotizarDesdeChat, setCotizarDesdeChat] = useState<{ conversacion: number; mensaje: number } | null>(null);
  const empezarDesdeConversacion = async (conversacion: number, mensaje: number) => {
    setCotizarDesdeChat(null);
    try {
      const d = await getConversacion(conversacion);
      const cot = d.mensajes.find((x) => x.id === mensaje)?.cotizacion;
      if (!cot) throw new Error('El mensaje ya no tiene una cotización.');
      let items: typeof draft.items = [];
      if (cot.tipo === 'CUSTODIA') {
        const r = await calcularCustodia(cot.entrada);
        items = [lineaDesdeResultado(r.entrada, r.resultado)];
      } else {
        items = ((cot.items ?? []) as { codigo: string; cantidad: number }[])
          .filter((i) => byCode.has(i.codigo))
          .map((i) => newProductLine(i.codigo, Number(i.cantidad) || 1));
        if (!items.length) throw new Error('No se pudieron cargar los productos de esa cotización.');
      }
      const base = emptyDraft();
      setDraft({
        ...base,
        ownerName: user?.fullName ?? '',
        items,
        client: { ...base.client, name: d.conversacion.contactName ?? '', phone: `+${d.conversacion.phone}` },
      });
      setClientErrors({});
      setErrorGuardar('');
      setErrorOportunidad(false);
      firmaGuardada.current = null;
      oportunidadLeidaDe.current = null;
      oportunidadGuardada.current = null;
      setVolverA(conversacion);
      showToast('Cotización del bot abierta: edítala, guárdala y vuelve a la conversación.', 'success');
    } catch (e) {
      showToast(apiError(e, 'No se pudo abrir la cotización de la conversación.'), 'error');
    }
  };
  useEffect(() => {
    const conversacion = Number(searchParams.get('conversacion'));
    const mensaje = Number(searchParams.get('mensaje'));
    if (!conversacion || !mensaje || cargando) return;
    setSearchParams({}, { replace: true });
    if (draftHasContent(draft) && draft.quoteId === null) setCotizarDesdeChat({ conversacion, mensaje });
    else void empezarDesdeConversacion(conversacion, mensaje);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, cargando]);

  useEffect(() => {
    const id = Number(searchParams.get('cotizacion'));
    if (!id || cargando) return;
    const abrirSeguimiento = searchParams.get('seguimiento') === '1';
    setSearchParams({}, { replace: true });
    getCotQuote(id)
      .then((q) => {
        cargarCotizacion(q);
        if (abrirSeguimiento) setEnviarCliente(true);
      })
      .catch((e) => showToast(apiError(e, 'No se pudo abrir esa cotización. Búscala en el Historial.'), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, cargando]);

  const cargarPlantilla = (t: CotTemplate) => {
    setDraft({
      ...emptyDraft(),
      ownerName: user?.fullName ?? '',
      client: { ...emptyDraft().client, ...t.client },
      items: stripSnapshots(t.items),
      supplierMargins: t.supplierMargins ?? {},
      installMargin: t.installMargin,
    });
    setClientErrors({});
    setVerPlantillas(false);
    showToast(`✅ Plantilla cargada: ${t.name}`, 'success');
  };

  const usarPreciosActuales = () => {
    const codes = new Set((cambiosPrecio ?? []).map((c) => c.code));
    setItems(dropSnapshots(draft.items, codes));
    setCambiosPrecio(null);
    showToast('✓ Precios actualizados. Guarda la cotización para conservarlos.', 'success');
  };

  // ---------------- Guardar ----------------
  const [clientErrors, setClientErrors] = useState<Partial<Record<ClientField, boolean>>>({});
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const clientRefs = useRef<Partial<Record<ClientField, HTMLInputElement | null>>>({});

  // Eligió a alguien del Directorio: se rellenan todos los datos del cliente (reemplazan lo anterior para no
  // dejar mezclados los de otro cliente). Contacto = primera persona de la ficha; si el cliente no tiene teléfono
  // o correo propios, se usan los de esa persona.
  const traerDelDirectorio = async (c: SalesClient) => {
    let persona: SalesContact | undefined;
    try {
      persona = (await getSalesContacts(c.id))[0];
    } catch {
      // Sin acceso a los contactos: se rellena lo demás
    }
    patch({
      client: {
        name: c.name,
        ruc: c.ruc ?? '',
        phone: c.phone || persona?.phones?.[0]?.value || '',
        address: c.address ?? '',
        contact: persona ? [persona.name, persona.role].filter(Boolean).join(' - ') : '',
        email: c.email || persona?.emails?.[0]?.value || '',
      },
    });
    setClientErrors({});
  };

  // Monto de la oportunidad al guardar (2026-11-17, pedido de Leidy: nunca reemplazarlo en silencio).
  //  · Esta cotización ya es la principal → el servidor ya puso su total: solo se avisa.
  //  · No es la principal y se acaba de unir → se pregunta si su total pasa a ser el monto (la oportunidad tenía
  //    un monto escrito a mano, u otra cotización principal). Si el monto ya es igual y no hay otra principal, se
  //    marca sola sin preguntar.
  //  · No es la principal y ya estaba unida → no se pregunta otra vez (se cambia en Oportunidades → «Marcar principal»).
  const [preguntaMonto, setPreguntaMonto] = useState<{
    quoteId: number;
    oportunidadId: number;
    total: number;
    monto: number | null;
    principalActual: CotDeOportunidad['principalActual'];
  } | null>(null);
  const dinero = (n: number | null) =>
    n === null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const decidirMonto = async (quoteId: number, oportunidadId: number, r: CotDeOportunidad, unionNueva: boolean) => {
    if (r.total === null) return;
    if (r.principal) {
      showToast(`Monto de la oportunidad actualizado a ${dinero(r.total)}`, 'success');
      return;
    }
    if (!r.principalActual && r.montoOportunidad !== null && Math.abs(r.montoOportunidad - r.total) < 0.005) {
      await marcarCotizacionPrincipal(oportunidadId, quoteId).catch(() => undefined);
      return;
    }
    if (unionNueva) {
      setPreguntaMonto({ quoteId, oportunidadId, total: r.total, monto: r.montoOportunidad, principalActual: r.principalActual });
    }
  };
  const usarComoMonto = async () => {
    const p = preguntaMonto;
    setPreguntaMonto(null);
    if (!p) return;
    try {
      await marcarCotizacionPrincipal(p.oportunidadId, p.quoteId);
      showToast(`Monto de la oportunidad actualizado a ${dinero(p.total)}`, 'success');
    } catch (e) {
      showToast(apiError(e, 'No se pudo cambiar el monto de la oportunidad. Hazlo desde Oportunidades → Editar → «Marcar principal».'), 'error');
    }
  };

  const preguntarDuplicado = (numero: string, canUpdate: boolean) =>
    new Promise<'update' | 'create_new' | null>((resolver) => setDuplicado({ numero, canUpdate, resolver }));

  const guardar = async () => {
    if (!puedeEscribir) return setSoloAdmin('guarde cotizaciones');
    if (readOnly) return avisoSoloLectura();
    setErrorGuardar('');

    const faltan = REQUERIDOS.filter((r) => !draft.client[r.key].trim());
    if (faltan.length > 0) {
      setClientErrors(Object.fromEntries(faltan.map((f) => [f.key, true])));
      showToast('Campos obligatorios: ' + faltan.map((f) => f.label).join(', '), 'error');
      const primero = clientRefs.current[faltan[0].key];
      primero?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => primero?.focus(), 300);
      return;
    }
    if (draft.items.length === 0) return showToast('Agrega al menos un ítem a la cotización', 'error');

    const base = {
      quoteDate: draft.quoteDate,
      client: draft.client,
      items: withSnapshots(draft.items, byCode),
      installMargin: draft.installMargin,
      supplierMargins: draft.supplierMargins,
      discountType: draft.discountType,
      discountValue: draft.discountValue,
      conditions: draft.conditions,
      notes: draft.notes,
      pilar: draft.pilar,
    };
    const personalizado = !draft.numberIsTentative && draft.quoteNumber.trim() !== '';
    const numero = draft.quoteNumber.trim();

    setGuardando(true);
    try {
      let saved: CotQuote | null = null;
      if (draft.quoteId !== null) {
        // Cotización ya guardada que se está editando: igual que el original, se pregunta si se actualiza o se guarda como nueva
        const puedeActualizar = draft.access === 'owner' || draft.access === 'editor';
        const accion = await preguntarDuplicado(draft.quoteNumber, puedeActualizar);
        if (accion === 'update') {
          saved = await updateCotQuote(draft.quoteId, { ...base, quoteNumber: numero || undefined });
          showToast(`✓ Cotización actualizada: ${saved.quoteNumber}`, 'success');
        } else if (accion === 'create_new') {
          saved = await createCotQuote(base as CotQuoteInput);
          showToast(`✓ Cotización nueva guardada: ${saved.quoteNumber}`, 'success');
        }
      } else {
        let existente: { existe: boolean; existingId: number | null } = { existe: false, existingId: null };
        if (personalizado) existente = await checkCotQuoteNumber(numero);
        if (existente.existe) {
          const accion = await preguntarDuplicado(numero, existente.existingId !== null);
          if (accion === 'update' && existente.existingId !== null) {
            saved = await updateCotQuote(existente.existingId, { ...base, quoteNumber: numero });
            showToast(`✓ Cotización actualizada: ${saved.quoteNumber}`, 'success');
          } else if (accion === 'create_new') {
            saved = await createCotQuote(base as CotQuoteInput); // el servidor asigna un número nuevo
            showToast(`✓ Cotización nueva guardada: ${saved.quoteNumber}`, 'success');
          }
        } else {
          saved = await createCotQuote({ ...base, quoteNumber: personalizado ? numero : undefined } as CotQuoteInput);
          showToast(`✓ Cotización guardada: ${saved.quoteNumber}`, 'success');
        }
      }
      if (saved) {
        // Unión con la oportunidad: se manda la elegida; «sin oportunidad» solo se manda si es la misma
        // cotización y ya se sabía cuál tenía (si no, no se quitaría nada que no se vio).
        const elegida = draft.oportunidad;
        const mismaCotizacion = saved.id === draft.quoteId && oportunidadLeidaDe.current === saved.id;
        // ¿Se acaba de unir a esta oportunidad (cotización nueva, o antes era de otra o de ninguna)?
        const unionNueva = !mismaCotizacion || oportunidadGuardada.current !== (elegida?.id ?? null);
        let oportunidad = elegida;
        try {
          if (elegida || mismaCotizacion) {
            const r = await setCotQuoteOportunidad(saved.id, elegida?.id ?? null);
            oportunidad = r.oportunidad ? elegidaDe(r.oportunidad) : null;
            if (r.oportunidad) await decidirMonto(saved.id, r.oportunidad.id, r, unionNueva);
          }
          oportunidadLeidaDe.current = saved.id;
          oportunidadGuardada.current = oportunidad?.id ?? null;
        } catch (e) {
          showToast(apiError(e, 'La cotización se guardó, pero no se pudo unir a la oportunidad. Intenta guardar de nuevo.'), 'error');
        }
        const d = { ...draftFromQuote(saved), oportunidad };
        setDraft(d);
        firmaGuardada.current = firmaDe(d);
        setClientErrors({});
      }
    } catch (e) {
      setErrorGuardar(apiError(e, 'No se pudo guardar la cotización. Revisa los datos e intenta de nuevo.'));
    } finally {
      setGuardando(false);
    }
  };

  const guardarComoPlantilla = async (d: { name: string; description: string; clientType: string; industry: string }) => {
    if (!puedeEscribir) {
      setGuardarPlantilla(false);
      return setSoloAdmin('guarde plantillas');
    }
    await createCotTemplate({
      ...d,
      client: draft.client,
      items: stripSnapshots(draft.items),
      supplierMargins: draft.supplierMargins,
      installMargin: draft.installMargin,
    });
    setGuardarPlantilla(false);
    showToast(`✅ Plantilla guardada: ${d.name}`, 'success');
  };

  // ---------------- Nueva cotización / imprimir ----------------
  const nuevaCotizacion = () => {
    setDraft({ ...emptyDraft(), ownerName: user?.fullName ?? '' });
    oportunidadLeidaDe.current = null;
    oportunidadGuardada.current = null;
    setErrorOportunidad(false);
    setClientErrors({});
    setErrorGuardar('');
    if (user) clearDraftLocal(user.id);
    setConfirmNueva(false);
  };

  // El nombre del PDF sale del título de la pestaña: "COT-... - Cliente" (o solo el número si aún no hay cliente)
  useEffect(() => {
    const antes = () => {
      const nombre = [draft.quoteNumber.trim(), draft.client.name.trim()].filter(Boolean).join(' - ');
      if (nombre) document.title = nombre;
    };
    const titulo = document.title;
    const despues = () => {
      document.title = titulo;
    };
    window.addEventListener('beforeprint', antes);
    window.addEventListener('afterprint', despues);
    return () => {
      window.removeEventListener('beforeprint', antes);
      window.removeEventListener('afterprint', despues);
      document.title = titulo;
    };
  }, [draft.client.name, draft.quoteNumber]);

  const cambiarEstado = async (q: CotQuote, s: CotStatus) => {
    try {
      const upd = await changeCotQuoteStatus(q.id, s);
      setQuotes((qs) => qs.map((x) => (x.id === q.id ? upd : x)));
      setDraft((d) => (d.quoteId === q.id ? { ...d, status: s } : d));
      showToast(`Estado de ${q.quoteNumber}: ${COT_STATUS_LABEL[s]}`, 'success');
    } catch (e) {
      showToast(apiError(e, 'No se pudo cambiar el estado de la cotización'), 'error');
    }
  };

  const eliminarCotizacion = async (q: CotQuote) => {
    await deleteCotQuote(q.id);
    setQuotes((qs) => qs.filter((x) => x.id !== q.id));
    if (draft.quoteId === q.id) setDraft({ ...emptyDraft(), ownerName: user?.fullName ?? '' });
    showToast(`Cotización ${q.quoteNumber} eliminada`, 'success');
  };

  const detalle = detalleCodigo ? byCode.get(detalleCodigo) : undefined;
  // Clic en el producto de la cotización: abre el formulario del catálogo si puede editarlo; si no,
  // la ficha de solo lectura de siempre. Un producto eliminado (inactivo) no se puede editar.
  const abrirProducto = (code: string) => {
    const p = byCode.get(code);
    if (!p) return;
    if (puedeEscribir && !readOnly && p.isActive) setProductoForm(p);
    else setDetalleCodigo(p.code);
  };
  const accesoTexto =
    draft.access === 'shared'
      ? 'Esta cotización te la compartieron: la ves en solo lectura. Para modificarla crea una copia propia desde el historial.'
      : draft.access === 'admin'
        ? 'Estás viendo esta cotización como administrador (solo lectura). Para modificarla crea una copia propia desde el historial.'
        : '';
  // Teléfono que sale como emisor: el mío si la cotización es mía (o es nueva), el del dueño si no; si no hay, el de respaldo.
  const esMia = draft.quoteId === null || draft.access === 'owner';
  const telefonoEmisor = (esMia ? miTelefono : draft.ownerPhone) || TELEFONO_POR_DEFECTO;
  const cargoEmisor = draft.ownerName && user && draft.ownerName !== user.fullName ? '' : (user?.position ?? '');

  return (
    <div className="page-container cot-page">
      <div className="cot-screen">
        <VentasPageHeader
          title="Cotizador"
          description="Arma cotizaciones con el catálogo de productos y kits, calcula tus márgenes y descárgalas en PDF."
          actions={
            <>
              {volverA && (
                <button type="button" className="btn-secondary" onClick={() => navigate(`/ventas/conversaciones?c=${volverA}`)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ArrowLeft size={15} /> Volver a la conversación
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={() => setVerCatalogo(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Package size={15} /> Catálogo
              </button>
              <button type="button" className="btn-secondary" onClick={abrirHistorial} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FolderOpen size={15} /> Historial
              </button>
              <button type="button" className="btn-secondary" onClick={abrirPlantillas} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={15} /> Plantillas
              </button>
              <button type="button" className="btn-secondary" onClick={() => setVerAccesoEdicion(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Lock size={15} /> Compartir edición
              </button>
              <button
                type="button"
                className="auth-btn"
                onClick={() => (draftHasContent(draft) ? setConfirmNueva(true) : nuevaCotizacion())}
              >
                <Plus size={16} /> Nueva cotización
              </button>
            </>
          }
        />

        {errorCarga && (
          <div className="cot-banner warn" role="alert">
            <span style={{ flex: 1 }}>{errorCarga}</span>
            <button type="button" className="btn-secondary" onClick={recargarCatalogo}>
              <RotateCcw size={14} /> Reintentar
            </button>
          </div>
        )}

        <div className="cot-split" ref={splitRef} style={{ ['--cot-left' as string]: `${splitPct}%` }}>
          <CatalogPanel
            products={listados}
            kits={kits}
            byCode={byCode}
            supplierMargins={draft.supplierMargins}
            installMargin={draft.installMargin}
            loading={cargando}
            onAddProduct={onAddProduct}
            onAddKit={onAddKit}
          />

          <div
            className={`cot-divider${arrastrando ? ' active' : ''}`}
            role="separator"
            aria-orientation="vertical"
            aria-label="Arrastra para cambiar el ancho del catálogo (doble clic para restablecer)"
            tabIndex={0}
            onMouseDown={iniciarArrastre}
            onTouchStart={iniciarArrastre}
            onDoubleClick={() => guardarSplit(SPLIT_DEFAULT)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') guardarSplit(splitPct - 2);
              else if (e.key === 'ArrowRight') guardarSplit(splitPct + 2);
            }}
          />

          <div className="cot-right">
            {readOnly && (
              <div className="cot-banner lock" role="status">
                <Lock size={16} /> <span>{accesoTexto}</span>
              </div>
            )}
            {draft.access === 'editor' && (
              <div className="cot-banner info" role="status">
                Estás editando una cotización de <strong>{draft.ownerName}</strong> (te dio edición total). Seguirá a su
                nombre.
              </div>
            )}
            {comp.legacyCount > 0 && (
              <div className="cot-banner warn" role="alert">
                <span>
                  <strong>Cotización antigua:</strong> {comp.legacyCount} producto(s) solo se identificaron por su posición en
                  la lista del sistema anterior. Verifica que sean los correctos (están marcados con «verificar producto»)
                  antes de enviarla.
                </span>
              </div>
            )}
            {comp.priceChanges.length > 0 && draft.quoteId !== null && (
              <div className="cot-banner info" role="status">
                <span style={{ flex: 1 }}>
                  Esta cotización conserva los precios de cuando se hizo. {comp.priceChanges.length} producto(s) hoy cuestan otra
                  cosa.
                </span>
                <button type="button" className="btn-secondary" onClick={() => setCambiosPrecio(comp.priceChanges)}>
                  Ver cambios
                </button>
              </div>
            )}
            {comp.missing.length > 0 && (
              <div className="cot-banner warn" role="alert">
                <span>
                  {comp.missing.length} producto(s) de esta cotización ya no existen en el catálogo ({comp.missing.join(', ')}).
                  No suman al total: quítalos o reemplázalos.
                </span>
              </div>
            )}

            <div className="cot-sheet">
            <header className="cot-doc-head">
              <div className="cot-doc-top">
                <div className="cot-doc-logo">
                  {theme.logoUrl ? <img src={theme.logoUrl} alt={theme.name} /> : <strong>{theme.name}</strong>}
                </div>
                <div className="cot-doc-title">
                  <strong>Cotizador {theme.name}</strong>
                  <span>{draft.ownerName || user?.fullName || ''}</span>
                  <span className="cot-doc-phone">Tel. {telefonoEmisor}</span>
                </div>
              </div>
              <div className="cot-doc-fields">
                <div className="cot-field">
                  <label htmlFor="cot-num">N.º de cotización</label>
                  <input
                    id="cot-num"
                    className="cot-mono"
                    value={draft.quoteNumber}
                    disabled={readOnly}
                    onChange={(e) => patch({ quoteNumber: e.target.value, numberIsTentative: false })}
                    placeholder="COT-AAAAMMDD-0001"
                    aria-label="Número de cotización"
                  />
                  {draft.numberIsTentative && draft.quoteId === null && (
                    <span className="cot-muted">Se confirma al guardar</span>
                  )}
                </div>
                <div className="cot-field">
                  <label htmlFor="cot-date">Fecha de emisión</label>
                  <DateInput id="cot-date" value={draft.quoteDate} disabled={readOnly} onChange={(v) => patch({ quoteDate: v })} />
                </div>
                <div className="cot-doc-state">
                  <span className={`cot-status-pill ${draft.quoteId !== null ? draft.status : 'nueva'}`}>
                    {draft.quoteId !== null ? COT_STATUS_LABEL[draft.status] : 'Nueva'}
                  </span>
                  <span className="cot-muted">Validez de la oferta: 15 días</span>
                </div>
              </div>
            </header>

            <section className="cot-card">
              <h2 className="cot-card-title">Datos del cliente</h2>
              <div className="cot-grid-2">
                <div className="cot-field">
                  <label htmlFor="cot-opp">
                    Oportunidad <span className="cot-muted" style={{ fontWeight: 400 }}>(obligatoria para enviar o descargar)</span>
                  </label>
                  <OportunidadSelector
                    id="cot-opp"
                    value={draft.oportunidad}
                    client={draft.client}
                    disabled={readOnly}
                    puedeCrear={puedeEscribir}
                    error={errorOportunidad}
                    inputRef={(el) => {
                      oportunidadRef.current = el;
                    }}
                    onChange={(o) => void elegirOportunidad(o)}
                  />
                  {errorOportunidad && !draft.oportunidad && <span className="field-error">Elige la oportunidad</span>}
                </div>
                <div className="cot-field">
                  <label htmlFor="cot-pilar">
                    Pilar de servicio <span className="cot-muted" style={{ fontWeight: 400 }}>(condiciones generales)</span>
                  </label>
                  <select
                    id="cot-pilar"
                    value={draft.pilar ?? ''}
                    disabled={readOnly}
                    onChange={(e) => aplicarPilar(e.target.value || null, draft.conditions)}
                    aria-label="Pilar de servicio de la cotización"
                    title="Al elegir un pilar de servicio se ofrecen sus condiciones generales configuradas"
                  >
                    <option value="">{SIN_PILAR_SERVICIO}</option>
                    {PILARES.map((p) => (
                      <option key={p.key} value={p.key}>{p.categoria}</option>
                    ))}
                  </select>
                </div>
                <div className="cot-field full">
                  <label htmlFor="cot-c-name">
                    Cliente / Razón social <span className="req">*</span>
                  </label>
                  <ClienteDirectorioInput
                    id="cot-c-name"
                    inputRef={(el) => {
                      clientRefs.current.name = el;
                    }}
                    className={clientErrors.name ? 'input-error' : ''}
                    value={draft.client.name}
                    disabled={readOnly}
                    onType={(texto) => {
                      patch({ client: { ...draft.client, name: texto } });
                      setClientErrors((er) => ({ ...er, name: false }));
                    }}
                    onPick={traerDelDirectorio}
                    placeholder="Nombre o razón social"
                  />
                  {clientErrors.name && <span className="field-error">Escribe el cliente</span>}
                </div>
                <div className="cot-field">
                  <label htmlFor="cot-c-ruc">
                    RUC / Cédula <span className="req">*</span>
                  </label>
                  <input
                    id="cot-c-ruc"
                    ref={(el) => {
                      clientRefs.current.ruc = el;
                    }}
                    className={clientErrors.ruc ? 'input-error' : ''}
                    value={draft.client.ruc}
                    disabled={readOnly}
                    onChange={(e) => {
                      patch({ client: { ...draft.client, ruc: e.target.value } });
                      setClientErrors((er) => ({ ...er, ruc: false }));
                    }}
                    placeholder="0991234567001"
                  />
                  {clientErrors.ruc && <span className="field-error">Escribe el RUC o la cédula</span>}
                </div>
                <div className="cot-field">
                  <label htmlFor="cot-c-phone">
                    Teléfono <span className="req">*</span>
                  </label>
                  <input
                    id="cot-c-phone"
                    ref={(el) => {
                      clientRefs.current.phone = el;
                    }}
                    className={clientErrors.phone ? 'input-error' : ''}
                    value={draft.client.phone}
                    disabled={readOnly}
                    onChange={(e) => {
                      patch({ client: { ...draft.client, phone: e.target.value } });
                      setClientErrors((er) => ({ ...er, phone: false }));
                    }}
                    placeholder="0991234567"
                  />
                  {clientErrors.phone && <span className="field-error">Escribe el teléfono</span>}
                </div>
                <div className="cot-field full">
                  <label htmlFor="cot-c-addr">Dirección</label>
                  <input
                    id="cot-c-addr"
                    value={draft.client.address}
                    disabled={readOnly}
                    onChange={(e) => patch({ client: { ...draft.client, address: e.target.value } })}
                    placeholder="Av. principal y secundaria"
                  />
                </div>
                <div className="cot-field">
                  <label htmlFor="cot-c-contact">Persona de contacto</label>
                  <input
                    id="cot-c-contact"
                    value={draft.client.contact}
                    disabled={readOnly}
                    onChange={(e) => patch({ client: { ...draft.client, contact: e.target.value } })}
                    placeholder="Juan Pérez - Gerente"
                  />
                </div>
                <div className="cot-field">
                  <label htmlFor="cot-c-email">
                    Email <span className="req">*</span>
                  </label>
                  <input
                    id="cot-c-email"
                    type="email"
                    ref={(el) => {
                      clientRefs.current.email = el;
                    }}
                    className={clientErrors.email ? 'input-error' : ''}
                    value={draft.client.email}
                    disabled={readOnly}
                    onChange={(e) => {
                      patch({ client: { ...draft.client, email: e.target.value } });
                      setClientErrors((er) => ({ ...er, email: false }));
                    }}
                    placeholder="cliente@empresa.com"
                  />
                  {clientErrors.email && <span className="field-error">Escribe el email</span>}
                </div>
              </div>
            </section>

            <section className="cot-card">
              <h2 className="cot-card-title">
                Detalle de la cotización
                <small>
                  {draft.items.length} {draft.items.length === 1 ? 'producto' : 'productos'}
                </small>
                {!readOnly && (
                  <button type="button" className="btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setCustodiaModal({ linea: null })}>
                    + Custodia móvil
                  </button>
                )}
              </h2>
              <QuoteDetail
                items={draft.items}
                comp={comp}
                readOnly={readOnly}
                onItems={setItems}
                onOpenProduct={abrirProducto}
                onEditCustodia={(linea) => setCustodiaModal({ linea })}
              />
            </section>

            <section className="cot-card cot-card-interno">
              <h2 className="cot-card-title">
                Márgenes de ganancia
                <small className="cot-tag-interno">Interno · no se imprime</small>
              </h2>
              <MarginConfig
                items={draft.items}
                comp={comp}
                supplierMargins={draft.supplierMargins}
                readOnly={readOnly}
                onItems={setItems}
                onSupplierMargin={(s, pct) => patch({ supplierMargins: { ...draft.supplierMargins, [s]: pct } })}
                onPickInstall={() => setElegirInstalacion(true)}
              />
            </section>

            <section className="cot-card">
              <h2 className="cot-card-title">Descuento</h2>
              <div className="cot-discount">
                <select
                  value={draft.discountType}
                  disabled={readOnly}
                  onChange={(e) => patch({ discountType: e.target.value as DiscountType, discountValue: e.target.value === 'none' ? 0 : draft.discountValue })}
                  aria-label="Tipo de descuento"
                >
                  <option value="none">Sin descuento</option>
                  <option value="percent">Porcentaje (%)</option>
                  <option value="fixed">Valor fijo ($)</option>
                </select>
                <NumInput
                  value={draft.discountValue}
                  min={0}
                  step="any"
                  disabled={readOnly || draft.discountType === 'none'}
                  ariaLabel="Valor de descuento"
                  onCommit={(n) => patch({ discountValue: n ?? 0 })}
                />
                {comp.totals.discount > 0 && <span className="cot-muted">→ -{comp.totals.discount.toFixed(2)} $</span>}
              </div>
            </section>

            <section className="cot-card">
              <h2 className="cot-card-title">Condiciones y notas</h2>
              <div className="cot-field">
                <label htmlFor="cot-cond">Condiciones generales</label>
                <textarea
                  id="cot-cond"
                  className="cot-conditions"
                  rows={8}
                  value={draft.conditions}
                  disabled={readOnly}
                  onChange={(e) => patch({ conditions: e.target.value })}
                  placeholder="Condiciones comerciales de la cotización..."
                />
              </div>
              <div className="cot-field" style={{ marginTop: 10 }}>
                <label htmlFor="cot-notes">Notas</label>
                <textarea
                  id="cot-notes"
                  className="cot-conditions"
                  style={{ minHeight: 70 }}
                  rows={3}
                  value={draft.notes}
                  disabled={readOnly}
                  onChange={(e) => patch({ notes: e.target.value })}
                  placeholder="Notas adicionales (opcional)..."
                />
              </div>
            </section>

            <QuoteTotals totals={comp.totals} discountType={draft.discountType} discountValue={draft.discountValue} totalId="totalView" />
            </div>

            {alertas.length > 0 && (
              <div className="cot-alertas" role="alert">
                <div className="cot-alertas-titulo">
                  <TriangleAlert size={16} /> Precio bajo: revisa antes de enviar
                </div>
                <ul>
                  {alertas.map((a) => (
                    <li key={a.tipo}>
                      {a.mensaje}
                      {a.detalle.length > 0 && (
                        <ul>
                          {a.detalle.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="cot-alertas-nota">Es solo un aviso: puedes guardar la cotización igual.</p>
              </div>
            )}

            <ErrorBanner mensaje={errorGuardar} />

            <div className="cot-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => (draft.oportunidad ? window.print() : pedirOportunidad('descargar el PDF'))}
              >
                <Printer size={15} /> Imprimir / Guardar PDF
              </button>
              <button type="button" className="auth-btn" onClick={guardar} disabled={guardando || readOnly}>
                <Save size={15} /> {guardando ? 'Guardando...' : 'Guardar cotización'}
              </button>
              {/* Enlace para el cliente: solo de una cotización guardada (el cliente ve la versión guardada) */}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  // No se bloquea en silencio: lo recuperado del navegador (o una cotización nueva) aún no está
                  // guardado y el cliente solo puede ver una cotización guardada.
                  if (draft.quoteId === null) {
                    showToast(
                      'Primero guarda la cotización (o ábrela desde «Historial»): el cliente solo puede ver una cotización guardada.',
                      'error',
                    );
                    return;
                  }
                  if (!draft.oportunidad) return pedirOportunidad('enviarla al cliente');
                  // La oportunidad elegida aún no se guardó: el servidor no la conoce todavía.
                  if (oportunidadGuardada.current !== draft.oportunidad.id) {
                    showToast('Guarda la cotización para que quede unida a la oportunidad y luego envíala.', 'error');
                    return;
                  }
                  setEnviarCliente(true);
                }}
                title="Enviar al cliente con un enlace"
              >
                <Send size={15} /> Enviar al cliente
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => pedirEscritura('guarde plantillas', () => setGuardarPlantilla(true))}
                disabled={draft.items.length === 0}
              >
                <FileText size={15} /> Guardar como plantilla
              </button>
              {draft.quoteId !== null && draft.access === 'owner' && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const q = quotes.find((x) => x.id === draft.quoteId);
                    if (q) setCompartir(q);
                    else
                      getCotQuotes()
                        .then((qs) => {
                          setQuotes(qs);
                          const f = qs.find((x) => x.id === draft.quoteId);
                          if (f) setCompartir(f);
                        })
                        .catch(() => showToast('No se pudo abrir la ventana para compartir', 'error'));
                  }}
                >
                  <Users size={15} /> Compartir con mi equipo
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <QuotePrint
        draft={draft}
        comp={comp}
        companyName={theme.name}
        logoUrl={theme.logoUrl}
        issuerName={draft.ownerName || user?.fullName || ''}
        issuerRole={cargoEmisor}
        issuerPhone={telefonoEmisor}
      />

      {verHistorial && (
        <HistoryModal
          quotes={quotes}
          loading={quotesCargando}
          error={quotesError}
          byCode={byCode}
          onClose={() => setVerHistorial(false)}
          onLoad={(q) => cargarCotizacion(q)}
          onStatus={cambiarEstado}
          onDelete={eliminarCotizacion}
          onShare={(q) => setCompartir(q)}
          onCopy={(q) => cargarCotizacion(q, true)}
        />
      )}
      {verPlantillas && (
        <TemplatesModal
          templates={templates}
          loading={tplCargando}
          error={tplError}
          byCode={byCode}
          onClose={() => setVerPlantillas(false)}
          onLoad={cargarPlantilla}
          onDelete={async (t) => {
            await deleteCotTemplate(t.id);
            setTemplates((ts) => ts.filter((x) => x.id !== t.id));
          }}
        />
      )}
      {guardarPlantilla && (
        <SaveTemplateModal
          defaultName={draft.client.name ? `Plantilla ${draft.client.name}` : ''}
          onCancel={() => setGuardarPlantilla(false)}
          onSave={guardarComoPlantilla}
        />
      )}
      {verCatalogo && (
        <CatalogManager
          products={listados}
          installs={installs}
          kits={kits}
          byCode={byCode}
          canWrite={puedeEscribir}
          onClose={() => setVerCatalogo(false)}
          onChanged={async (aviso) => {
            await recargarCatalogo();
            if (aviso) showToast(aviso, 'success');
          }}
        />
      )}
      {verAccesoEdicion && <EditAccessModal onClose={() => setVerAccesoEdicion(false)} />}
      {enviarCliente && draft.quoteId !== null && (
        <EnviarClienteModal
          quoteId={draft.quoteId}
          quoteNumber={draft.quoteNumber}
          clienteNombre={draft.client.contact.split(' - ')[0] || draft.client.name}
          clienteTelefono={draft.client.phone}
          cambiosSinGuardar={firmaGuardada.current !== null && firmaGuardada.current !== firmaDe(draft)}
          onClose={() => setEnviarCliente(false)}
          onEstadoCambiado={() => {
            const id = draft.quoteId;
            if (id === null) return;
            getCotQuote(id)
              .then((q) => setDraft((d) => (d.quoteId === q.id ? { ...d, status: q.status } : d)))
              .catch(() => undefined);
          }}
        />
      )}
      {compartir && <ShareQuoteModal quoteId={compartir.id} quoteNumber={compartir.quoteNumber} onClose={() => setCompartir(null)} />}
      {elegirInstalacion && <InstallPicker installs={installs} onPick={onPickInstall} onClose={() => setElegirInstalacion(false)} />}
      {custodiaModal && <CustodiaModal inicial={custodiaModal.linea} onClose={() => setCustodiaModal(null)} onConfirm={onConfirmCustodia} />}
      {productoForm && (
        <ProductFormModal
          product={productoForm}
          subcategories={subcats}
          suppliers={suppliers}
          puedeFijarMinimo={esAdminOGerente}
          aviso="Estás editando el catálogo de la empresa: el cambio se ve en todas las cotizaciones y en las futuras, y queda registrado en Catálogo → Historial. En una cotización guardada el precio queda congelado con el valor anterior; usa «Usar precios actuales» para aplicar el nuevo. En una cotización nueva aún sin guardar, el precio sí se recalcula."
          onClose={() => setProductoForm(null)}
          onSaved={(p) => {
            setProductoForm(null);
            void recargarCatalogo();
            showToast(`Producto actualizado: ${p.code}`, 'success');
          }}
        />
      )}
      {detalle && (
        <ProductDetailModal
          product={detalle}
          supplierMargins={draft.supplierMargins}
          installMargin={draft.installMargin}
          onClose={() => setDetalleCodigo(null)}
        />
      )}
      {cambiosPrecio && (
        <PriceChangesModal
          changes={cambiosPrecio}
          canEdit={!readOnly}
          onKeep={() => setCambiosPrecio(null)}
          onUseCurrent={usarPreciosActuales}
        />
      )}
      {duplicado && (
        <DuplicateQuoteModal
          quoteNumber={duplicado.numero}
          canUpdate={duplicado.canUpdate}
          onChoose={(a) => {
            duplicado.resolver(a);
            setDuplicado(null);
          }}
        />
      )}
      {confirmNueva && (
        <ConfirmDialog
          title="Nueva cotización"
          message="Se descartará lo que tienes en pantalla (lo que no hayas guardado se pierde). ¿Empezar una cotización nueva?"
          confirmLabel="Empezar nueva"
          onConfirm={nuevaCotizacion}
          onCancel={() => setConfirmNueva(false)}
        />
      )}
      {preguntaMonto && (
        <ConfirmDialog
          title="Monto de la oportunidad"
          message={
            preguntaMonto.principalActual
              ? `La cotización principal de esta oportunidad es ${preguntaMonto.principalActual.quoteNumber} (${dinero(preguntaMonto.principalActual.total)}). ¿Hacer esta la principal? Su total, ${dinero(preguntaMonto.total)}, pasará a ser el monto de la oportunidad.`
              : `Esta oportunidad tiene ${dinero(preguntaMonto.monto)} como monto cotizado. ¿Usar el total de esta cotización (${dinero(preguntaMonto.total)}) como monto?`
          }
          confirmLabel="Usar esta cotización"
          cancelLabel="Dejar el monto como está"
          onConfirm={() => void usarComoMonto()}
          onCancel={() => setPreguntaMonto(null)}
        />
      )}
      {cotizarPara && (
        <ConfirmDialog
          title="Cotizar para la oportunidad"
          message={`Tienes una cotización sin guardar en pantalla. ¿Descartarla y empezar una nueva para «${cotizarPara.cliente.nombre}»?`}
          confirmLabel="Empezar nueva"
          onConfirm={() => void empezarParaOportunidad(cotizarPara)}
          onCancel={() => setCotizarPara(null)}
        />
      )}
      {preguntaPilar && (
        <ConfirmDialog
          title="Condiciones generales del pilar de servicio"
          message={`Pasar a ${nombrePilarServicio(preguntaPilar.pilar)} ofrece sus condiciones generales. ¿Reemplazar el texto actual o conservar lo que escribiste?`}
          confirmLabel={`Usar las de ${nombrePilarServicio(preguntaPilar.pilar)}`}
          cancelLabel="Conservar las actuales"
          onConfirm={() => {
            patch({ conditions: preguntaPilar.texto });
            textoAutoRef.current = preguntaPilar.texto;
            setPreguntaPilar(null);
          }}
          onCancel={() => setPreguntaPilar(null)}
        />
      )}
      {cotizarDesdeChat && (
        <ConfirmDialog
          title="Abrir la cotización del bot"
          message="Tienes una cotización sin guardar en pantalla. ¿Descartarla y abrir la que preparó el bot?"
          confirmLabel="Abrir la del bot"
          onConfirm={() => void empezarDesdeConversacion(cotizarDesdeChat.conversacion, cotizarDesdeChat.mensaje)}
          onCancel={() => setCotizarDesdeChat(null)}
        />
      )}
      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}
    </div>
  );
}
