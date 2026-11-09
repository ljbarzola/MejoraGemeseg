# Plan de agentes e IA para Gemeseg

Documento vivo. Reúne qué agentes existen, qué dolores reales tiene la empresa y qué agentes conviene construir y en qué orden. Última actualización: **2026-10-30**.

**Orígenes:** conversación del 2026-10-23 (análisis de la IA existente y del levantamiento de procesos por persona exportado de Notion), recorrido de Contratación Pública del 2026-10-30, y los informes de Sistemas «Optimización Operativa» (agosto 2026) y «Grok Bot para Gemeseg» (2026-10-23), que viven fuera del repositorio.

**Regla de fondo (de la usuaria):** automatizar al máximo; una persona solo decide lo importante. Y antes de construir algo con costo o riesgo: ventajas, desventajas y precio.

> Este archivo no lleva nombres de personas ni credenciales: el repositorio es público.

---

## 1. Qué hay hoy

| Agente | Qué hace | ¿Trabaja solo? |
|---|---|---|
| Agente Gemeseg (chat) | Explica cómo usar la plataforma; conteos simples | No, solo responde |
| Agente de Ventas (chat) | Investiga un cliente, plan del día, inactivos a recuperar | No, solo responde |
| Revisor de Bitácoras (trabajador) | Lee la foto de la hoja del guardia; el sistema la compara con el horario | A medias: lo dispara quien sube la foto |
| Revisor de documentos de RRHH y «Leer con IA» | Propone qué documento va en qué página y lee fechas de vencimiento | No, lo dispara una persona |

Detalle técnico de cada uno: `.agents/modules/agents-ai.md`. Motor: Google Vertex AI con Gemini 3.x (`cloudbuild.yaml` ya apunta a 3.x; el modelo 2.5 se retiró el 2026-10-20).

**Diagnóstico (2026-10-23):** la IA de la plataforma es **reactiva en todo**: ningún agente se despierta solo para detectar algo y avisar. El esfuerzo está concentrado en Ventas y RRHH; Cacao, Custodias, Tareas y Contratación Pública casi no tienen IA. La vigilancia sigue siendo manual. Parte de la automatización construida está apagada o falta crear su job en Cloud Scheduler (ver «Pendientes» de `AGENTS.md`; no verificado contra Cloud Scheduler).

## 2. Los dolores reales de la empresa (levantamiento de procesos)

Casi todo se repite en cuatro puntos:
1. **Datos en silos copiados a mano:** Isyplus (guardias, nómina, facturación) y Sage (monitoreo y tecnología); IESS, SUT y SICOSEP sin API pública.
2. **Las novedades llegan por chat o Excel** y alguien las pasa a una hoja para calcular KPIs.
3. **Nadie vigila los vencimientos:** antecedentes penales cada 3 meses, documentos ante SRI, IESS y Supercías, certificaciones ISO y BASC, pólizas.
4. **Se cotiza sin lista de precios ni stock actualizados.**

Por área (lo que más tiempo consume):
- **Contabilidad:** reporte mensual a Gerencia de 11 pasos copiando de Isyplus y de anexos Excel; préstamos del IESS metidos a mano en la nómina.
- **Cobranza:** débitos del Banco de Loja (1,5 a 2 h cada inicio de mes) y de Machala; llamar a rezagados; depósitos registrados tarde; facturación de inicio de mes incompleta.
- **Operaciones:** KPIs leyendo chats de supervisores; informe de novedades manual; Vigicontrol sin usar; Softguard con geolocalización sin integrar; inventario de uniformes e implementos sin herramienta.
- **Contratación Pública:** de los horarios salen bitácoras e informes; bitácoras con errores de fecha y firma; informes y oficios que tardan; control de armas y municiones; vigencia de documentos.
- **RRHH:** verificar a cada guardia en 4 plataformas (el IESS multa si se ingresa tarde); pólizas (fechas de nacimiento a mano); salida de personal.
- **Gerencia:** órdenes de Sage revisadas factura por factura; bases técnicas de Sercop leídas con ChatGPT gratis (límite de 2 PDF).

Cobertura de la app (documentación, no auditoría del código): hay RRHH documentos y reclutamiento, Bitácoras con IA, Horarios, Cotizador, CRM de Ventas y tickets de Sistemas. **No hay:** nómina, contabilidad, cobranza y débitos, reporte gerencial, KPIs y novedades de Operaciones, inventario y municiones, seguimiento de obra, lector de bases técnicas de Sercop, vigilante de vencimientos.

