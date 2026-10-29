# Extensión del navegador de la Bitácora (Chrome y Edge)

Completa la «hoja del día» de app.gemeseg con los **sitios web (solo el dominio) y el tiempo**, únicamente dentro del horario que la empresa define en Bitácora → Configuración → Horario, y solo si la persona la vincula con un código. Un solo código para Chrome y Edge (Manifest V3, sin dependencias ni paso de compilación real).

Plan y decisiones: `PLAN-extension-bitacora.md` (fuera del repo, en `PROYECTO MEJORA`).

## Qué hace y qué no

- Cada minuto, **solo si** la persona está vinculada, su hoja está activa, está dentro del horario, está activa en el equipo (sin 3 min de reposo) y la ventana del navegador está al frente, anota el **dominio** de la pestaña activa. Cada 5 minutos envía lo anotado.
- **No** lee páginas, URLs completas, títulos, formularios, teclas ni contraseñas; no toma capturas; no registra ventanas privadas (`incognito: not_allowed`) ni páginas internas (`chrome://`, `file://`) ni direcciones IP.
- El servidor vuelve a comprobar todo (horario, hoja activa, dominio válido, antigüedad) y descarta lo que no cumpla.
- Se vincula con un código de un solo uso (10 minutos) que la persona saca en «Mi hoja del día». El token que recibe la extensión solo sirve para enviar sitios web de esa persona y se revoca desde la extensión o desde «Mi hoja del día».

## Probarla en local (desarrollo)

1. Servidor y frontend locales arriba (backend en `:3100`, frontend en `:5273`), con la hoja de la persona activada y un horario guardado que incluya la hora actual.
2. Generar la copia de desarrollo (apunta a `http://localhost:3100/api` y añade ese permiso solo a esa copia):
   ```bash
   cd extension-bitacora
   node build.mjs --dev http://localhost:3100/api
   ```
3. En Chrome o Edge abrir `chrome://extensions` (`edge://extensions`), activar **Modo de desarrollador** → **Cargar descomprimida** → elegir la carpeta `extension-bitacora/dist`.
4. En app.gemeseg → Bitácora → Mi hoja del día → **Vincular extensión**, copiar el código y escribirlo en el icono de la extensión.
5. Navegar unos minutos; el icono muestra «ON» mientras registra. Los envíos salen cada 5 minutos y aparecen como filas «Navegador» en «Mi hoja del día».

Esta forma de carga manual es **solo para pruebas**. Al equipo se le entrega únicamente por las tiendas.

## Producción

`node build.mjs` (sin `--dev`) deja `dist/` apuntando a `https://app.gemeseg.com/api`. Para publicar: comprimir el contenido de `dist/` en un `.zip` y subirlo a la Chrome Web Store (no listada) y a Microsoft Edge Add-ons (oculta). Cuando se publique, poner el enlace en la variable `VITE_BITACORA_EXTENSION_URL` del frontend para que el cuadro «Vincular extensión» lo muestre.

Permisos que pide y para qué (para la revisión de las tiendas):

| Permiso | Para qué |
|---|---|
| `tabs` | Leer la dirección de la pestaña activa para quedarse solo con el dominio |
| `idle` | Saber si la persona está activa en el equipo (no se registra en reposo) |
| `alarms` | Despertar la extensión cada minuto, cada 5 minutos y cada 15 |
| `storage` | Guardar el token, la configuración y lo anotado mientras no se envía |
| `https://app.gemeseg.com/*` | Hablar con el servidor de app.gemeseg |

## Archivos

- `src/lib.js`: lógica pura (dominio, horario, motivo de pausa, tramos).
- `src/background.js`: muestreo y envío (service worker).
- `src/popup.*`: ventana de la extensión (vincular, estado, desvincular).
- `src/api.js` y `src/config.js`: llamadas al servidor y su dirección.
- `scripts/crear-iconos.mjs`: genera los iconos (`npm run iconos`).
- `build.mjs`: copia `src/` a `dist/`.
