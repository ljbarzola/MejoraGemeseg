/**
 * Importa el catálogo, kits, plantillas y cotizaciones del Cotizador independiente de Gemeseg (Supabase)
 * a las tablas Cot* de MejoraGemeseg. Se ejecuta UNA vez, desde un respaldo (pg_dump) del cotizador:
 *
 *   node prisma/import-cotizador.js --dump ruta/backup.sql --company gemeseg [--dry-run] [--replace]
 *
 * - NUNCA toca el cotizador original: solo LEE el archivo del respaldo.
 * - Escribe en la base a la que apunte DATABASE_URL. Es una sola transacción: si algo falla no queda nada.
 * - --dry-run hace todo y al final DESHACE (solo muestra el informe).
 * - Sin --replace, se niega a correr si la empresa ya tiene datos del Cotizador (no mezcla ni duplica).
 *   Con --replace borra primero los datos del Cotizador de esa empresa (solo para pruebas locales).
 *
 * Reglas de la copia:
 * - Los productos conservan su código (EQ-0001...). Los desactivados se importan como inactivos.
 * - Los usuarios se enlazan por correo con los de MejoraGemeseg. Lo que sea de alguien que no exista
 *   queda a nombre del administrador de la empresa (conservando el nombre del vendedor) y se avisa.
 * - Las líneas que solo guardaron una POSICIÓN (cotizaciones antiguas) se enlazan con el producto que hoy
 *   tiene esa posición y quedan marcadas (`legacyPosition`) para que la pantalla avise "verificar producto".
 */
