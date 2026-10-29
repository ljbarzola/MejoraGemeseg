// Genera los iconos PNG (azul con un círculo blanco) sin dependencias. Uso: node scripts/crear-iconos.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'icons');
mkdirSync(destino, { recursive: true });

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** Cuadrado azul de esquinas redondeadas con un anillo blanco, suavizado por muestreo 4x4. */
function icono(lado) {
  const filas = [];
  const r = lado * 0.22;
  const centro = (lado - 1) / 2;
  const SS = 4;
  for (let y = 0; y < lado; y++) {
    const fila = Buffer.alloc(1 + lado * 4);
    for (let x = 0; x < lado; x++) {
      let azul = 0;
      let blanco = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS - 0.5;
          const py = y + (sy + 0.5) / SS - 0.5;
          // Esquinas redondeadas.
          const dx = Math.max(Math.abs(px - centro) - (lado / 2 - r), 0);
          const dy = Math.max(Math.abs(py - centro) - (lado / 2 - r), 0);
          if (Math.hypot(dx, dy) <= r) {
            azul++;
            const d = Math.hypot(px - centro, py - centro);
            if (d <= lado * 0.3 && d >= lado * 0.17) blanco++;
            else if (d <= lado * 0.08) blanco++;
          }
        }
      }
      const total = SS * SS;
      const a = azul / total;
      const b = a ? blanco / azul : 0;
      const i = 1 + x * 4;
      fila[i] = Math.round(43 + (255 - 43) * b);
      fila[i + 1] = Math.round(108 + (255 - 108) * b);
      fila[i + 2] = Math.round(176 + (255 - 176) * b);
      fila[i + 3] = Math.round(a * 255);
    }
    filas.push(fila);
  }
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(lado, 0);
  cabecera.writeUInt32BE(lado, 4);
  cabecera[8] = 8; // 8 bits por canal
  cabecera[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', cabecera),
    trozo('IDAT', deflateSync(Buffer.concat(filas))),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

for (const lado of [16, 32, 48, 128]) {
  writeFileSync(join(destino, `icon${lado}.png`), icono(lado));
  console.log(`icon${lado}.png`);
}
