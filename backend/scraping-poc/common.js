// Utilidades compartidas del PoC. Sin dependencias externas (fetch nativo).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function fetchText(url, { timeoutMs = 15000, range } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = { 'User-Agent': UA };
    if (range) headers.Range = range;
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, ok: res.ok, finalUrl: res.url, bytes: buf.length, text: buf.toString('utf8') };
  } finally {
    clearTimeout(t);
  }
}

function markers(text, list) {
  const low = text.toLowerCase();
  const found = {};
  for (const m of list) found[m] = low.includes(m.toLowerCase());
  return found;
}

module.exports = { fetchText, markers };
