import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CustodiasConfigService, type CampoGuia } from './custodias-config.service';
import { esMomentoFirma } from './custodias-campo.util';
import {
  MAX_CONTENEDORES,
  MAX_HACIENDAS,
  type GuiaContenedor,
  type GuiaCustodia,
  type GuiaEtiqueta,
  type GuiaHacienda,
  type RefCustodio,
  type ValorCampo,
} from './custodia-guia.types';

const REFS_CUSTODIO: RefCustodio[] = ['custodio1', 'custodio2', 'custodio3', 'custodio4'];

export interface ViajeEntrada {
  /** PUERTO, HACIENDA o VIP, ya normalizado. */
  tipo: string;
  /** Lo que ya tiene el viaje (al editar). */
  actual?: { clienteId: number | null; rutaId: number | null; guia: unknown } | null;
  /** undefined = no cambia; null = sin cliente del Directorio. */
  clienteId?: number | null;
  /** Nombre del cliente en texto (viajes viejos o sin cliente del Directorio). */
  clienteTexto?: string;
  /** undefined = no cambia; null = sin ruta. */
  rutaId?: number | null;
  /** undefined = no cambia (solo se limpia lo que el tipo ya no admite). */
  guia?: unknown;
  /** Nombres FINALES de los custodios del viaje. */
  custodios: Record<RefCustodio, string>;
}

export interface ViajePreparado {
  clienteId: number | null;
  /** Nombre a guardar en `Custodia.cliente`; undefined = no tocar. */
  cliente?: string;
  rutaId: number | null;
  guia: GuiaCustodia;
  /** Solo cuando la guía se guardó: lo que se sincroniza a las columnas de siempre. */
  columnas: { contenedores: string[]; nombreHacienda: string | null; cantidadSacos: number | null } | null;
}

const texto = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : v === null || v === undefined ? '' : String(v).trim().slice(0, max);

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const tieneValor = (v: ValorCampo | undefined): boolean =>
  v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');

/**
 * Revisa y deja listo lo que el formulario del viaje manda (cliente, ruta y la guía en campo), y reúne lo que
 * necesitan el detalle y el PDF. Las reglas de la guía son del servidor: el formulario solo las adelanta.
 */
