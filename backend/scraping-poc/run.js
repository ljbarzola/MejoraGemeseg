// Orquestador del spike. Uso: node run.js
// Imprime el veredicto JSON y sale 0 si el PoC corrió completo (aunque el scraping NO sea viable).
const { probeSicosep } = require('./sicosep.probe');
const { probeSut } = require('./sut.probe');

(async () => {
  const started = Date.now();
  const [sicosep, sut] = await Promise.all([probeSicosep(), probeSut()]);
  const verdict = {
    spike: 'Sprint 2 RRHH — viabilidad scraping SICOSEP/SUT',
    date: new Date().toISOString().slice(0, 10),
    sicosep,
    sut,
    decision: 'NO VIABLE automatizar la verificación por scraping en este momento',
    recommendation: 'Modelo "alerta + verificación asistida": (1) estado por candidato "no verificado en plataforma X"; (2) deep-links oficiales + guía para que RRHH complete el captcha/consulta manual; (3) registrar resultado y fecha en el checklist de cumplimiento. Reevaluar si aparece API o convenio oficial.',
  };
  console.log(JSON.stringify(verdict, null, 2));
  console.log(`\nPoC completado en ${((Date.now() - started) / 1000).toFixed(1)}s`);
})().catch((e) => {
  console.error('PoC falló:', e.message);
  process.exit(2);
});
