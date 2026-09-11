# Spike Sprint 2 / 2b — Viabilidad de verificación automatizada SICOSEP / SUT / IESS

**Decisión final: NO viable automatizar la verificación por scraping. Confirmado dos veces — por HTTP plano (Sprint 2) y con navegador real (Sprint 2b).**

## Evidencia (reproducible)

```bash
npm install          # instala Playwright + Chromium SOLO en esta carpeta
node run.js          # todas las sondas (HTTP + navegador headless)
node run.js --headed # abre Chromium visible, para resolver el captcha a mano
node run.js --http-only   # solo las sondas originales, sin Playwright
```
Screenshots y HTML capturado quedan en `out/`.

### Sprint 2 — HTTP plano (`sicosep.probe.js`, `sut.probe.js`)

**SICOSEP** (`sicosep.ministeriodelinterior.gob.ec`)
- El home responde ~960 bytes con página de **bloqueo Incapsula/Imperva** (WAF en el borde): el HTTP automatizado no llega al portal real.
- El flujo ciudadano documentado exige **código de seguridad (captcha)** + clic en Buscar.
- El dominio antiguo (`ministeriodegobierno`) ya no resuelve (ENOTFOUND).

**SUT** (`sut.trabajo.gob.ec`)
- Portal **JSF con login**: la consulta individual exige credenciales de empleador. No hay formulario público por cédula.
- Vía CKAN (`datosabiertos.gob.ec`, API pública, sin scraping): el CSV de contratos vigentes publica **conteos agregados** (`genero;provincia;tipoContrato;actividad;cantidad`), **sin filas por cédula**. Sirve para estadística, no para verificar a una persona.
- En la última corrida el portal directamente no respondió dentro del timeout (`portal-inaccesible`), lo que refuerza el punto de inestabilidad.

### Sprint 2b — Navegador real / Playwright (`sicosep.browser.probe.js`, `iess.browser.probe.js`)

Se reabrió el spike para responder tres preguntas concretas antes de descartar la automatización:

| # | Pregunta | Resultado |
|---|---|---|
| Q1 | ¿Un navegador real pasa el WAF? | **NO.** Chromium real recibe **887 bytes** con marcadores `incapsula` / `incident id` / `request unsuccessful`, `<title>` vacío y **screenshot en blanco** (`out/sicosep-home.png`). Bloquea incluso más agresivamente que el `fetch` plano (962 bytes). |
| Q2 | ¿Se puede relevar el captcha y leer el resultado? | **No aplica**: sin superar Q1 no hay formulario que instrumentar. No hay `input` de cédula ni `img` de captcha en la respuesta. |
| Q3 | ¿Una sesión sirve para N consultas? | **No aplica.** Era la pregunta que decidía el ROI (un captcha por lote vs. uno por cédula); sin Q1 no se puede medir. |

**IESS** (`iess.gob.ec`) — sin WAF, pero tampoco hay consulta pública automatizable:
- `certificados-web/pages/certificadoNoAdeudar.jsf` → **404** (la URL ya no existe; el portal se movió).
- `afiliado-web/pages/principal.jsf` → 200, pero es una landing: menciona "cédula" en el texto y **no tiene ningún `input` de cédula**. El flujo real vive detrás del login de afiliado.

## Conclusión

El obstáculo no es capacidad técnica, son tres barreras que no dependen de nosotros:

1. **No hay API pública** en ninguna de las tres plataformas.
2. **Hay controles anti-bot deliberados** (WAF + captcha). Saltárselos automáticamente sería evadir un control de seguridad de un sitio del Estado — no es algo defendible ante una auditoría, y por eso este PoC nunca intentó un solver de captcha ni automatizar el login de empleador de SUT.
3. **Fragilidad silenciosa.** Aunque funcionara hoy, el día que el portal cambie el HTML el scraper falla *sin avisar* y RRHH vería "verificado" a alguien que nunca se verificó. Eso es peor que no tener automatización. El 404 del IESS y el timeout del SUT en esta misma corrida son la demostración: estos portales se mueven solos.

## Solución adoptada (ya implementada)

Modelo **"alerta + verificación asistida"**, no scraping:
1. Estado por cédula y plataforma: `PENDIENTE` / `VERIFICADO` / `NO_ENCONTRADO` (alerta, no bloqueo) — modelo `VerificationCheck`.
2. Deep-links oficiales + guía corta para que RRHH complete la consulta manual (captcha incluido) — `frontend/src/pages/personal/VerificacionPage.tsx`.
3. Se registra resultado + fecha + responsable: la consulta la hace una persona en 30 segundos, pero **la trazabilidad —que es lo que pedía la auditoría— queda en el sistema**.
4. Reevaluar si el gobierno publica una API o se firma un convenio de interoperabilidad. Esa gestión es administrativa, no de desarrollo.

## Aislamiento

Esta carpeta **no** es parte del backend Nest: nada la importa, no toca la DB, no usa credenciales. Riesgo cero para el sistema principal.

**Playwright vive solo aquí** (`scraping-poc/package.json`) y nunca debe agregarse a `backend/package.json`: sumaría ~400 MB de binarios de Chromium a la imagen de Cloud Run.