require('dotenv/config');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name) => args.includes('--' + name);
const DUMP = opt('dump');
const COMPANY = opt('company');
const DRY = flag('dry-run');
const REPLACE = flag('replace');
if (!DUMP || !COMPANY) {
  console.error('Uso: node prisma/import-cotizador.js --dump <respaldo.sql> --company <slug|id> [--dry-run] [--replace]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Lectura del respaldo (COPY de PostgreSQL)
// ---------------------------------------------------------------------------
function unescape(v) {
  if (v === '\\N') return null;
  return v.replace(/\\(t|n|r|\\)/g, (_, c) => ({ t: '\t', n: '\n', r: '\r', '\\': '\\' })[c]);
}

function parseDump(file) {
  const tables = {};
  let cur = null;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.replace(/\r$/, '');
    const m = /^COPY public\.(\w+) \((.*?)\) FROM stdin;$/.exec(line);
    if (m) {
      cur = m[1];
      tables[cur] = { cols: m[2].split(',').map((c) => c.trim().replace(/"/g, '')), rows: [] };
      continue;
    }
    if (!cur) continue;
    if (line === '\\.') {
      cur = null;
      continue;
    }
    const vals = line.split('\t').map(unescape);
    tables[cur].rows.push(Object.fromEntries(tables[cur].cols.map((c, i) => [c, vals[i]])));
  }
  return tables;
}

const json = (v, def) => {
  if (v === null || v === undefined || v === '') return def;
  try {
    return JSON.parse(v);
  } catch {
    return def;
  }
};
const n = (v, def = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
};
const bool = (v) => v === 't' || v === true || v === 'true';

// Orden del catálogo del cotizador original: por prefijo y luego por número (así se calculaban las posiciones)
const codeKey = (c) => {
  const pre = c.replace(/\d+.*$/, '');
  const num = parseInt(c.replace(/^\D+/, ''), 10) || 0;
  return [pre, num];
};
const compareCodes = (a, b) => {
  const [pa, na] = codeKey(a);
  const [pb, nb] = codeKey(b);
  return pa !== pb ? pa.localeCompare(pb) : na - nb;
};

// ---------------------------------------------------------------------------
async function main() {
  const t = parseDump(DUMP);
  for (const need of ['equipos', 'materiales', 'servicios', 'instalaciones', 'saved_quotes', 'profiles']) {
    if (!t[need]) throw new Error(`El respaldo no trae la tabla "${need}": ¿es el respaldo del cotizador?`);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const warn = { sinUsuario: new Set(), numerosRepetidos: [], lineasSinCodigo: 0, lineasPorPosicion: 0, codigosInexistentes: new Set(), kitsPorPosicion: 0 };

  try {
    const company = /^\d+$/.test(COMPANY)
      ? await prisma.company.findUnique({ where: { id: Number(COMPANY) } })
      : await prisma.company.findFirst({ where: { slug: COMPANY } });
    if (!company) throw new Error(`No existe la empresa "${COMPANY}"`);
    const companyId = company.id;

    const existentes = await prisma.cotProduct.count({ where: { companyId } });
    const existentesQ = await prisma.cotQuote.count({ where: { companyId } });
    if ((existentes > 0 || existentesQ > 0) && !REPLACE) {
      throw new Error(
        `La empresa ${company.name} ya tiene datos del Cotizador (${existentes} productos, ${existentesQ} cotizaciones). ` +
          'No se mezcla: vacíalos o usa --replace SOLO en una base de pruebas.',
      );
    }

    // ---- Usuarios: correo del cotizador original -> usuario de MejoraGemeseg ----
    const usuarios = await prisma.user.findMany({ where: { companyId }, select: { id: true, email: true, fullName: true, role: true, isActive: true, phone: true } });
    const porCorreo = new Map(usuarios.map((u) => [u.email.toLowerCase(), u]));
    const admin = usuarios.find((u) => u.role === 'ADMIN' && u.isActive) ?? usuarios.find((u) => u.isActive);
    if (!admin) throw new Error('La empresa no tiene ningún usuario activo al que asignar las cotizaciones sin dueño');
    const userMap = new Map(); // id Supabase -> id MejoraGemeseg
    const perfilPorId = new Map(t.profiles.rows.map((p) => [p.id, p]));
    for (const p of t.profiles.rows) {
      const u = porCorreo.get((p.correo || '').toLowerCase());
      if (u) userMap.set(p.id, u.id);
      else warn.sinUsuario.add(`${p.nombre || '(sin nombre)'} <${p.correo || 'sin correo'}>`);
    }
    const dueño = (supaId) => userMap.get(supaId) ?? admin.id;

    // ---- Catálogo ----
    const productos = [];
    const addProd = (kind, r) =>
      productos.push({
        companyId,
        kind,
        code: r.source_id,
        category: r.categoria || '',
        subcategory: r.subcategoria || '',
        model: kind === 'EQUIPO' ? r.modelo || '' : '',
        name: (kind === 'SERVICIO' ? r.servicio : r.producto) || '',
        description: kind === 'SERVICIO' ? r.descripcion || '' : '',
        unit: kind === 'SERVICIO' ? 'servicio' : r.unidades || '',
        defaultQty: n(r.cantidad_default, 1) || 1,
        unitCost: n(r.costo_unitario),
        monthlyCost: n(r.costo_mensual),
        annualCost: n(r.costo_anual),
        hasProfit: kind === 'SERVICIO' ? false : bool(r.ganancia_flag),
        hasInstall: kind === 'SERVICIO' ? false : bool(r.instalacion_flag),
        supplier: kind === 'EQUIPO' ? r.proveedor || '' : '',
        lastUpdate: kind === 'EQUIPO' ? r.ultima_act || null : null,
        notes: r.observaciones || '',
        isActive: r.activo === undefined || r.activo === null ? true : bool(r.activo),
      });
    t.equipos.rows.forEach((r) => addProd('EQUIPO', r));
    t.materiales.rows.forEach((r) => addProd('MATERIAL', r));
    t.servicios.rows.forEach((r) => addProd('SERVICIO', r));
    const codigos = new Set(productos.map((p) => p.code));
    const instalaciones = t.instalaciones.rows.map((r) => ({
      companyId,
      code: r.source_id,
      category: r.categoria || '',
      subcategory: r.subcategoria || '',
      name: r.servicio || '',
      unitCost: n(r.costo_unitario),
      notes: r.observaciones || '',
      isActive: r.activo === undefined || r.activo === null ? true : bool(r.activo),
    }));
    const instPorUuid = new Map(t.instalaciones.rows.map((r) => [r.id, r.source_id]));

    // Posición -> código, calculada como lo hacía el cotizador original (solo productos activos, orden por código)
    const activos = productos.filter((p) => p.isActive).map((p) => p.code).sort(compareCodes);
    const posACodigo = (pos) => (Number.isInteger(pos) && pos >= 0 && pos < activos.length ? activos[pos] : '');

    // ---- Conversión de líneas ----
    const lineaProducto = (l, esKit = false) => {
      const tieneCodigo = !!l.sourceId;
      const code = l.sourceId || posACodigo(l.catalogIdx);
      const out = {
        code,
        qty: n(l.qty, 1),
        installActive: !!l.installActive,
        techCost: n(l.techCost),
        customMargin: l.customMargin === null || l.customMargin === undefined ? null : n(l.customMargin),
      };
      if (l.snap && typeof l.snap === 'object') {
        out.snap = {
          cost: n(l.snap.cost),
          hasGanancia: !!l.snap.hasGanancia,
          hasInstalacion: !!l.snap.hasInstalacion,
          isService: !!l.snap.isService,
          supplier: l.snap.supplier || '',
        };
      }
      if (!tieneCodigo) {
        if (Number.isInteger(l.catalogIdx)) out.legacyPosition = l.catalogIdx;
        if (esKit) warn.kitsPorPosicion++;
        else warn.lineasPorPosicion++;
      }
      if (!code) warn.lineasSinCodigo++;
      else if (!codigos.has(code)) warn.codigosInexistentes.add(code);
      return out;
    };
    const convertirLineas = (lista) =>
      (Array.isArray(lista) ? lista : []).map((l) => {
        if (l.isInstallService) {
          return {
            isInstallService: true,
            id: String(instPorUuid.get(l.serviceId) || l.id || l.sourceId || ''),
            description: l.description || l.servicio || 'Servicio de instalación',
            category: l.category || '',
            subcategory: l.subcategory || '',
            cost: n(l.cost ?? l.costo_unitario),
            qty: n(l.qty, 1),
            customCost: l.customCost === null || l.customCost === undefined ? null : n(l.customCost),
            customMargin: l.customMargin === null || l.customMargin === undefined ? null : n(l.customMargin),
          };
        }
        if (l.isKit) {
          return {
            isKit: true,
            kitName: l.kitName || 'Kit',
            qty: n(l.qty, 1),
            kitComponents: (l.kitComponents || []).map((c) => lineaProducto(c, true)),
          };
        }
        return lineaProducto(l);
      });

    // ---- Escritura (una sola transacción) ----
    const resumen = await prisma.$transaction(
      async (tx) => {
        if (REPLACE) {
          await tx.cotQuoteShare.deleteMany({ where: { companyId } });
          await tx.cotEditGrant.deleteMany({ where: { companyId } });
          await tx.cotQuote.deleteMany({ where: { companyId } });
          await tx.cotTemplate.deleteMany({ where: { companyId } });
          await tx.cotKit.deleteMany({ where: { companyId } });
          await tx.cotInstallService.deleteMany({ where: { companyId } });
          await tx.cotProduct.deleteMany({ where: { companyId } });
          await tx.cotCounter.deleteMany({ where: { companyId } });
          await tx.cotQuoteSequence.deleteMany({ where: { companyId } });
        }

        await tx.cotProduct.createMany({ data: productos });
        await tx.cotInstallService.createMany({ data: instalaciones });

        // Contadores: el siguiente código es siempre el último + 1, aunque se hayan borrado los últimos
        const maxNum = (arr, prefix) =>
          arr.reduce((m, c) => {
            const mm = new RegExp(`^${prefix}(\\d+)$`).exec(c);
            return mm ? Math.max(m, parseInt(mm[1], 10)) : m;
          }, 0);
        const contadores = [
          ['EQUIPO', maxNum(productos.filter((p) => p.kind === 'EQUIPO').map((p) => p.code), 'EQ-')],
          ['MATERIAL', maxNum(productos.filter((p) => p.kind === 'MATERIAL').map((p) => p.code), 'MT-')],
          ['SERVICIO', maxNum(productos.filter((p) => p.kind === 'SERVICIO').map((p) => p.code), 'SV-')],
          ['INSTALACION', maxNum(instalaciones.map((i) => i.code), 'INST-')],
        ];
        await tx.cotCounter.createMany({ data: contadores.map(([kind, lastSeq]) => ({ companyId, kind, lastSeq })) });

        // Kits (los del original son de ejemplo y guardan posición: se enlazan con el producto de hoy)
        const kits = (t.kits?.rows ?? []).map((k) => ({
          companyId,
          name: k.name || 'Kit',
          components: json(k.components, [])
            .map((c) => ({
              code: c.sourceId || posACodigo(c.catalogIdx),
              qty: n(c.qty, 1) || 1,
              included: c.included === undefined ? true : !!c.included,
            }))
            .filter((c) => c.code),
          createdBy: userMap.get(k.created_by) ?? null,
        }));
        if (kits.length) await tx.cotKit.createMany({ data: kits });

        // Plantillas
        const plantillas = (t.templates?.rows ?? []).map((p) => ({
          companyId,
          name: p.name || 'Plantilla',
          description: p.description || '',
          clientType: p.client_type || 'mediana',
          industry: p.industry || 'comercio',
          client: json(p.client, {}),
          items: convertirLineas(json(p.productos, [])),
          supplierMargins: json(p.supplier_margins, {}),
          installMargin: n(p.install_margin, 35),
          isSample: bool(p.is_sample),
          createdBy: userMap.get(p.created_by) ?? null,
          createdByName: p.created_by_name || '',
        }));
        if (plantillas.length) await tx.cotTemplate.createMany({ data: plantillas });

        // Cotizaciones (una a una: se necesita el id nuevo para enlazar lo compartido)
        const idNuevo = new Map(); // id Supabase -> id nuevo
        const numerosUsados = new Set();
        let maxSeq = n(t.quote_sequences?.rows?.[0]?.last_seq, 0);
        const ordenadas = [...t.saved_quotes.rows].sort((a, b) => String(a.saved_at).localeCompare(String(b.saved_at)));
        for (const q of ordenadas) {
          let numero = q.cot_num;
          if (numerosUsados.has(numero)) {
            let k = 2;
            while (numerosUsados.has(`${numero}-REP${k}`)) k++;
            warn.numerosRepetidos.push(numero);
            numero = `${numero}-REP${k}`;
          }
          numerosUsados.add(numero);
          const seq = /-(\d+)$/.exec(numero);
          if (seq && /^COT-\d{8}-\d+$/.test(numero)) maxSeq = Math.max(maxSeq, parseInt(seq[1], 10));
          const fecha = q.cot_date || String(q.saved_at).slice(0, 10);
          const creada = await tx.cotQuote.create({
            data: {
              companyId,
              ownerId: dueño(q.user_id),
              vendorName: q.vendor_name || perfilPorId.get(q.user_id)?.nombre || '',
              quoteNumber: numero,
              quoteDate: new Date(fecha + 'T00:00:00Z'),
              client: json(q.client, {}),
              items: convertirLineas(json(q.productos, [])),
              status: q.status || 'borrador',
              installMargin: n(q.install_margin, 35),
              supplierMargins: json(q.supplier_margins, {}),
              discountType: q.discount_type || 'none',
              discountValue: n(q.discount_value),
              conditions: q.conditions || '',
              notes: q.notes || '',
              createdAt: new Date(q.saved_at),
              updatedAt: new Date(q.updated_at || q.saved_at),
            },
          });
          idNuevo.set(q.id, creada.id);
          if (!userMap.has(q.user_id)) warn.sinUsuario.add(`dueño de ${numero}`);
        }
        await tx.cotQuoteSequence.create({ data: { companyId, lastSeq: maxSeq } });

        // Compartir y edición total
        let compartidas = 0;
        for (const s of t.saved_quote_shares?.rows ?? []) {
          const quoteId = idNuevo.get(s.quote_id);
          const sharedWithId = userMap.get(s.shared_with);
          if (!quoteId || !sharedWithId) continue;
          await tx.cotQuoteShare.create({ data: { companyId, quoteId, ownerId: dueño(s.owner_id), sharedWithId } });
          compartidas++;
        }
        let accesos = 0;
        for (const g of t.quote_edit_grants?.rows ?? []) {
          const editorId = userMap.get(g.editor_id);
          const ownerId = userMap.get(g.owner_id);
          if (!editorId || !ownerId) continue;
          await tx.cotEditGrant.create({ data: { companyId, ownerId, editorId } });
          accesos++;
        }

        // Teléfono de cada asesor: el cotizador original lo guardaba en su perfil. Se copia SOLO si la
        // persona no tiene uno en MejoraGemeseg y no es el número por defecto del original (ese lo
        // pone el PDF como respaldo). Nunca se pisa un teléfono ya escrito.
        let telefonosCopiados = 0;
        const TEL_DEFECTO = '+593 99 897 4909';
        const TEL_OK = /^(?=(?:\D*\d){7,15}\D*$)[\d+\-\s()]+$/;
        for (const p of t.profiles.rows) {
          const u = porCorreo.get((p.correo || '').toLowerCase());
          const tel = (p.telefono || '').trim();
          if (!u || u.phone || !tel || tel === TEL_DEFECTO || !TEL_OK.test(tel)) continue;
          await tx.user.update({ where: { id: u.id }, data: { phone: tel } });
          telefonosCopiados++;
        }

        const r = {
          telefonosCopiados,
          productos: productos.length,
          productosInactivos: productos.filter((p) => !p.isActive).length,
          instalaciones: instalaciones.length,
          kits: kits.length,
          plantillas: plantillas.length,
          cotizaciones: ordenadas.length,
          compartidas,
          accesosEdicion: accesos,
          ultimaSecuenciaCotizacion: maxSeq,
          contadores: Object.fromEntries(contadores),
        };
        if (DRY) throw Object.assign(new Error('DRY_RUN'), { resumen: r });
        return r;
      },
      { timeout: 300_000, maxWait: 60_000 },
    ).catch((e) => {
      if (e && e.message === 'DRY_RUN') return { ...e.resumen, simulacro: true };
      throw e;
    });

    console.log(DRY ? '\n=== SIMULACRO (no se guardó nada) ===' : '\n=== IMPORTACIÓN TERMINADA ===');
    console.log('Empresa:', company.name);
    console.log(JSON.stringify(resumen, null, 2));
    console.log('\n--- Avisos ---');
    console.log('Usuarios del cotizador SIN cuenta en MejoraGemeseg:', warn.sinUsuario.size ? [...warn.sinUsuario].join('; ') : 'ninguno');
    console.log('Números de cotización repetidos en el original (se les agregó -REPn):', warn.numerosRepetidos.length ? warn.numerosRepetidos.join(', ') : 'ninguno');
    console.log('Líneas que solo guardaban su posición (marcadas "verificar producto"):', warn.lineasPorPosicion + warn.kitsPorPosicion);
    console.log('Líneas sin ningún código resoluble:', warn.lineasSinCodigo);
    console.log('Códigos citados que no existen en el catálogo:', warn.codigosInexistentes.size ? [...warn.codigosInexistentes].join(', ') : 'ninguno');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\nERROR:', e.message);
  process.exit(1);
});
