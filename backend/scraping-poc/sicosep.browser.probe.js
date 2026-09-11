// Sprint 2b — SICOSEP con navegador real (Playwright).
// Responde las tres preguntas que deciden si el spike se reabre o se cierra:
//   Q1 ¿un navegador real pasa el WAF Incapsula? (por HTTP plano NO: ~965 bytes de bloqueo)
//   Q2 ¿se puede relevar el captcha y leer el resultado?
//   Q3 ¿el captcha se pide una vez por sesión o una vez por consulta? (decide el ROI)
const { withPage, saveEvidence, markers } = require('./browser');

const URL = 'https://sicosep.ministeriodelinterior.gob.ec/';

const BLOCK_MARKERS = ['incapsula', 'incident id', 'request unsuccessful', 'access denied'];
const CAPTCHA_MARKERS = ['captcha', 'codigo de seguridad', 'código de seguridad', 'code'];

async function probeSicosepBrowser({ headed = false } = {}) {
  const result = {
    platform: 'SICOSEP',
    mode: 'browser',
    questions: {},
    reasons: [],
    evidence: {},
  };

  try {
    await withPage(
      async (page) => {
        const response = await page.goto(URL, { waitUntil: 'domcontentloaded' });
        const evidence = await saveEvidence(page, 'sicosep-home');

        const found = markers(evidence.html, [...BLOCK_MARKERS, ...CAPTCHA_MARKERS, 'cedula', 'cédula']);
        const blocked = BLOCK_MARKERS.some((m) => found[m]) || evidence.bytes < 2000;

        result.evidence = {
          status: response ? response.status() : null,
          bytes: evidence.bytes,
          title: await page.title(),
          screenshot: evidence.screenshot,
          markers: found,
        };

        // Q1 — ¿el navegador real llega al portal, o sigue el bloqueo del WAF?
        result.questions.q1_pasaWaf = !blocked;
        result.reasons.push(
          blocked
            ? `waf-bloquea-tambien-navegador: ${evidence.bytes} bytes, marcadores de bloqueo presentes`
            : `waf-superado: el portal renderiza ${evidence.bytes} bytes de HTML real`,
        );

        if (blocked) {
          // Sin Q1 no tiene sentido medir Q2 ni Q3.
          result.questions.q2_captchaRelevable = false;
          result.questions.q3_sesionReutilizable = false;
          return;
        }

        // Q2 — ¿existe un formulario público por cédula y un captcha localizable?
        const cedulaInput = await page.$('input[name*="cedula" i], input[id*="cedula" i]');
        const captchaImg = await page.$('img[src*="captcha" i], img[id*="captcha" i], img[alt*="seguridad" i]');
        result.questions.q2_captchaRelevable = !!cedulaInput && !!captchaImg;
        result.reasons.push(
          `formulario: input-cedula=${!!cedulaInput}, img-captcha=${!!captchaImg}`,
        );

        // Q3 — solo se puede responder con una persona resolviendo el captcha:
        // requiere correr en modo headed y observar si tras la 1ª consulta el
        // portal vuelve a pedir código para la 2ª cédula.
        result.questions.q3_sesionReutilizable = null;
        result.reasons.push(
          headed
            ? 'q3-manual: resuelve el captcha en la ventana abierta y consulta 2 cédulas seguidas para ver si vuelve a pedirlo'
            : 'q3-pendiente: correr `node run.js --headed` con una persona presente para medirlo',
        );
      },
      { headed },
    );
  } catch (e) {
    result.reasons.push(`error: ${e.message}`);
    result.questions.q1_pasaWaf = false;
  }

  result.viable = result.questions.q1_pasaWaf === true && result.questions.q2_captchaRelevable === true;
  return result;
}

module.exports = { probeSicosepBrowser };
