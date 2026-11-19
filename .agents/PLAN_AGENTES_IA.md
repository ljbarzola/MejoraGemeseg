# Plan de agentes e IA

Qué agentes existen, qué dolores reales tiene la empresa y qué agentes construir después. Detalle técnico de cada agente: `.agents/modules/agents-ai.md`. Repo público: sin nombres de personas ni credenciales.

**Regla de fondo:** automatizar al máximo; una persona solo decide lo importante. Antes de construir algo con costo o riesgo: ventajas, desventajas y precio.

## 1. Qué hay hoy
| Agente | Qué hace | ¿Trabaja solo? |
|---|---|---|
| Agente Gemeseg (chat) | Explica la plataforma; conteos simples | No, responde |
| Agente de Ventas (chat) | Investiga un cliente, plan del día, inactivos a recuperar | No, responde |
| Agente de Cacao y de Custodia (chat) | Explican su flujo y consultan datos de la empresa (consultas curadas, no SQL libre) | No, responden |
| Agente de Operaciones (chat) | Pregunta por los pendientes de Operaciones; solo lectura | No, responde |
| Revisor de Bitácoras (trabajador) | Lee la foto de la hoja del guardia; el sistema la compara con el horario | A medias: lo dispara quien sube la foto |
| Revisor de entregas (Contratación Pública) | Mira firma/sello y vigencia y propone el motivo de rechazo | A medias: lo dispara la entrega |
| Revisor de documentos de RRHH / «Leer con IA» | Propone qué documento va en qué página y lee fechas de vencimiento | No, lo dispara una persona |
| Bot de WhatsApp de Ventas | Atiende a posibles clientes y clientes en modo copiloto (ver `whatsapp-bot.md`) | Con aprobación humana en respuestas con precios |

Motor: Google Vertex AI con Gemini 3.x. La IA es sobre todo **reactiva**: casi ningún agente se despierta solo para detectar algo y avisar; Cacao, Custodias, Tareas y Contratación Pública tienen poca IA y la vigilancia sigue siendo manual. Parte de lo construido necesita que se cree su job en Cloud Scheduler.

## 2. Dolores reales (levantamiento de procesos)
Se repiten cuatro puntos:
1. **Datos en silos copiados a mano:** Isyplus (guardias, nómina, facturación), Sage; IESS, SUT y SICOSEP sin API pública.
2. **Las novedades llegan por chat o Excel** y alguien las pasa a una hoja para calcular KPIs.
3. **Nadie vigila los vencimientos:** antecedentes penales cada 3 meses, documentos ante SRI, IESS y Supercías, certificaciones, pólizas.
4. **Se cotiza sin lista de precios ni stock actualizados.**

Por área: **Contabilidad** (reporte mensual a Gerencia de 11 pasos copiando de Isyplus; préstamos del IESS a mano); **Cobranza** (débitos bancarios de inicio de mes, llamar a rezagados, facturación incompleta); **Operaciones** (KPIs leyendo chats de supervisores, informe de novedades manual, geolocalización sin integrar); **Contratación Pública** (bitácoras con errores de fecha y firma, informes lentos, control de armas y municiones, vigencia de documentos); **RRHH** (verificar a cada guardia en 4 plataformas, pólizas, salida de personal); **Gerencia** (órdenes de Sage revisadas una por una, bases técnicas de Sercop leídas a mano).

No existen en la app: nómina, cobranza y débitos, reporte gerencial, KPIs y novedades de Operaciones, seguimiento de obra, lector de bases de Sercop.

**Idea clave:** muchos dolores **no necesitan un LLM**. Cruzar débitos contra la cartera es comparar con reglas fijas y un vigilante de vencimientos es un job diario. La IA aporta donde hay texto o imágenes desordenados.

## 3. Candidatos a agente
Tipos: **IA** (modelo de lenguaje), **Reglas** (código determinista), **Job** (tarea diaria de Cloud Scheduler). Los precios de Gemini no están verificados.

