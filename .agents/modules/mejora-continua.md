# Mejora continua (agente de agentes) — Sistemas

Pantalla: Sistemas → Mejora continua (`/sistemas/mejora-continua`, sección `SISTEMAS`).

## Qué es
Ciclo semanal para acercar la plataforma a «un Grok que aprende» sin reentrenar modelos:
- **Lunes 9:00 (Guayaquil):** una rutina de Claude lee los .md del repo, la memoria de decisiones y datos AGREGADOS de uso real, y deja de 3 a 5 propuestas (al menos 2 de «automatizar lo actual» y al menos 1 «idea nueva»).
- **Leidy decide** en la pantalla (o desde una sesión de Claude): Aprobar plan · Pedir cambios (el agente reescribe el plan) · Rechazar (motivo obligatorio) · Más tarde.
- **Plan aprobado:** «Copiar brief para Claude» y abrir una sesión nueva; se trabaja en rama propia, sin commit/push hasta que ella pruebe y diga «ok».
- **Viernes 17:00:** otra rutina cierra la semana: mejorado / faltó / rechazado (con motivos) / aprendido / horas ahorradas estimadas / foco del lunes.
- «Human in the loop»: nada pasa de propuesta a trabajo sin que ella apruebe el plan; merge, deploy, correo real y borrados siguen siendo suyos. Lo rechazado (con motivo) no se repite sin contexto nuevo y lo aprobado orienta lo siguiente.

## Dónde vive cada cosa
- **El «cerebro»** está fuera de la app, en rutinas de Claude en la nube (modelo Sonnet 5.5, repo clonado, sin conectores). Su prompt es corto y apunta a `.agents/mejora-continua/prompt-lunes.md` y `prompt-viernes.md` (rama `main`): mejorar esos archivos cambia el comportamiento sin tocar las rutinas. Se administran en claude.ai/code/routines (crons en UTC: lunes `0 14 * * 1`, viernes `0 22 * * 5`). La app solo guarda el libro, avisa y muestra.
- **Backend** (`backend/src/modules/agents/mejora-continua/`): `mejora-continua.service.ts` (libro, reglas, avisos), `.controller.ts` (dos controladores), `.util.ts` (semana ISO de Ecuador, validación de propuestas, brief), `.schema.ts` (DDL).
- **Tablas** `AgentPropuesta` (libro) y `AgentMejoraInforme` (notas del lunes y cierre del viernes), creadas al arrancar, SIN modelo en `schema.prisma` (SQL parametrizado). Cada corrida queda en `AgentRun` (agente «Agente de Mejora Continua», acciones `PROPONER_MEJORAS` y `CIERRE_SEMANAL`).
- **Frontend:** `pages/sistemas/MejoraContinuaPage.tsx`, `services/mejora-continua.service.ts`, tarjeta en `SistemasDashboardPage.tsx`, entrada en el menú de Sistemas.

## Seguridad: tres llaves, tres papeles
| Quién | Cómo entra | Qué puede |
|---|---|---|
| Persona de Sistemas | Sesión normal, sección `SISTEMAS` (`view` ver, `write` decidir) | Ver, aprobar, pedir cambios, rechazar, marcar en curso/hecha, copiar brief |
| Rutinas lunes y viernes | Cabecera `x-mejora-key` = `MEJORA_CONTINUA_KEY` | Leer memoria, guardar propuestas y cierre, reescribir un plan. **No puede aprobar ni rechazar** |
| Sesión interactiva de Claude | Cabecera `x-mejora-decision-key` = `MEJORA_CONTINUA_DECISION_KEY` | Decidir una propuesta y leer su brief. **Esta clave no se le da a ninguna rutina**, para que el «human in the loop» no se salte |

- Sin la variable el endpoint responde 404 (mismo patrón que `CRON_SECRET`); clave equivocada, 401 (`timingSafeEqual`).
- Las claves viven solo en Secret Manager (listadas en `--set-secrets` de `cloudbuild.yaml`) y en un archivo local fuera del repo; nunca en el repo. Rotar: nueva versión del secreto, redeploy y actualizar el prompt de las rutinas / el archivo local.
- Las propuestas pertenecen a la empresa `MEJORA_CONTINUA_COMPANY_ID`; sin la variable el servidor deduce la empresa (la única con equipo de Sistemas con «Escribir» explícito; si hay varias, definirla en `cloudbuild.yaml`). Otra empresa nunca las ve; el super admin ve todo. **Sin empresa** solo las ve el super admin y no hay aviso en la campana (las notificaciones exigen empresa).