@Injectable()
export class CustodiasGuiaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: CustodiasConfigService,
  ) {}

  /** El cliente del Directorio, solo si es de la empresa. */
  async clienteDeEmpresa(companyId: number, clienteId: number) {
    const cliente = await this.prisma.salesClient.findFirst({
      where: { id: clienteId, companyId },
      select: { id: true, name: true, ruc: true },
    });
    if (!cliente) throw new BadRequestException('El cliente elegido no existe en el Directorio.');
    return cliente;
  }

  /** Datos del cliente del Directorio para el detalle del viaje (null si no hay o ya no existe). */
  async clienteDirectorio(companyId: number, clienteId: number | null | undefined) {
    if (!clienteId) return null;
    return this.prisma.salesClient.findFirst({
      where: { id: clienteId, companyId },
      select: { id: true, name: true, ruc: true },
    });
  }

  async rutaDeViaje(companyId: number, rutaId: number | null | undefined) {
    if (!rutaId) return null;
    return this.config.obtenerRuta(companyId, rutaId);
  }

  async firmaEfectiva(companyId: number, guia: unknown, clienteId: number | null | undefined) {
    return this.config.firmaMomentoEfectivo(companyId, esObjeto(guia) ? (guia as GuiaCustodia) : null, clienteId);
  }

  /** Todo lo que el PDF necesita además del viaje. */
  async contextoPdf(companyId: number, custodia: { guia?: unknown; clienteId?: number | null; rutaId?: number | null }) {
    const [campos, ruta, firmaMomento] = await Promise.all([
      this.config.listarCampos(companyId, true),
      this.rutaDeViaje(companyId, custodia.rutaId),
      this.firmaEfectiva(companyId, custodia.guia, custodia.clienteId),
    ]);
    return { campos, ruta, firmaMomento };
  }

  // ───────────────────────────── Preparar el viaje a guardar ─────────────────────────────

  async preparar(companyId: number, p: ViajeEntrada): Promise<ViajePreparado> {
    // Cliente
    let clienteId = p.actual?.clienteId ?? null;
    let cliente: string | undefined;
    if (p.clienteId !== undefined) {
      if (p.clienteId === null) {
        clienteId = null;
        if (p.clienteTexto !== undefined) cliente = p.clienteTexto.trim();
      } else {
        const c = await this.clienteDeEmpresa(companyId, p.clienteId);
        clienteId = c.id;
        cliente = c.name;
      }
    } else if (p.clienteTexto !== undefined) {
      cliente = p.clienteTexto.trim();
    }

    // Ruta (una ruta desactivada solo se admite si ya era la del viaje)
    let rutaId = p.actual?.rutaId ?? null;
    if (p.rutaId !== undefined) {
      if (p.rutaId === null) {
        rutaId = null;
      } else {
        const ruta = await this.config.obtenerRuta(companyId, p.rutaId);
        if (!ruta || (!ruta.activo && p.rutaId !== (p.actual?.rutaId ?? null))) {
          throw new BadRequestException('La ruta elegida no existe o está desactivada.');
        }
        rutaId = ruta.id;
      }
    }

    // Guía
    if (p.guia === undefined) {
      // No se toca la guía; solo se limpia lo que el tipo del viaje ya no admite.
      const previa = esObjeto(p.actual?.guia) ? ({ ...(p.actual!.guia as GuiaCustodia) } as GuiaCustodia) : {};
      if (p.tipo !== 'PUERTO' && previa.contenedores?.length) previa.contenedores = [];
      if (p.tipo !== 'HACIENDA') {
        if (previa.haciendas?.length) previa.haciendas = [];
        if (previa.furgon) previa.furgon = null;
      }
      return { clienteId, cliente, rutaId, guia: previa, columnas: null };
    }

    if (!esObjeto(p.guia)) throw new BadRequestException('La guía del viaje no es válida.');
    const campos = await this.config.listarCampos(companyId, true);
    const { guia, columnas } = this.normalizarGuia(p.guia, p.tipo, campos, p.custodios);
    return { clienteId, cliente, rutaId, guia, columnas };
  }

  // ───────────────────────────── Revisión de la guía ─────────────────────────────

  private aplica(c: CampoGuia, tipo: string, bloque: string): boolean {
    return c.bloque === bloque && (c.tipoServicio === tipo || c.tipoServicio === 'TODOS');
  }

  /** Limpia los valores de un bloque de campos: solo claves de campos reales, cada valor según su tipo. */
  private valoresDeCampos(
    entrada: unknown,
    bloque: string,
    tipo: string,
    campos: CampoGuia[],
    usados: Set<number>,
  ): Record<string, ValorCampo> {
    const salida: Record<string, ValorCampo> = {};
    if (!esObjeto(entrada)) return salida;
    for (const campo of campos) {
      if (campo.bloque !== bloque) continue;
      // Solo los campos que aplican a este tipo de servicio (un campo de Puerto no se guarda en un viaje de Hacienda).
      if (campo.tipoServicio !== tipo && campo.tipoServicio !== 'TODOS') continue;
      const crudo = entrada[String(campo.id)];
      if (crudo === undefined) continue;
      const v = this.valorDeCampo(campo, crudo);
      if (v === undefined) continue;
      salida[String(campo.id)] = v;
      usados.add(campo.id);
    }
    return salida;
  }

  valorDeCampo(campo: CampoGuia, crudo: unknown): ValorCampo | undefined {
    if (crudo === null) return null;
    switch (campo.tipo) {
      case 'NUMERO': {
        if (typeof crudo === 'string' && crudo.trim() === '') return null;
        const n = Number(crudo);
        if (!Number.isFinite(n)) {
          throw new BadRequestException(`«${campo.nombre}» debe ser un número.`);
        }
        return n;
      }
      case 'SI_NO':
        return crudo === true || crudo === 'true' || crudo === 1 || crudo === 'SI' ? true : false;
      default:
        return texto(crudo, campo.tipo === 'TEXTO' ? 500 : 80);
    }
  }

  private normalizarGuia(
    entrada: Record<string, unknown>,
    tipo: string,
    campos: CampoGuia[],
    custodios: Record<RefCustodio, string>,
  ) {
    const usados = new Set<number>();
    const guia: GuiaCustodia = {};

    // Contacto en sitio
    if (esObjeto(entrada.contactoSitio)) {
      const nombre = texto(entrada.contactoSitio.nombre, 120);
      const telefono = texto(entrada.contactoSitio.telefono, 40);
      guia.contactoSitio = nombre || telefono ? { nombre, telefono } : null;
    } else {
      guia.contactoSitio = null;
    }

    // Momento de la firma de este viaje
    if (entrada.firmaMomento === undefined || entrada.firmaMomento === null || entrada.firmaMomento === '') {
      guia.firmaMomento = null;
    } else if (esMomentoFirma(entrada.firmaMomento)) {
      guia.firmaMomento = entrada.firmaMomento;
    } else {
      throw new BadRequestException('El momento de la firma debe ser al salir, al llegar o en los dos.');
    }

    // Campos generales
    guia.campos = this.valoresDeCampos(entrada.campos, 'GENERAL', tipo, campos, usados);
    this.exigirObligatorios(campos, 'GENERAL', tipo, guia.campos, () => 'Falta');

    // Contenedores (solo Puerto)
    guia.contenedores = [];
    if (tipo === 'PUERTO') {
      const lista = Array.isArray(entrada.contenedores) ? entrada.contenedores : [];
      if (lista.length > MAX_CONTENEDORES) {
        throw new BadRequestException(`Un viaje puede llevar hasta ${MAX_CONTENEDORES} contenedores.`);
      }
      lista.forEach((c, i) => {
        if (!esObjeto(c)) throw new BadRequestException(`El contenedor ${i + 1} no es válido.`);
        const contenedor: GuiaContenedor = {
          numero: texto(c.numero, 60),
          choferNombre: texto(c.choferNombre, 120),
          choferCedula: texto(c.choferCedula, 30),
          placaCabezal: texto(c.placaCabezal, 30),
          guia: texto(c.guia, 60),
          lote: texto(c.lote, 60),
          cabina: null,
          campos: this.valoresDeCampos(c.campos, 'CONTENEDOR', tipo, campos, usados),
        };
        if (esObjeto(c.cabina)) {
          const ref = c.cabina.custodio;
          let custodio: RefCustodio | null = null;
          if (ref !== null && ref !== undefined && ref !== '') {
            if (typeof ref !== 'string' || !REFS_CUSTODIO.includes(ref as RefCustodio)) {
              throw new BadRequestException(`El custodio de cabina del contenedor ${i + 1} no es válido.`);
            }
            if (!(custodios[ref as RefCustodio] ?? '').trim()) {
              throw new BadRequestException(
                `El custodio de cabina del contenedor ${i + 1} debe ser uno de los custodios del viaje.`,
              );
            }
            custodio = ref as RefCustodio;
          }
          const placa = texto(c.cabina.placa, 30);
          const tipoVehiculo = texto(c.cabina.tipoVehiculo, 60);
          contenedor.cabina = custodio || placa || tipoVehiculo ? { custodio, placa, tipoVehiculo } : null;
        }
        this.exigirObligatorios(campos, 'CONTENEDOR', tipo, contenedor.campos!, (n) => `${n} en el contenedor ${i + 1}`, true);
        guia.contenedores!.push(contenedor);
      });
    }

    // Furgón y haciendas (solo Hacienda)
    guia.furgon = null;
    guia.haciendas = [];
    if (tipo === 'HACIENDA') {
      if (esObjeto(entrada.furgon)) {
        const placa = texto(entrada.furgon.placa, 30);
        const choferNombre = texto(entrada.furgon.choferNombre, 120);
        const choferCedula = texto(entrada.furgon.choferCedula, 30);
        guia.furgon = placa || choferNombre || choferCedula ? { placa, choferNombre, choferCedula } : null;
      }
      const lista = Array.isArray(entrada.haciendas) ? entrada.haciendas : [];
      if (lista.length > MAX_HACIENDAS) {
        throw new BadRequestException(`Un viaje puede llevar hasta ${MAX_HACIENDAS} haciendas.`);
      }
      lista.forEach((h, i) => {
        if (!esObjeto(h)) throw new BadRequestException(`La hacienda ${i + 1} no es válida.`);
        const nombre = texto(h.nombre, 150);
        if (!nombre) throw new BadRequestException(`Escribe el nombre de la hacienda ${i + 1}.`);
        let sacos: number | null = null;
        if (h.sacos !== null && h.sacos !== undefined && h.sacos !== '') {
          sacos = Number(h.sacos);
          if (!Number.isInteger(sacos) || sacos <= 0) {
            throw new BadRequestException(`Los sacos de la hacienda ${i + 1} deben ser un número entero mayor a 0.`);
          }
        }
        // Misma regla de siempre, aplicada a la primera hacienda: nombre y sacos mayores a 0.
        if (i === 0 && sacos === null) {
          throw new BadRequestException('Indica la cantidad de sacos de la hacienda.');
        }
        const hacienda: GuiaHacienda = {
          nombre,
          guia: texto(h.guia, 60),
          sacos,
          campos: this.valoresDeCampos(h.campos, 'HACIENDA', tipo, campos, usados),
        };
        this.exigirObligatorios(campos, 'HACIENDA', tipo, hacienda.campos!, (n) => `${n} en la hacienda ${i + 1}`, true);
        guia.haciendas!.push(hacienda);
      });
    }

    // Foto de los campos usados, para que el viaje se lea igual aunque luego se renombre u oculte un campo.
    const etiquetas: Record<string, GuiaEtiqueta> = {};
    for (const c of campos) {
      if (!usados.has(c.id)) continue;
      etiquetas[String(c.id)] = {
        nombre: c.nombre,
        tipo: c.tipo,
        bloque: c.bloque,
        enPdf: c.enPdf,
        esSello: c.esSello,
        orden: c.orden,
      };
    }
    guia.etiquetas = etiquetas;

    const sacosTotal = (guia.haciendas ?? []).reduce((s, h) => s + (h.sacos ?? 0), 0);
    const columnas = {
      contenedores: (guia.contenedores ?? []).map((c) => c.numero).filter(Boolean),
      nombreHacienda: guia.haciendas?.[0]?.nombre || null,
      cantidadSacos: sacosTotal > 0 ? sacosTotal : null,
    };
    return { guia, columnas };
  }

  /**
   * Los campos obligatorios que llena la oficina (activos y de este tipo de servicio) deben tener valor. Los que
   * llena el custodio en ruta no se exigen todavía (Fase 1). `nombrado`: cómo se dice dónde falta.
   */
  private exigirObligatorios(
    campos: CampoGuia[],
    bloque: string,
    tipo: string,
    valores: Record<string, ValorCampo>,
    donde: (nombre: string) => string,
    conNombre = false,
  ) {
    for (const c of campos) {
      if (!c.activo || !c.obligatorio || c.llenaQuien !== 'OFICINA' || !this.aplica(c, tipo, bloque)) continue;
      if (!tieneValor(valores[String(c.id)])) {
        const mensaje = conNombre ? donde(`"${c.nombre}"`) : `"${c.nombre}"`;
        throw new BadRequestException(`Falta ${mensaje}.`);
      }
    }
  }
}