| # | Agente | Tipo | Qué resuelve | Depende de | Estado |
|---|---|---|---|---|---|
| 1 | Vigilante de vencimientos (RRHH) | Job, sin IA | Documentos que vencen sin aviso; avisa a RRHH por la campana (el correo al guardia es manual) | «Cumplimiento» y notificaciones; job de Scheduler | Construido; falta el job |
| 2 | Revisor de entregas (Contratación Pública) | IA | Documentos que vuelven mal; revisión lenta | Patrón de Bitácoras | Construido; falta calibrar con documentos reales |
| 3 | Lector de bases técnicas de Sercop | IA | Saca características y sugiere equipos y marcas | Catálogo de marcas; revisión humana | Después |
| 4 | Plan del día automático (Ventas) | Job + IA | El plan que calcula el Agente de Ventas llega solo cada mañana | Job de Scheduler | Construido; falta el job |
| 5 | Vigilante de entregas (Contratación Pública) | Job | Entregas atrasadas y horarios sin aprobar | Job `entregas-cron/recordatorios` | Construido; falta el job |
| 6 | Borrador del informe mensual | IA | Junta horario, bitácoras y entregas aprobadas | 1, 2 y Bitácoras confiables | Después |
| 7 | Novedades y KPIs desde chats de supervisores | IA | Quita la copia manual de chats | Respuestas de Operaciones; formato fijo; decisión sobre WhatsApp | En espera |
| 8 | Reporte gerencial mensual | Reglas + algo de IA | Los 11 pasos de copiar de Isyplus | Cómo exporta Isyplus | En espera |
| 9 | Cruce de débitos bancarios | Reglas | Lista de rezagados sin trabajo manual | Formato de los archivos de cada banco | En espera |
| 10 | Avisos de Custodias y Cacao | Job | Viajes sin cerrar, nómina con huecos, lotes abiertos, cuentas vencidas | Definir umbrales | Después |
| 11 | Inventario con kardex, municiones y armas | Reglas | Entradas, entregas, bajas, saldo, mínimos y permisos | Movimientos registrados por una persona | Construido; falta que Operaciones confirme qué se controla |
| 12 | Llamadas nativas a herramientas (motor) | Técnico | Que los agentes encadenen consultas | — | Aplazado |
| 13 | Reemplazo sugerido ante una falta | Reglas | Propone quién del contrato tenía descanso o sin turno | Horario aprobado | Construido |
| 14 | Aviso de bitácoras con errores | Reglas | Avisa por la campana a quien escribe en Operaciones | Permiso en Operaciones | Construido |
| 15 | Parte del turno (el guardia escribe o dicta) | IA | Reemplaza el informe de novedades manual | Quién lo llena y por qué canal | En espera |
| 16 | Horas cubiertas contra contrato y factura | Reglas | Facturación incompleta de inicio de mes | Cómo exporta Isyplus | En espera |
| 17 | Rondas y supervisión verificadas (QR o GPS) | Reglas | Comprobar que la ronda se hizo | Qué se usa hoy | En espera |
| 18 | «Hoy en los puestos» (Resumen de Operaciones) | Reglas | Quién debe estar hoy, cobertura y bitácoras sin subir | Horarios y bitácoras | Construido |
| 19 | Resumen diario y Agente de Operaciones | Job + reglas | Pendientes de Operaciones por notificación y chat, solo lectura | Job `operaciones/resumen-cron`; avisos de Mi perfil | Construido; falta el job |

**Medición de referencia (Revisor de Bitácoras, `gemini-3.8-flash`):** ~2.000 tokens de entrada, ~1.400 de salida, 10-17 s por lectura. Leyó mal el año y los nombres: calibrar con 5-10 hojas reales antes de confiar en él.

## 4. Orden recomendado
0. Calibrar el Revisor de Bitácoras con hojas reales.
1. Vigilante de vencimientos (sin IA).
2. Revisor de entregas.
3. Encender los jobs ya construidos uno por uno, con OK de la usuaria (algunos mandan correos reales).
4. Lector de bases técnicas de Sercop.
5. Borrador del informe mensual.
6. Con las respuestas de Operaciones e Isyplus: novedades y KPIs, reporte gerencial, débitos.

**No empezar por:** un chat con preguntas libres a la base (texto a SQL acierta poco; se usan consultas curadas); WhatsApp para leer chats internos (la IA lee mal chats sin formato fijo); nada con datos personales hacia servicios externos sin revisar la ley de protección de datos.

## 5. Decisiones vigentes
- Los agentes que trabajan solos viven en Sistemas → Agentes, sin chat, y dejan su actividad en `AgentRun` (qué hace cada uno: `DOCUMENTACION_AGENTES`).
- **El agente lee; el sistema juzga:** el modelo transcribe o resume; la comparación o decisión es código fijo y repetible.
- Las acciones que mandan correo real, borran o aprueban las decide una persona.
- WhatsApp: el bot atiende a clientes y posibles clientes con Meta directo en modo copiloto; no se usa para leer chats internos de supervisores.
- No se adoptó el piloto de «Grok Bot» propuesto en un informe de Sistemas (sin datos de personal ni credenciales del Estado).

## 6. Pendientes y preguntas abiertas
- **Operaciones:** cuántos grupos de chat usan, cuántas novedades hay por día, hoja de supervisión, hoja de ruta, KPIs actuales y qué se usa de Vigicontrol.
- **Isyplus:** cómo exporta ventas, compras, nómina y débitos.
- **Privacidad:** si los chats incluyen cédulas o direcciones, decidir si pueden salir a un servicio externo de IA.
- Confirmar tarifa de Gemini 3.x y la residencia de datos del endpoint `global`.
- Decidir qué avisos son solo notificación y cuáles piden acción de una persona.

## 7. Cómo agregar un agente trabajador (receta, `agents-ai.md` punto 5)
1. Su `scope` va en `SCOPES_SIN_CHAT` (`agents/agent-trabajadores.const.ts`).
2. Su entrada en `DOCUMENTACION_AGENTES` (qué recibe, qué hace, quién decide, qué no hace, límites).
3. Su siembra en `AgentRunService` (sin pisar un agente existente).
4. Cada trabajo se registra con `registrar()`.
5. `Agent.instructions` guarda solo lo propio de la empresa; las reglas que evitan inventar van en código.