**Idea clave:** muchos de estos dolores **no necesitan un LLM**. Cruzar el archivo de débitos contra la cartera es una comparación con reglas fijas, y un vigilante de vencimientos es un job diario. La IA aporta donde hay texto o imágenes desordenados.

## 3. Candidatos a agente

Tipos: **IA** (modelo de lenguaje), **Reglas** (código determinista), **Job** (tarea diaria de Cloud Scheduler). Los precios de Gemini **no están verificados**; las magnitudes salen de los tokens medidos.

| # | Agente | Tipo | Qué resuelve | Depende de | Estado |
|---|---|---|---|---|---|
| 1 | Vigilante de vencimientos (RRHH y documentos legales) | Job, sin IA | Antecedentes cada 3 meses, reentrenamientos, documentos que vencen sin aviso. Avisa **a RRHH por la campana**; el correo al guardia sigue siendo manual y uno por uno (decisión de RRHH del 2026-09-09, ver `recursos-humanos.md`) | Reutiliza «Cumplimiento» (semáforo y anticipación por requisito) y las notificaciones; crear un job de Cloud Scheduler (pedir OK) | **Construido en local (2026-10-30), sin desplegar**; falta crear el job diario (pedir OK). Detalle: `recursos-humanos.md`, «Vigilante de vencimientos» |
| 2 | Revisor de documentos de entregas (Contratación Pública) | IA | Documentos que vuelven mal y revisión lenta en «Por aprobar» | Mismo patrón de Bitácoras | Recomendado ya (2026-10-30) |
| 3 | Lector de bases técnicas de Sercop | IA | Reemplaza ChatGPT gratis; saca características y sugiere equipos y marcas | Catálogo de marcas; revisión humana | Alternativa visible |
| 4 | Plan del día automático (Ventas) | Job + IA | Lo que ya calcula el Agente de Ventas llega solo cada mañana | Crear el job (pedir OK) | Construido, falta job |
| 5 | Vigilante de entregas (Contratación Pública) | Job | Entregas atrasadas y horarios sin aprobar, con escalado | Crear el job `entregas-cron/recordatorios` | Construido, falta job |
| 6 | Borrador del informe mensual | IA | Junta horario aprobado, bitácoras y entregas aprobadas en el informe | Que 1, 2 y Bitácoras sean confiables; reactivar Informes (hoy oculto) | Después |
| 7 | Novedades y KPIs desde chats de supervisores | IA | Quita la copia manual de chats a hojas | Respuestas de Operaciones; formato fijo de novedad; decisión sobre WhatsApp | En espera |
| 8 | Reporte gerencial mensual | Reglas + algo de IA | Los 11 pasos de copiar de Isyplus | Cómo exporta Isyplus | En espera |
| 9 | Cruce de débitos Loja y Machala | Reglas | Lista de rezagados sin 1,5 a 2 h de trabajo manual | Formato de los archivos de cada banco | En espera |
| 10 | Avisos de Custodias y Cacao | Job | Viajes que no cierran, nómina con huecos, lotes abiertos, cuentas por cobrar vencidas | Definir umbrales | Después |
| 11 | Inventario con kardex y control de municiones y armas | Reglas | Entradas, entregas, devoluciones, bajas, saldo, mínimos y permisos de armas | Movimientos que registra una persona | **Construido en local (2026-11-06)**, sin desplegar; falta que Operaciones confirme qué se controla |
| 12 | Mejora del motor (llamadas nativas a herramientas) | Técnico | Que los agentes encadenen consultas | Aplazado | Pendiente |
| 13 | Reemplazo sugerido ante una falta (Operaciones) | Reglas | Cuando la bitácora dice «no aparece», propone quién del contrato tenía descanso o ningún turno | Horario aprobado del contrato | **Construido en local (2026-11-05)**, sin desplegar |
| 14 | Aviso por la campana de bitácoras con errores (Operaciones) | Reglas | Que nadie tenga que abrir la lista para enterarse | Permiso de escribir en Operaciones | **Construido en local (2026-11-05)**, sin desplegar |
| 18 | «Hoy en los puestos» en el Resumen de Operaciones | Reglas | Quién debe estar hoy, cobertura mínima y bitácoras sin subir de la última semana | Horarios aprobados y bitácoras | **Construido en local (2026-11-05)**, sin desplegar |
| 15 | Parte del turno (el guardia escribe o dicta y la IA lo ordena por categorías) | IA | Reemplaza el informe de novedades manual | Quién lo llena y por qué canal (preguntas de Operaciones) | En espera |
| 16 | Horas cubiertas contra contrato y factura | Reglas | La facturación incompleta de inicio de mes | Cómo exporta Isyplus la facturación | En espera |
| 17 | Rondas y supervisión verificadas (QR o GPS) | Reglas | Comprobar que la ronda se hizo | Qué se hace hoy con Softguard y Vigicontrol | En espera |

