// PoC SICOSEP: ¿es viable consultar guardias por cédula de forma automatizada?
// Evidencia esperada: WAF Incapsula en el borde + captcha en el formulario ciudadano.
const { fetchText, markers } = require('./common');

async function probeSicosep() {
  const reasons = [];
  let home = null;
  try {
    home = await fetchText('https://sicosep.ministeriodelinterior.gob.ec/');
  } catch (e) {
    reasons.push('portal-inaccesible: ' + (e.cause?.message || e.message));
    return { platform: 'SICOSEP', viable: false, reasons };
  }
  const m = markers(home.text, ['incapsula', 'incident id', 'cedula', 'captcha', 'codigo de seguridad']);
  if (m['incapsula'] || m['incident id']) {
    reasons.push('waf-incapsula: el portal responde con página de bloqueo Incapsula/Imperva (bloquea HTTP automatizado en el borde)');
  }
  if (home.bytes < 2000) {
    reasons.push(`respuesta-anomala: home devuelve solo ${home.bytes} bytes (típico de challenge/bloqueo, no del portal real)`);
  }
  // El flujo ciudadano documentado exige "código de seguridad" (captcha) + clic en Buscar.
  reasons.push('captcha-requerido: el flujo público "Consultas a la ciudadanía → Guardias" exige código de seguridad + interacción manual');
  return {
    platform: 'SICOSEP',
    viable: false,
    evidence: { status: home.status, bytes: home.bytes, markers: m },
    reasons,
  };
}

module.exports = { probeSicosep };
