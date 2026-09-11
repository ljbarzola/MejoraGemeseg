// Sprint 2b — IESS con navegador real.
// El IESS no tiene API pública; lo que existe son consultas web ciudadanas
// (certificado de no adeudar / consulta de afiliación), todas con captcha.
// Se prueban las dos entradas conocidas y se reporta cuál renderiza formulario.
const { withPage, saveEvidence, markers } = require('./browser');

const ENDPOINTS = [
  {
    key: 'certificado-no-adeudar',
    url: 'https://www.iess.gob.ec/certificados-web/pages/certificadoNoAdeudar.jsf',
  },
  {
    key: 'afiliacion',
    url: 'https://www.iess.gob.ec/afiliado-web/pages/principal.jsf',
  },
];

const BLOCK_MARKERS = ['incapsula', 'incident id', 'access denied', 'request unsuccessful'];

async function probeIessBrowser({ headed = false } = {}) {
  const result = { platform: 'IESS', mode: 'browser', endpoints: [], reasons: [] };

  for (const ep of ENDPOINTS) {
    const entry = { ...ep };
    try {
      await withPage(
        async (page) => {
          const response = await page.goto(ep.url, { waitUntil: 'domcontentloaded' });
          const evidence = await saveEvidence(page, `iess-${ep.key}`);
          const found = markers(evidence.html, [...BLOCK_MARKERS, 'captcha', 'cedula', 'cédula', 'viewstate']);

          entry.status = response ? response.status() : null;
          entry.bytes = evidence.bytes;
          entry.title = await page.title();
          entry.screenshot = evidence.screenshot;
          entry.markers = found;
          entry.blocked = BLOCK_MARKERS.some((m) => found[m]) || evidence.bytes < 2000;
          entry.tieneInputCedula = !!(await page.$('input[name*="cedula" i], input[id*="cedula" i]'));
          entry.tieneCaptcha =
            found.captcha || !!(await page.$('img[src*="captcha" i], img[id*="captcha" i]'));
          // JSF con ViewState = la sesión y el token viven en el servidor: cualquier
          // automatización se rompe en cuanto el portal cambia de versión.
          entry.esJsf = found.viewstate;
        },
        { headed },
      );
    } catch (e) {
      entry.error = e.message;
      entry.blocked = true;
    }
    result.endpoints.push(entry);
  }

  const usable = result.endpoints.find((e) => !e.blocked && e.tieneInputCedula);
  result.viable = !!usable && !usable.tieneCaptcha;
  result.reasons.push(
    usable
      ? `formulario-publico-en:${usable.key} (captcha=${usable.tieneCaptcha}, jsf=${usable.esJsf})`
      : 'sin-formulario-publico-accesible: ningún endpoint respondió con consulta por cédula usable',
  );
  return result;
}

module.exports = { probeIessBrowser };