### Ventajas, desventajas y precio de los dos primeros

**1. Vigilante de vencimientos.** *Ventajas:* sin riesgo de que la IA se equivoque; cierra una fase que RRHH ya pidió. *Desventajas:* avisos solo por campana y correo (WhatsApp descartado); si avisa demasiado, la gente lo ignora; necesita fechas cargadas. *Precio:* prácticamente cero.

**2. Revisor de documentos de entregas.** Flujo: en «Por entregar» alguien sube un documento; el agente lo lee y comprueba si es el pedido, si está vigente, legible y firmado; en «Por aprobar» aparece como «Parece correcto» o «Revisar: motivo»; una persona aprueba o rechaza. *Ventajas:* mismo patrón que Bitácoras, rápido de construir; ataca «documentos que vuelven mal» y «revisar es lento». *Desventajas:* puede dar falsa seguridad, por eso solo sugiere; documentos muy variados. *Precio:* una llamada por documento, magnitud similar a una bitácora; tarifa sin verificar.

### Medición real (2026-10-30, lectura de una bitácora)
Con `gemini-3.8-flash`: unos 2.000 tokens de entrada, 1.300 a 1.450 de salida, 10 a 17 segundos por lectura (foto de prueba pequeña; una foto real pesa más). El agente leyó mal el año (2024) y los nombres: **hay que calibrarlo con 5 a 10 hojas reales antes de confiar en él**.

## 4. Orden recomendado

0. **Calibrar el Revisor de Bitácoras** con hojas reales.
1. **Vigilante de vencimientos** (sin IA).
2. **Revisor de documentos de entregas.**
3. Encender los jobs ya construidos (plan del día de Ventas, entregas de Contratación Pública), uno por uno y con OK de la usuaria, porque algunos mandan correos reales.
4. Lector de bases técnicas de Sercop.
5. Borrador del informe mensual.
6. Cuando lleguen las respuestas de Operaciones e Isyplus: novedades y KPIs, reporte gerencial y débitos.

**No empezar por:** un chat que consulte la base con preguntas libres (el texto a SQL acierta poco en esquemas reales; se usan consultas curadas); nada con WhatsApp (requiere cuenta aprobada por Meta, costo sin verificar, y la IA lee mal chats sin formato fijo); nada con datos personales hacia servicios externos sin revisar la ley de protección de datos.

## 5. Decisiones tomadas
- Los agentes que trabajan solos viven en el catálogo de Sistemas → Agentes, sin chat, y dejan su actividad en `AgentRun` (qué hace cada uno: `DOCUMENTACION_AGENTES`).
- **El agente lee; el sistema juzga:** el modelo transcribe o resume, y la comparación o la decisión son código fijo y repetible.
- Las acciones que mandan correo real, borran o aprueban las decide una persona.
- WhatsApp sigue descartado por ahora.
- El informe de Grok Bot recomienda solo un piloto pequeño (desde USD 30 al mes), sin datos del personal ni credenciales del Estado. No se adoptó.

## 6. Pendientes y preguntas abiertas
- **Operaciones** (desde 2026-11-05 es un módulo propio, ver `.agents/modules/operaciones.md`; lista de 20 preguntas ya preparada; las prioritarias son cuántos grupos de chat usan, cuántas novedades hay por día, la hoja de supervisión, la hoja de ruta, los KPIs actuales y qué pasó con Vigicontrol).
- **Isyplus:** cómo exporta ventas, compras, nómina y débitos.
- **Privacidad:** si los chats incluyen cédulas o direcciones, decidir si pueden salir a un servicio externo de IA.
- Confirmar la tarifa actual de Gemini 3.x y la residencia de datos del endpoint `global` (no verificadas).
- Decidir qué avisos son solo notificación y cuáles piden acción de una persona.

## 7. Cómo agregar un agente trabajador (receta, de `agents-ai.md` punto 5)
1. Su `scope` va en `SCOPES_SIN_CHAT` (`agents/agent-trabajadores.const.ts`).
2. Su entrada en `DOCUMENTACION_AGENTES` (qué recibe, qué hace, quién decide, qué no hace, límites).
3. Su siembra en `AgentRunService` (sin pisar un agente existente).
4. Cada trabajo se registra con `registrar()`.
5. `Agent.instructions` guarda solo lo propio de la empresa; las reglas que evitan inventar van en código.
