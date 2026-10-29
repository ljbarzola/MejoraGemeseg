// Copia src/ a dist/ para cargarla en el navegador o subirla a las tiendas.
//   node build.mjs                          → dist/ apuntando a https://app.gemeseg.com/api
//   node build.mjs --dev http://localhost:3100/api → dist/ para probar contra un servidor local
//                                                    (la pantalla de la app se toma de http://localhost:5273; cámbiala con --app <url>)
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));
const origen = join(raiz, 'src');
const destino = join(raiz, 'dist');

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
cpSync(origen, destino, { recursive: true });

const i = process.argv.indexOf('--dev');
if (i !== -1) {
  const url = process.argv[i + 1];
  if (!url || !/^https?:\/\/localhost(:\d+)?\//.test(url)) {
    console.error('Uso: node build.mjs --dev http://localhost:3100/api (solo localhost).');
    process.exit(1);
  }
  // La pantalla de la app en local (frontend de Vite); se puede cambiar con `--app http://localhost:5273`.
  const j = process.argv.indexOf('--app');
  const app = (j !== -1 ? process.argv[j + 1] : 'http://localhost:5273').replace(/\/$/, '');
  writeFileSync(
    join(destino, 'config.js'),
    `export const SERVIDOR = '${url.replace(/\/$/, '')}';\nexport const APP = '${app}';\n`,
  );
  const manifiestoRuta = join(destino, 'manifest.json');
  const manifiesto = JSON.parse(readFileSync(manifiestoRuta, 'utf8'));
  manifiesto.name = 'Bitácora Gemeseg (desarrollo)';
  manifiesto.host_permissions = [...manifiesto.host_permissions, new URL(url).origin + '/*'];
  writeFileSync(manifiestoRuta, JSON.stringify(manifiesto, null, 2) + '\n');
  console.log(`dist/ listo (desarrollo, servidor ${url}).`);
} else {
  console.log('dist/ listo (producción).');
}
