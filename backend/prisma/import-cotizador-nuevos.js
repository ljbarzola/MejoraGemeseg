/**
 * Trae al catálogo de MejoraGemeseg SOLO lo que el Cotizador original tiene de nuevo (productos, servicios,
 * materiales e instalaciones cuyo código todavía no existe en Mejora). Es el hermano "solo aditivo" de
 * import-cotizador.js: aquel reemplaza todo (y borraría las cotizaciones hechas en Mejora), este nunca borra
 * ni modifica nada que ya exista.
 *
 *   node prisma/import-cotizador-nuevos.js --dump ruta/backup.sql --company gemeseg            (informe, NO escribe)
 *   node prisma/import-cotizador-nuevos.js --dump ruta/backup.sql --company gemeseg --aplicar  (añade lo nuevo)
 *
 * Reglas:
 * - Sin --aplicar solo hace SELECT: muestra qué añadiría y qué es distinto. Con --aplicar inserta, en una sola
 *   transacción, únicamente los códigos que NO existen. Nunca hace update ni delete.
 * - Un código que ya existe en Mejora no se toca, aunque el nombre o el costo del original sean otros: se
 *   REPORTA ("distinto") para que una persona decida. Si el nombre es otro, es una colisión de códigos: el mismo
 *   código se usó para dos cosas distintas en cada sistema, y hay que mirarlo antes de mezclar nada.
 * - No toca cotizaciones, plantillas, kits, compartidos ni usuarios. Los kits del original no se importan aquí.
 * - Los contadores de código solo suben (nunca bajan): el siguiente código sigue siendo "el último + 1".
 * - Lo que en el original no tiene nombre (producto vacío) NO se importa.
 * - Colisión de código: el original y Mejora crearon, cada uno por su lado, un producto distinto con el mismo
 *   código (pasa porque los dos van sumando "el último + 1"). Sin --recodificar, --aplicar se niega. Con
 *   --recodificar, esos productos del original entran con el siguiente código libre de Mejora (el de Mejora no
 *   se toca) y el informe muestra la equivalencia "código del original -> código en Mejora".
 */
require('dotenv/config');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : undefined;
};
const DUMP = opt('dump');
const COMPANY = opt('company');
const APLICAR = args.includes('--aplicar');
const RECODIFICAR = args.includes('--recodificar');
if (!DUMP || !COMPANY) {
  console.error('Uso: node prisma/import-cotizador-nuevos.js --dump <respaldo.sql> --company <slug|id> [--aplicar] [--recodificar]');
  process.exit(1);
}

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

