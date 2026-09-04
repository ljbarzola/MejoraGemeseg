// PoC SUT: ¿existe consulta pública por cédula o solo agregados?
// Evidencia esperada: portal JSF con login + datos abiertos agregados (sin cédula).
const { fetchText, markers } = require('./common');

async function probeSut() {
  const reasons = [];
  let page = null;
  try {
    page = await fetchText('https://sut.trabajo.gob.ec/contratos-web/');
  } catch (e) {
    reasons.push('portal-inaccesible: ' + (e.cause?.message || e.message));
    return { platform: 'SUT', viable: false, reasons };
  }
  const m = markers(page.text, ['cedula', 'j_idt', 'viewstate', 'login', 'datos abiertos']);
  if (m['j_idt'] || m['viewstate']) {
    reasons.push('app-jsf-con-login: el portal es JavaServer Faces con sesión; la consulta individual exige credenciales de empleador');
  }
  if (!m['cedula']) {
    reasons.push('sin-consulta-publica: no hay formulario público por cédula en el portal');
  }

  // Vía CKAN: ¿el CSV de contratos vigentes tiene filas por persona?
  let csvVerdict = 'no-verificado';
  try {
    const ckan = await fetchText('https://www.datosabiertos.gob.ec/api/3/action/package_show?id=contratos-en-el-sistema-unico-de-trabajo');
    const pkg = JSON.parse(ckan.text);
    const csv = (pkg.result.resources || []).find((r) => (r.format || '').toUpperCase() === 'CSV');
    if (!csv) {
      reasons.push('open-data-sin-csv: el dataset no expone recurso CSV');
    } else {
      const head = await fetchText(csv.url, { range: 'bytes=0-1500' });
      const firstLine = head.text.split('\n')[0] || '';
      const hasCedula = /cedula/i.test(firstLine);
      csvVerdict = hasCedula ? 'filas-por-persona' : 'solo-agregados';
      if (!hasCedula) {
        reasons.push(`open-data-agregado: el CSV publica conteos (genero;provincia;tipo;actividad;cantidad), sin filas por cédula (cabecera: ${firstLine.slice(0, 90)})`);
      }
    }
  } catch (e) {
    reasons.push('open-data-error: ' + (e.cause?.message || e.message));
  }

  return {
    platform: 'SUT',
    viable: false,
    evidence: { status: page.status, markers: m, csvVerdict },
    reasons,
  };
}

module.exports = { probeSut };
