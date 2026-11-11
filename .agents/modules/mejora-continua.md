# Mejora continua (agente de agentes) — Sistemas

Creado 2026-11-11 y **desplegado en producción el mismo día** (PR #70). Pantalla: Sistemas → Mejora continua (`/sistemas/mejora-continua`, sección `SISTEMAS`).

## Qué es
Un ciclo semanal que Leidy pidió para acercar la plataforma a «un Grok que aprende» sin reentrenar modelos:

- **Lunes 9:00 (Guayaquil)**: una rutina de Claude lee los .md del repo (público en GitHub), la memoria de decisiones y datos AGREGADOS de uso real, y deja de 3 a 5 propuestas: al menos 2 de «automatizar lo actual» y al menos 1 «idea nueva».
- **Leidy decide** en la pantalla (o desde una sesión de Claude): Aprobar plan · Pedir cambios (el agente reescribe el plan) · Rechazar (con motivo obligatorio) · Más tarde.
- **Con el plan aprobado**: «Copiar brief para Claude» y abrir una sesión nueva; allí se trabaja en rama propia, sin commit/push hasta que ella pruebe y diga «ok».
- **Viernes 17:00**: otra rutina cierra la semana: mejorado / faltó / rechazado (con motivos) / lo que aprendió / horas ahorradas estimadas / foco del lunes.

«Human in the loop»: nada pasa de propuesta a trabajo sin que ella apruebe el plan; merge, deploy, correo real y borrados siguen siendo suyos. El agente **aprende de su memoria**: lo rechazado (con motivo) no se repite sin contexto nuevo y lo aprobado orienta lo siguiente.

## Dónde vive cada cosa
- **El «cerebro»** vive fuera de la app, en rutinas de Claude (prompts en `.agents/mejora-continua/prompt-lunes.md` y `prompt-viernes.md`). La app solo guarda el libro, avisa y muestra.
- **Backend** (`backend/src/modules/agents/mejora-continua/`): `mejora-continua.service.ts` (libro, reglas, avisos), `mejora-continua.controller.ts` (dos controladores), `mejora-continua.util.ts` (reglas puras: semana ISO de Ecuador, validación de propuestas, brief), `mejora-continua.schema.ts` (DDL).
- **Tablas** `AgentPropuesta` (el libro) y `AgentMejoraInforme` (notas del lunes y cierre del viernes), creadas al arrancar, SIN modelo en `schema.prisma` (SQL parametrizado) para no tocar el cliente de Prisma mientras haya otras ramas en curso. Cada corrida queda también en `AgentRun` (agente «Agente de Mejora Continua», acciones `PROPONER_MEJORAS` y `CIERRE_SEMANAL`; se ve en Sistemas → Agentes → actividad y en el Dashboard).
- **Frontend**: `pages/sistemas/MejoraContinuaPage.tsx`, `services/mejora-continua.service.ts`, tarjeta «Mejora continua» en `SistemasDashboardPage.tsx`, entrada en el menú de Sistemas.

## Seguridad: tres llaves, tres papeles
| Quién | Cómo entra | Qué puede |
|---|---|---|
| Persona de Sistemas | Sesión normal, sección `SISTEMAS` (`view` para ver, `write` para decidir) | Ver, aprobar, pedir cambios, rechazar, marcar en curso/hecha, copiar brief |
| Rutinas del lunes y viernes | Cabecera `x-mejora-key` = `MEJORA_CONTINUA_KEY` | Leer memoria, guardar propuestas y cierre, reescribir un plan con cambios pedidos. **No puede aprobar ni rechazar** |
| Sesión interactiva de Claude | Cabecera `x-mejora-decision-key` = `MEJORA_CONTINUA_DECISION_KEY` | Decidir una propuesta («aprueba la 2») y leer su brief. **Esta clave no se le da a ninguna rutina**: así el «human in the loop» no se puede saltar desde una rutina |

Sin la variable configurada el endpoint responde 404 (mismo patrón que `CRON_SECRET`); clave equivocada, 401 (comparación con `timingSafeEqual`).

Las propuestas pertenecen a la empresa `MEJORA_CONTINUA_COMPANY_ID` (la de Gemeseg). Una persona de otra empresa nunca las ve; el super administrador (sin empresa) ve todo. **Sin esa variable las propuestas no tienen empresa**: solo las ve el super admin y no hay aviso en la campana (las notificaciones exigen empresa).

## API
- Pantalla (JWT): `GET /api/admin/mejora-continua`, `GET .../tarjeta`, `POST .../:id/decision` `{accion: APROBAR|PEDIR_CAMBIOS|RECHAZAR|MAS_TARDE, motivo?, comentario?}`, `POST .../:id/progreso` `{estado: EN_CURSO|HECHA, horasAhorradasMes?}`, `GET .../:id/brief`.
- Rutinas (`x-mejora-key`): `GET /api/mejora-continua/memoria`, `POST .../propuestas` (`?dryRun=true` valida sin guardar), `POST .../cierre` (idem), `POST .../propuestas/:id/revision`.
- Sesión de Claude (`x-mejora-decision-key`): `POST .../propuestas/:id/decision`, `GET .../propuestas/:id/brief`.

## Reglas del libro
- Estados: PENDIENTE · PLAN_APROBADO · CAMBIOS_PEDIDOS · RECHAZADA · MAS_TARDE · EN_CURSO · HECHA. El historial de cada propuesta (quién, cuándo, motivo) se guarda en su columna `historial`.
- **Presupuesto semanal**: máximo 2 propuestas aprobadas o en curso a la vez (`LIMITE_APROBADAS_A_LA_VEZ`); aprobar una tercera da un mensaje claro. La memoria le dice al agente cuántos cupos hay libres.
- Rechazar exige motivo; pedir cambios exige comentario; sin **evidencia** (archivo y sección o dato de uso) y sin plan no se acepta una propuesta.
- Una propuesta con el mismo título en la misma semana no se duplica (reintentos de la rutina).
- Los datos de uso real son solo agregados (corridas de agentes, tickets de soporte por tipo/estado y títulos de «mejora» sin resolver, acciones por módulo de la Bitácora); nunca nombres ni contenido de personas.
- Avisos: campana al equipo de Sistemas de la empresa (personas con «Escribir» marcado de forma explícita; sin duplicar el mismo título en 24 h) y correo SOLO a las direcciones de `MEJORA_CONTINUA_CORREO` (separadas por coma). Sin esa variable no sale ningún correo (regla de Leidy: correos reales solo a cuentas que ella designe, p. ej. `test@gemeseg.com`).

## Modelos (verificado 2026-11-11)
Una corrida no cambia su propio modelo a mitad de camino: el modelo se fija al crear la rutina y el «director» reparte el trabajo a subagentes, cada uno con su `model`. Director: Sonnet 5.5; lectura de .md por trozos: Haiku 5.5 (en paralelo); razonamiento e ideas nuevas: Opus 5.5 (una vez); verificación: Sonnet 5.5; resumen del viernes: Haiku/Sonnet; implementar lo aprobado: Opus 5.5 (o Sonnet en cambios chicos). Cada corrida informa `modelosUsados` y queda visible en el informe. Falta confirmar con una corrida de prueba que la rutina de la nube permita subagentes con modelo propio; si no, plan B de tres rutinas encadenadas (ver el prompt del lunes).

## Dónde vive cada memoria (decisión 2026-11-11)
- **La memoria de decisiones** (qué se aprobó, rechazó y por qué) vive en la BASE DE DATOS de la app (`AgentPropuesta`), privada, detrás de sesión o de las claves; NO está en GitHub. Las rutinas la leen por `GET /api/mejora-continua/memoria`.
- **Lo que el agente LEE** (los .md) hoy sale del repo público de GitHub, rama `main`. Sirve para empezar, pero tiene dos límites: lo que está solo en local no se ve (en la primera corrida faltaban `PLAN_AGENTES_IA.md`, el vigilante de RRHH y Operaciones) y todo lo que esté en los .md es público. Si el repo se vuelve privado, la rutina necesita un token de solo lectura. Para clientes (fase 2) los documentos no serán los nuestros, sino sus propios datos y procesos.

## Primera corrida real (2026-11-11, local)
Hecha contra el servidor local con el flujo completo: 3 lectores Haiku en paralelo → 1 Opus que propone → 1 Sonnet que verifica contra los archivos reales → envío. El verificador cazó una afirmación falsa del razonamiento («modelo retirado en producción»: cloudbuild.yaml ya usaba `gemini-3.8-flash`), dos alertas de riesgo mal fundadas, una cita inventada y pasos del plan que hablaban de una pantalla que no existe; se corrigieron antes de guardar. Quedó claro que sin verificación contra los archivos no hay que enviar nada. Confirmado también que una sesión de Claude reparte trabajo a subagentes con modelo propio (haiku, opus, sonnet); falta confirmarlo dentro de una rutina de la nube.

## Estado de la activación (2026-11-11)
**Desplegado en producción** (PR #70, revisión de Cloud Run `mejora-gemeseg-backend-00080-c7h`, respaldo de Cloud SQL `1794416331396` justo antes). Hecho:
1. Secretos `MEJORA_CONTINUA_KEY` y `MEJORA_CONTINUA_DECISION_KEY` creados en Secret Manager (proyecto `mejora-gemeseg`, el servicio de Cloud Run ya tiene `secretAccessor` a nivel de proyecto) y listados en `--set-secrets` de `cloudbuild.yaml`. Los valores están SOLO en Secret Manager y en `C:Usersleidy.claudesecretsmejora-continua.env` (fuera del repo, para las sesiones de Claude de Leidy). Para rotarlas: nueva versión del secreto, redeploy y actualizar el prompt de las dos rutinas (la de rutinas) o el archivo local (la de decisiones).
2. Sin `MEJORA_CONTINUA_COMPANY_ID`: el servidor deduce la empresa (la única con equipo de Sistemas con «Escribir» explícito). Si algún día hay varias, definir esa variable en `cloudbuild.yaml`. `MEJORA_CONTINUA_CORREO=sistemas@gemeseg.com` (en `cloudbuild.yaml`, desde 2026-11-11, autorizado por Leidy): cada propuesta nueva, plan corregido y cierre semanal llega por correo a esa cuenta además de la campana; para sumar direcciones, separarlas con coma. Sin la variable solo avisa en la campana.
3. Dos rutinas de Claude en la nube (entorno «Entorno abierto», sin conectores, modelo Sonnet 5.5, con el repo clonado): **«Mejora continua · propuestas del lunes»** (`trig_018xAWTRFkgEeqoghNLgPkH7`, cron `0 14 * * 1` UTC = lunes 9:00 en Ecuador) y **«Mejora continua · cierre del viernes»** (`trig_01JTeF63JxDFYDtUEwBDGQcJ`, cron `0 22 * * 5` UTC = viernes 17:00). Su prompt es corto y apunta a `.agents/mejora-continua/prompt-lunes.md` / `prompt-viernes.md` del repo (main): mejorar esos archivos cambia el comportamiento sin tocar las rutinas. Se administran en https://claude.ai/code/routines (ahí se pausan o borran; la API no borra).
4. Las 5 propuestas de la primera corrida están anotadas en producción en estado «Más tarde» (Leidy: todavía no se hacen).

## Pendiente / decisiones abiertas
- «Abrir sesión en Claude» desde la pantalla es hoy «Copiar brief» + pegarlo en una sesión nueva; no hay un enlace que abra la sesión solo. Desde una sesión de Claude se puede pedir «abre la sesión para la propuesta N» (lee el brief con la clave de decisiones).
- **Fase 2**: el mismo ciclo dentro de la app con Gemini y Cloud Scheduler propio, como función «Mejora continua» vendible a otras empresas (línea blanca). Qué «lee» el agente de un cliente (su uso y procesos, no nuestros .md) está sin definir.
- No hay pruebas unitarias todavía (se escriben tras el «ok» de Leidy a la pantalla).
- «Lista para quitar» mensual y vigilante de .md desactualizados: el segundo ya va en el prompt (`mdDesactualizados`); la lista mensual de «qué quitar» queda como instrucción a añadir al prompt del primer lunes de cada mes cuando haya algo que quitar.
- Las rutinas leen los .md del repo en GitHub (rama `main`): lo que está sin subir no se ve. Los .md no están dentro de la imagen de Cloud Run (el Dockerfile no los copia).
