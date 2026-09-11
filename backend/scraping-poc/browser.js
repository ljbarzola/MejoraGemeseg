// Helper de navegador para el PoC de Sprint 2b.
// Playwright se instala SOLO en esta carpeta (ver package.json local): añadirlo al
// backend metería ~400 MB de binarios de Chromium en la imagen de Cloud Run.
//
// Límite deliberado: el captcha lo resuelve una persona. Aquí no se automatiza
// ningún solver ni se toca el login de empleador de SUT.
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'out');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function ensureOutDir() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  return OUT_DIR;
}

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return null;
  }
}

/**
 * Abre una página con un navegador real y devuelve el HTML renderizado.
 * headed=true deja la ventana visible para inspección manual (y para que una
 * persona pueda resolver el captcha en la prueba de la pregunta 2).
 */
async function withPage(fn, { headed = false, timeoutMs = 45000 } = {}) {
  const playwright = loadPlaywright();
  if (!playwright) {
    throw new Error(
      'Playwright no está instalado. Corre `npm install` dentro de backend/scraping-poc y luego `npx playwright install chromium`.',
    );
  }

  const browser = await playwright.chromium.launch({ headless: !headed });
  try {
    const context = await browser.newContext({
      userAgent: UA,
      locale: 'es-EC',
      viewport: { width: 1366, height: 768 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    return await fn(page, context);
  } finally {
    await browser.close();
  }
}

/** Guarda screenshot + HTML en out/ como evidencia reproducible del spike. */
async function saveEvidence(page, name) {
  const dir = ensureOutDir();
  const shot = path.join(dir, `${name}.png`);
  const htmlPath = path.join(dir, `${name}.html`);
  const html = await page.content();
  await page.screenshot({ path: shot, fullPage: true });
  fs.writeFileSync(htmlPath, html, 'utf8');
  return { html, bytes: Buffer.byteLength(html, 'utf8'), screenshot: shot, htmlPath };
}

function markers(text, list) {
  const low = (text || '').toLowerCase();
  const found = {};
  for (const m of list) found[m] = low.includes(m.toLowerCase());
  return found;
}

module.exports = { withPage, saveEvidence, markers, ensureOutDir, loadPlaywright, OUT_DIR };
