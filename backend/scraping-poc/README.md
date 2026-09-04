# Spike Sprint 2 — Viabilidad de scraping SICOSEP / SUT

**Decisión: NO viable automatizar la verificación por scraping en este momento.**

## Evidencia (reproducible: `node run.js`, sin dependencias, Node 18+)

### SICOSEP (`sicosep.ministeriodelinterior.gob.ec`)
- El home responde ~965 bytes con página de **bloqueo Incapsula/Imperva** (WAF en el borde): el HTTP automatizado no llega al portal real.
- El flujo ciudadano documentado exige **código de seguridad (captcha)** + clic en Buscar.
- El dominio antiguo (`ministeriodegobierno`) ya no resuelve (ENOTFOUND).
- Conclusión: ni siquiera con headless browser sería estable (anti-bot + captcha + servidores inestables).

### SUT (`sut.trabajo.gob.ec`)
- Portal **JSF con login**: la consulta individual exige credenciales de empleador. No hay formulario público por cédula.
- Vía CKAN (`datosabiertos.gob.ec`, API pública, sin scraping): el CSV de contratos vigentes publica **conteos agregados** (`genero;provincia;tipoContrato;actividad;cantidad`), **sin filas por cédula**. Sirve para estadística, no para verificar a una persona.

## Recomendación (para Sprint 3+)
Modelo **"alerta + verificación asistida"** en lugar de scraping:
1. Estado por candidato/documento: `no verificado en plataforma X` (alerta, no bloqueo).
2. Deep-links oficiales + guía corta para que RRHH complete la consulta manual (captcha incluido).
3. Registrar resultado + fecha + responsable en el checklist de cumplimiento (trazabilidad, como pide Sprint 3).
4. Reevaluar si el gobierno publica API o se firma convenio de interoperabilidad.

## Aislamiento
Esta carpeta **no** es parte del backend Nest: nada la importa, no toca la DB, no usa credenciales. Riesgo cero para el sistema principal.
