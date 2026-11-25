/**
 * Cola sin señal de la pantalla de campo (`/campo`).
 *
 * Todo lo que el custodio hace (marcar la salida, un punto, una novedad, una foto, una firma, datos de la guía)
 * se guarda primero AQUÍ, en el celular (IndexedDB), y se sube cuando hay conexión. Cada elemento lleva un
 * `clientUuid` y el servidor es idempotente por él: reenviar uno que ya llegó no lo duplica.
 *
 * Reglas del envío (`procesarCola`):
 *  - Estricto en orden: si el primero no se pudo enviar, no se intenta el siguiente (una firma tiene que llegar
 *    antes de la llegada que la exige).
 *  - Error de red o del servidor (5xx, 429): se reintenta con espera creciente (5 s, 10 s, 20 s… hasta 1 min, para no dejar al custodio esperando cuando vuelve la señal).
 *  - El servidor lo rechazó (4xx de validación): se quita de la cola y se avisa con su mensaje.
 *  - 401: se detiene y avisa que hay que volver a entrar; la cola NO se pierde.
 * Si IndexedDB no está disponible (ventana privada de algunos navegadores) se usa la memoria de la pestaña.
 */

import type { CambioGuia } from '../types/custodiaCampo';
import type { DatosFirma, DatosFoto, EventoEnvio } from '../services/custodiaCampo.service';

export type TipoPendiente = 'evento' | 'foto' | 'firma' | 'guia';

export interface PayloadFoto { foto: Blob; miniatura: Blob; datos: DatosFoto }

interface Base<T extends TipoPendiente, P> {
  clientUuid: string;
  tipo: T;
  payload: P;
  /** Viaje al que pertenece: lo pendiente de otro viaje no se manda con la sesión de éste. */
  custodiaId: number;
  intentos: number;
  /** Para conservar el orden: marca de tiempo creciente. */
  orden: number;
  /** No se intenta antes de este instante (ms). */
  proximoIntento: number;
  /** Texto corto para mostrar si se rechaza («Salimos», «Foto Carga»…). */
  titulo: string;
}

export type Pendiente =
  | Base<'evento', EventoEnvio>
  | Base<'foto', PayloadFoto>
  | Base<'firma', DatosFirma>
  | Base<'guia', { cambios: CambioGuia[] }>;

const BASE = 'gemeseg-campo';
const ALMACEN = 'pendientes';

// ---- Almacén: IndexedDB con respaldo en memoria ----

let dbPromesa: Promise<IDBDatabase | null> | null = null;
const memoria = new Map<string, Pendiente>();

function abrirDb(): Promise<IDBDatabase | null> {
  if (dbPromesa) return dbPromesa;
  dbPromesa = new Promise((resolver) => {
    try {
      if (typeof indexedDB === 'undefined') { resolver(null); return; }
      const pedido = indexedDB.open(BASE, 1);
      pedido.onupgradeneeded = () => {
        const db = pedido.result;
        if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN, { keyPath: 'clientUuid' });
      };
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => resolver(null);
      pedido.onblocked = () => resolver(null);
    } catch {
      resolver(null);
    }
  });
  return dbPromesa;
}

function pedir<T>(db: IDBDatabase, modo: IDBTransactionMode, usar: (a: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const tx = db.transaction(ALMACEN, modo);
    const r = usar(tx.objectStore(ALMACEN));
    r.onsuccess = () => resolver(r.result);
    r.onerror = () => rechazar(r.error);
    tx.onabort = () => rechazar(tx.error);
  });
}

let ultimoOrden = 0;
const siguienteOrden = () => {
  ultimoOrden = Math.max(Date.now(), ultimoOrden + 1);
  return ultimoOrden;
};

/** UUID para un elemento nuevo (`crypto.randomUUID` solo existe en páginas seguras: se respalda). */
export function nuevoUuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* se cae al respaldo */ }
  const hex = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  hex[6] = (hex[6] & 0x0f) | 0x40;
  hex[8] = (hex[8] & 0x3f) | 0x80;
  const h = hex.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type NuevoPendiente = { tipo: 'evento'; payload: EventoEnvio }
| { tipo: 'foto'; payload: PayloadFoto }
| { tipo: 'firma'; payload: DatosFirma }
| { tipo: 'guia'; payload: { cambios: CambioGuia[] } };

