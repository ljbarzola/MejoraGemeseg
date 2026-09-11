// Orquestador del spike. Uso:
//   node run.js              → sondas HTTP (Sprint 2) + sondas de navegador (Sprint 2b), headless
//   node run.js --headed     → abre Chromium visible, para que una persona resuelva el captcha (pregunta Q3)
//   node run.js --http-only  → solo las sondas HTTP originales, sin Playwright
// Sale 0 si el PoC corrió completo (aunque el scraping NO sea viable).
const { probeSicosep } = require('./sicosep.probe');
const { probeSut } = require('./sut.probe');
const { probeSicosepBrowser } = require('./sicosep.browser.probe');
const { probeIessBrowser } = require('./iess.browser.probe');
const { loadPlaywright, OUT_DIR } = require('./browser');

const headed = process.argv.includes('--headed');
const httpOnly = process.argv.includes('--http-only');

(async () => {
  const started = Date.now();
  const [sicosep, sut] = await Promise.all([probeSicosep(), probeSut()]);

  const verdict = {
    spike: 'Sprint 2 RRHH — viabilidad scraping SICOSEP/SUT/IESS',
    date: new Date().toISOString().slice(0, 10),
    http: { sicosep, sut },
    decision: 'NO VIABLE automatizar la verificación por scraping en este momento',
    recommendation:
      'Modelo "alerta + verificación asistida": (1) estado por candidato "no verificado en plataforma X"; (2) deep-links oficiales + guía para que RRHH complete el captcha/consulta manual; (3) registrar resultado y fecha en el checklist de cumplimiento. Reevaluar si aparece API o convenio oficial.',
  };

  if (!httpOnly) {
    if (!loadPlaywright()) {
      verdict.browser = {
        skipped: true,
        reason:
          'Playwright no instalado. Corre `npm install` en backend/scraping-poc y luego `npx playwright install chromium`.',
      };
    } else {
      // Secuencial a propósito: dos Chromium en paralelo contra portales
      // gubernamentales lentos falsea los tiempos y dispara más anti-bot.
      const sicosepBrowser = await probeSicosepBrowser({ headed });
      const iessBrowser = await probeIessBrowser({ headed });
      verdict.browser = { headed, evidenceDir: OUT_DIR, sicosep: sicosepBrowser, iess: iessBrowser };

      // El veredicto de Sprint 2b depende de lo que responda el navegador real.
      if (sicosepBrowser.viable || iessBrowser.viable) {
        verdict.decision =
          'REVISAR: con navegador real al menos una plataforma expone consulta pública. Ver questions/q3 antes de decidir arquitectura de entrega.';
      } else {
        verdict.decision =
          'NO VIABLE automatizar la verificación por scraping, tampoco con navegador real (Sprint 2b confirma el veredicto del Sprint 2)';
      }
    }
  }

  console.log(JSON.stringify(verdict, null, 2));
  console.log(`\nPoC completado en ${((Date.now() - started) / 1000).toFixed(1)}s`);
})().catch((e) => {
  console.error('PoC falló:', e.message);
  process.exit(2);
});