## API
- Pantalla (JWT): `GET /api/admin/mejora-continua`, `GET .../tarjeta`, `POST .../:id/decision` `{accion: APROBAR|PEDIR_CAMBIOS|RECHAZAR|MAS_TARDE, motivo?, comentario?}`, `POST .../:id/progreso` `{estado: EN_CURSO|HECHA, horasAhorradasMes?}`, `GET .../:id/brief`.
- Rutinas (`x-mejora-key`): `GET /api/mejora-continua/memoria`, `POST .../propuestas` (`?dryRun=true` valida sin guardar), `POST .../cierre` (idem), `POST .../propuestas/:id/revision`.
- Sesión de Claude (`x-mejora-decision-key`): `POST .../propuestas/:id/decision`, `GET .../propuestas/:id/brief`.

## Reglas del libro
- Estados: PENDIENTE · PLAN_APROBADO · CAMBIOS_PEDIDOS · RECHAZADA · MAS_TARDE · EN_CURSO · HECHA. El historial (quién, cuándo, motivo) va en la columna `historial`.
- Presupuesto: máximo 2 propuestas aprobadas o en curso a la vez (`LIMITE_APROBADAS_A_LA_VEZ`); aprobar una tercera da mensaje claro. La memoria informa los cupos libres.
- Rechazar exige motivo; pedir cambios exige comentario; sin **evidencia** (archivo y sección, o dato de uso) y sin plan no se acepta una propuesta.
- Mismo título en la misma semana no se duplica (reintentos de la rutina).
- Datos de uso solo agregados (corridas de agentes, tickets de soporte por tipo/estado y títulos de «mejora» sin resolver, acciones por módulo de la Bitácora); nunca nombres ni contenido de personas.
- Avisos: campana al equipo de Sistemas de la empresa (personas con «Escribir» explícito; sin duplicar el título en 24 h) y correo SOLO a las direcciones de `MEJORA_CONTINUA_CORREO` (separadas por coma; la cuenta de Sistemas está en `cloudbuild.yaml`). Sin la variable no sale correo (correos reales solo a cuentas que Leidy designe).

## Modelos
El modelo de una corrida se fija al crear la rutina; el «director» reparte a subagentes, cada uno con su `model`: director Sonnet 5.5; lectura de .md por trozos Haiku 5.5 (en paralelo); razonamiento e ideas nuevas Opus 5.5 (una vez); verificación Sonnet 5.5; resumen del viernes Haiku/Sonnet; implementar lo aprobado Opus 5.5 (Sonnet en cambios chicos). Cada corrida informa `modelosUsados`. Sin confirmar que la rutina en la nube permita subagentes con modelo propio; si no, plan B de tres rutinas encadenadas (ver el prompt del lunes).

## Memoria y lectura
- **Memoria de decisiones** (aprobado, rechazado y por qué): en la BASE DE DATOS (`AgentPropuesta`), privada, tras sesión o claves; NO en GitHub. Las rutinas la leen por `GET /api/mejora-continua/memoria`.
- **Lo que el agente LEE** (los .md) sale del repo público de GitHub, rama `main`: lo no subido no se ve, los .md no están en la imagen de Cloud Run (el Dockerfile no los copia) y todo lo escrito en ellos es público. Si el repo pasa a privado, la rutina necesita un token de solo lectura.
- **Verificación obligatoria:** una corrida sin verificar contra los archivos reales no envía nada (el verificador cazó afirmaciones falsas, citas inventadas y pasos sobre pantallas inexistentes).

## Pendiente / decisiones abiertas
- «Abrir sesión en Claude» desde la pantalla es «Copiar brief» + pegar en una sesión nueva; desde una sesión se puede pedir «abre la sesión para la propuesta N» (lee el brief con la clave de decisiones).
- Fase 2: el mismo ciclo dentro de la app con Gemini y Cloud Scheduler propio, como función vendible a otras empresas (línea blanca); qué «lee» el agente de un cliente está sin definir.
- Sin pruebas unitarias.
- «Lista para quitar» mensual: instrucción por añadir al prompt del primer lunes de cada mes; el vigilante de .md desactualizados ya va en el prompt (`mdDesactualizados`).
