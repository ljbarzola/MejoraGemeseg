import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, FileText, Lock, Package, Printer, Save, Plus, RotateCcw, Share2 } from 'lucide-react';
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
import QuoteDetail from '../../components/ventas/cotizador/QuoteDetail';
import QuotePrint from '../../components/ventas/cotizador/QuotePrint';
import QuoteTotals from '../../components/ventas/cotizador/QuoteTotals';
import { EditAccessModal, ShareQuoteModal } from '../../components/ventas/cotizador/ShareModals';
import { SaveTemplateModal, TemplatesModal } from '../../components/ventas/cotizador/TemplatesModals';
import { useCompany } from '../../contexts/ThemeContext';
import { usePerm } from '../../contexts/PermissionsContext';
import { useToast } from '../../contexts/ToastContext';
import { getUser } from '../../services/auth.service';
import { getMe } from '../../services/user.service';
import { TELEFONO_POR_DEFECTO } from '../../utils/telefono';
import {
  changeCotQuoteStatus,
  checkCotQuoteNumber,
  createCotQuote,
  createCotTemplate,
  deleteCotQuote,
  deleteCotTemplate,
  getCotCatalogo,
  getCotKits,
  getCotNextNumber,
  getCotQuotes,
  getCotTemplates,
  updateCotQuote,
  type CotQuoteInput,
} from '../../services/cotizador.service';
import {
  clearDraftLocal,
  draftFromQuote,
  draftHasContent,
  emptyDraft,
  loadDraftLocal,
  saveDraftLocal,
  type QuoteDraft,
} from '../../utils/cotizador/draft';
import { apiError, todayISO } from '../../utils/cotizador/format';
import {
  buildCatalogMap,
  computeQuote,
  dropSnapshots,
  stripSnapshots,
  withSnapshots,
  type PriceChange,
} from '../../utils/cotizador/pricing';
import { addInstall, addKit, addProduct } from '../../utils/cotizador/quoteState';
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
  const [detalleCodigo, setDetalleCodigo] = useState<string | null>(null);
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
    setVerHistorial(false);
  };

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
        setDraft(draftFromQuote(saved));
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
    setClientErrors({});
    setErrorGuardar('');
    if (user) clearDraftLocal(user.id);
    setConfirmNueva(false);
  };

  // El nombre del PDF sale del título de la pestaña: "COT-... - Cliente"
  useEffect(() => {
    const antes = () => {
      if (draft.client.name.trim()) {
        document.title = (draft.quoteNumber ? draft.quoteNumber + ' - ' : '') + draft.client.name.trim();
      }
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
    <div className="cot-page">
      <div className="cot-screen">
        <div className="cot-heading">
          <p className="page-eyebrow">Ventas y CRM</p>
          <h1>Cotizador</h1>
        </div>

        <div className="cot-toolbar" role="toolbar" aria-label="Acciones del cotizador">
          <button type="button" className="cot-tool-btn" onClick={() => setVerCatalogo(true)}>
            <Package size={15} /> Catálogo
          </button>
          <button type="button" className="cot-tool-btn" onClick={abrirHistorial}>
            <FolderOpen size={15} /> Historial
          </button>
          <button type="button" className="cot-tool-btn" onClick={abrirPlantillas}>
            <FileText size={15} /> Plantillas
          </button>
          <button type="button" className="cot-tool-btn" onClick={() => setVerAccesoEdicion(true)}>
            <Lock size={15} /> Compartir edición
          </button>
          <span className="cot-toolbar-spacer" />
          <button
            type="button"
            className="cot-tool-btn primary"
            onClick={() => (draftHasContent(draft) ? setConfirmNueva(true) : nuevaCotizacion())}
          >
            <Plus size={16} /> Nueva cotización
          </button>
        </div>

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
                <div className="cot-field full">
                  <label htmlFor="cot-c-name">
                    Cliente / Razón social <span className="req">*</span>
                  </label>
                  <input
                    id="cot-c-name"
                    ref={(el) => {
                      clientRefs.current.name = el;
                    }}
                    className={clientErrors.name ? 'input-error' : ''}
                    value={draft.client.name}
                    disabled={readOnly}
                    onChange={(e) => {
                      patch({ client: { ...draft.client, name: e.target.value } });
                      setClientErrors((er) => ({ ...er, name: false }));
                    }}
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
              </h2>
              <QuoteDetail items={draft.items} comp={comp} readOnly={readOnly} onItems={setItems} onOpenProduct={setDetalleCodigo} />
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

            <ErrorBanner mensaje={errorGuardar} />

            <div className="cot-actions">
              <button type="button" className="btn-secondary" onClick={() => window.print()}>
                <Printer size={15} /> Imprimir / Guardar PDF
              </button>
              <button type="button" className="auth-btn" onClick={guardar} disabled={guardando || readOnly}>
                <Save size={15} /> {guardando ? 'Guardando...' : 'Guardar cotización'}
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
                  <Share2 size={15} /> Compartir
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
        issuerContact={!draft.ownerName || draft.ownerName === user?.fullName ? (user?.email ?? '') : ''}
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
      {compartir && <ShareQuoteModal quoteId={compartir.id} quoteNumber={compartir.quoteNumber} onClose={() => setCompartir(null)} />}
      {elegirInstalacion && <InstallPicker installs={installs} onPick={onPickInstall} onClose={() => setElegirInstalacion(false)} />}
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
      {soloAdmin && <SoloAdminDialog accion={soloAdmin} onClose={() => setSoloAdmin(null)} />}
    </div>
  );
}