const n = (v, def = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
};
const bool = (v) => v === 't' || v === true || v === 'true';
const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
// Mismo producto escrito distinto (acentos, saltos de línea, un detalle añadido) vs producto distinto con el mismo código.
const soloLetras = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const mismoNombre = (a, b) => soloLetras(a).replace(/ /g, '') === soloLetras(b).replace(/ /g, '');
const parecidos = (a, b) => {
  const A = new Set(soloLetras(a).split(' ').filter(Boolean));
  const B = new Set(soloLetras(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return false;
  const comunes = [...A].filter((w) => B.has(w)).length;
  return comunes / Math.min(A.size, B.size) >= 0.6;
};
const num = (c, prefix) => {
  const m = new RegExp(`^${prefix}(\\d+)$`).exec(c);
  return m ? parseInt(m[1], 10) : 0;
};

async function main() {
  const t = parseDump(DUMP);
  for (const need of ['equipos', 'materiales', 'servicios', 'instalaciones']) {
    if (!t[need]) throw new Error(`El respaldo no trae la tabla "${need}": ¿es el respaldo del cotizador?`);
  }

  // Mismo mapeo de campos que import-cotizador.js
  const productos = [];
  const addProd = (kind, r) =>
    productos.push({
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
  const instalaciones = t.instalaciones.rows.map((r) => ({
    code: r.source_id,
    category: r.categoria || '',
    subcategory: r.subcategoria || '',
    name: r.servicio || '',
    unitCost: n(r.costo_unitario),
    notes: r.observaciones || '',
    isActive: r.activo === undefined || r.activo === null ? true : bool(r.activo),
  }));

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const company = /^\d+$/.test(COMPANY)
      ? await prisma.company.findUnique({ where: { id: Number(COMPANY) } })
      : await prisma.company.findFirst({ where: { slug: COMPANY } });
    if (!company) throw new Error(`No existe la empresa "${COMPANY}"`);
    const companyId = company.id;

    const enBdProd = new Map((await prisma.cotProduct.findMany({ where: { companyId } })).map((p) => [p.code, p]));
    const enBdInst = new Map((await prisma.cotInstallService.findMany({ where: { companyId } })).map((p) => [p.code, p]));

    const nuevosProd = [];
    const nuevosInst = [];
    const vacios = [];
    const cambios = []; // mismo producto con otro costo o nombre ligeramente distinto: NO se toca, se reporta
    const colisiones = []; // mismo código, producto distinto: ver --recodificar
    const iguales = { productos: 0, instalaciones: 0 };

    for (const p of productos) {
      if (!p.name.trim()) {
        vacios.push(p.code);
        continue;
      }
      const e = enBdProd.get(p.code);
      if (!e) {
        nuevosProd.push(p);
        continue;
      }
      if (!mismoNombre(e.name, p.name) && !parecidos(e.name, p.name)) {
        colisiones.push({ tipo: 'producto', p, e });
        continue;
      }
      const dif = [];
      if (!mismoNombre(e.name, p.name)) dif.push(`NOMBRE: Mejora="${e.name}" / original="${p.name}"`);
      if (Math.abs(Number(e.unitCost) - p.unitCost) > 0.005) dif.push(`COSTO: Mejora=${Number(e.unitCost)} / original=${p.unitCost}`);
      if (Math.abs(Number(e.monthlyCost) - p.monthlyCost) > 0.005) dif.push(`MENSUAL: Mejora=${Number(e.monthlyCost)} / original=${p.monthlyCost}`);
      if (dif.length) cambios.push({ tipo: 'producto', code: p.code, dif });
      else iguales.productos++;
    }
    for (const i of instalaciones) {
      if (!i.name.trim()) {
        vacios.push(i.code);
        continue;
      }
      const e = enBdInst.get(i.code);
      if (!e) {
        nuevosInst.push(i);
        continue;
      }
      if (!mismoNombre(e.name, i.name) && !parecidos(e.name, i.name)) {
        colisiones.push({ tipo: 'instalación', p: i, e });
        continue;
      }
      const dif = [];
      if (!mismoNombre(e.name, i.name)) dif.push(`NOMBRE: Mejora="${e.name}" / original="${i.name}"`);
      if (Math.abs(Number(e.unitCost) - i.unitCost) > 0.005) dif.push(`COSTO: Mejora=${Number(e.unitCost)} / original=${i.unitCost}`);
      if (dif.length) cambios.push({ tipo: 'instalación', code: i.code, dif });
      else iguales.instalaciones++;
    }

    // Colisiones: con --recodificar el producto del original entra con el siguiente código libre.
    const PREFIJO = { EQUIPO: 'EQ-', MATERIAL: 'MT-', SERVICIO: 'SV-' };
    const equivalencias = []; // { original, mejora, nombre }
    const productosAEntrar = [...nuevosProd];
    const instalacionesAEntrar = [...nuevosInst];
    if (RECODIFICAR && colisiones.length) {
      const ocupados = new Set([...enBdProd.keys(), ...nuevosProd.map((p) => p.code)]);
      const ocupadosInst = new Set([...enBdInst.keys(), ...nuevosInst.map((i) => i.code)]);
      for (const c of colisiones.sort((a, b) => a.p.code.localeCompare(b.p.code))) {
        if (c.tipo === 'producto') {
          const pre = PREFIJO[c.p.kind];
          let k = Math.max(0, ...[...ocupados].map((x) => num(x, pre))) + 1;
          const code = `${pre}${String(k).padStart(4, '0')}`;
          ocupados.add(code);
          productosAEntrar.push({ ...c.p, code });
          equivalencias.push({ original: c.p.code, mejora: code, nombre: c.p.name });
        } else {
          let k = Math.max(0, ...[...ocupadosInst].map((x) => num(x, 'INST-'))) + 1;
          const code = `INST-${String(k).padStart(3, '0')}`;
          ocupadosInst.add(code);
          instalacionesAEntrar.push({ ...c.p, code });
          equivalencias.push({ original: c.p.code, mejora: code, nombre: c.p.name });
        }
      }
    }

    console.log(APLICAR ? '\n=== APLICANDO: solo se añaden códigos nuevos ===' : '\n=== INFORME (no se escribió nada) ===');
    console.log('Empresa:', company.name);
    console.log(`Productos del original: ${productos.length} | ya en Mejora e iguales: ${iguales.productos} | NUEVOS con su mismo código: ${nuevosProd.length}`);
    console.log(`Instalaciones del original: ${instalaciones.length} | ya en Mejora e iguales: ${iguales.instalaciones} | NUEVAS: ${nuevosInst.length}`);
    console.log(`Sin nombre en el original (no se importan): ${vacios.length}`);
    console.log('\nNUEVOS productos (entran con su código):');
    nuevosProd.forEach((p) => console.log(`  + ${p.code} [${p.kind}] ${p.name}  costo=${p.unitCost} mensual=${p.monthlyCost}${p.isActive ? '' : ' (INACTIVO)'}`));
    console.log('NUEVAS instalaciones:');
    nuevosInst.forEach((i) => console.log(`  + ${i.code} ${i.name}  costo=${i.unitCost}${i.isActive ? '' : ' (INACTIVA)'}`));
    console.log(`\nCOLISIONES de código (mismo código, producto DISTINTO; lo de Mejora no se toca): ${colisiones.length}`);
    colisiones.forEach((c) => console.log(`  !! ${c.p.code} (${c.tipo}) Mejora="${c.e.name}" / original="${c.p.name}"`));
    if (equivalencias.length) {
      console.log('Con --recodificar entrarían con otro código:');
      equivalencias.forEach((q) => console.log(`  ${q.original} (original) -> ${q.mejora} (Mejora): ${q.nombre}`));
    }
    console.log(`\nMismo producto con diferencias (NO se tocan, decide una persona): ${cambios.length}`);
    cambios.forEach((d) => console.log(`  ~ ${d.code} (${d.tipo}): ${d.dif.join(' | ')}`));

    if (!APLICAR) {
      console.log('\nNada se escribió. Para añadir lo nuevo, repite el comando con --aplicar (y --recodificar si hay colisiones).');
      return;
    }
    if (colisiones.length && !RECODIFICAR) {
      throw new Error('Hay colisiones de código (mismo código, producto distinto). No se aplica nada: repite con --recodificar o revísalas con una persona.');
    }
    if (productosAEntrar.length === 0 && instalacionesAEntrar.length === 0) {
      console.log('\nNo hay nada nuevo que añadir.');
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (productosAEntrar.length) await tx.cotProduct.createMany({ data: productosAEntrar.map((p) => ({ ...p, companyId })) });
      if (instalacionesAEntrar.length) await tx.cotInstallService.createMany({ data: instalacionesAEntrar.map((i) => ({ ...i, companyId })) });

      // Los contadores solo suben: el siguiente código nuevo es el máximo de todo lo que existe + 1.
      const todos = [...enBdProd.keys(), ...productosAEntrar.map((p) => p.code)];
      const objetivo = {
        EQUIPO: Math.max(0, ...todos.map((c) => num(c, 'EQ-'))),
        MATERIAL: Math.max(0, ...todos.map((c) => num(c, 'MT-'))),
        SERVICIO: Math.max(0, ...todos.map((c) => num(c, 'SV-'))),
        INSTALACION: Math.max(0, ...[...enBdInst.keys(), ...instalacionesAEntrar.map((i) => i.code)].map((c) => num(c, 'INST-'))),
      };
      for (const [kind, lastSeq] of Object.entries(objetivo)) {
        const actual = await tx.cotCounter.findUnique({ where: { companyId_kind: { companyId, kind } } });
        if (!actual) await tx.cotCounter.create({ data: { companyId, kind, lastSeq } });
        else if (actual.lastSeq < lastSeq) await tx.cotCounter.update({ where: { companyId_kind: { companyId, kind } }, data: { lastSeq } });
      }
    });
    console.log(`\nListo: ${productosAEntrar.length} productos y ${instalacionesAEntrar.length} instalaciones añadidos. No se modificó ni borró nada existente.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\nERROR:', e.message);
  process.exit(1);
});