/** Guarda un elemento nuevo. `clientUuid` ya viene dentro del payload (menos en «guia», que genera el suyo). */
export async function encolar(n: NuevoPendiente, custodiaId: number, titulo: string): Promise<Pendiente> {
  // En las fotos el clientUuid va dentro de `datos` (es lo que viaja al servidor como JSON).
  const clientUuid = n.tipo === 'guia' ? nuevoUuid() : n.tipo === 'foto' ? n.payload.datos.clientUuid : n.payload.clientUuid;
  const p = {
    clientUuid, tipo: n.tipo, payload: n.payload, custodiaId, intentos: 0, orden: siguienteOrden(), proximoIntento: 0, titulo,
  } as Pendiente;
  const db = await abrirDb();
  if (db) {
    try { await pedir(db, 'readwrite', (a) => a.put(p)); return p; } catch { /* se guarda en memoria */ }
  }
  memoria.set(p.clientUuid, p);
  return p;
}

export async function listarPendientes(): Promise<Pendiente[]> {
  const db = await abrirDb();
  let lista: Pendiente[] = [];
  if (db) {
    try { lista = await pedir(db, 'readonly', (a) => a.getAll() as IDBRequest<Pendiente[]>); } catch { lista = []; }
  }
  const todos = [...lista, ...Array.from(memoria.values())];
  return todos.sort((a, b) => a.orden - b.orden);
}

export async function quitarPendiente(clientUuid: string): Promise<void> {
  memoria.delete(clientUuid);
  const db = await abrirDb();
  if (db) { try { await pedir(db, 'readwrite', (a) => a.delete(clientUuid)); } catch { /* ya no estaba */ } }
}

async function guardarCambios(p: Pendiente): Promise<void> {
  if (memoria.has(p.clientUuid)) { memoria.set(p.clientUuid, p); return; }
  const db = await abrirDb();
  if (db) { try { await pedir(db, 'readwrite', (a) => a.put(p)); } catch { memoria.set(p.clientUuid, p); } }
}

// ---- Envío ----

export type ResultadoEnvio =
  | { ok: true }
  | { ok: false; clase: 'sin_red' | 'reintentar' | 'no_autorizado' | 'rechazado'; mensaje: string };

export interface ResumenCola {
  /** Elementos enviados en esta pasada. */
  enviados: number;
  /** Elementos que el servidor rechazó y se quitaron de la cola. */
  rechazados: { titulo: string; mensaje: string }[];
  /** Se detuvo porque hay que volver a entrar. */
  sesionVencida: boolean;
  /** Quedó algo sin enviar por falta de señal o de servidor. */
  sinSenal: boolean;
}

const esperaPorIntento = (intentos: number) => Math.min(60_000, 5_000 * 2 ** Math.min(intentos, 4));

/**
 * Envía en orden lo pendiente del viaje `custodiaId`. `enviar` hace la llamada de cada tipo y devuelve el resultado
 * ya clasificado. Con `forzar` se ignoran las esperas (botón «Reintentar» o vuelta de la señal).
 */
export async function procesarCola(
  custodiaId: number,
  enviar: (p: Pendiente) => Promise<ResultadoEnvio>,
  forzar = false,
): Promise<ResumenCola> {
  const resumen: ResumenCola = { enviados: 0, rechazados: [], sesionVencida: false, sinSenal: false };
  const lista = (await listarPendientes()).filter((p) => p.custodiaId === custodiaId);
  for (const p of lista) {
    if (!forzar && p.proximoIntento > Date.now()) { resumen.sinSenal = true; break; }
    const r = await enviar(p);
    if (r.ok) {
      await quitarPendiente(p.clientUuid);
      resumen.enviados += 1;
      continue;
    }
    if (r.clase === 'rechazado') {
      await quitarPendiente(p.clientUuid);
      resumen.rechazados.push({ titulo: p.titulo, mensaje: r.mensaje });
      continue;
    }
    if (r.clase === 'no_autorizado') {
      resumen.sesionVencida = true;
      break;
    }
    p.intentos += 1;
    p.proximoIntento = Date.now() + esperaPorIntento(p.intentos);
    await guardarCambios(p);
    resumen.sinSenal = true;
    break;
  }
  return resumen;
}
