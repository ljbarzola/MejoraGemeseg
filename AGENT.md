# Gemeseg Mejora - Guía para agentes

## Propósito
Este documento está pensado para ser consumido por agentes de desarrollo, asistentes de código o herramientas de automatización. Su objetivo es proporcionar contexto técnico claro para entender el proyecto, sus decisiones de arquitectura y las prioridades de implementación.

## Contexto del proyecto
Proyecto orientado a modernizar Gemeseg mediante una plataforma web escalable, segura y preparada para incorporar inteligencia artificial en una segunda fase.

## Objetivo general
Construir una solución modular para gestionar operaciones corporativas, usuarios, roles, contratos y auditorías, con una arquitectura preparada para crecimiento y evolución.

## Arquitectura recomendada

### Frontend
- Framework: React
- Herramienta de desarrollo: Vite
- Gestión de estado:
  - React Query (TanStack) para peticiones y caché
  - Zustand para estado global
- Estilos:
  - CSS puro con variables si se requiere control corporativo estricto
  - Tailwind CSS si se prioriza rapidez en el desarrollo de interfaces

### Backend
Elegir una de estas dos opciones según el alcance previsto para IA:

- Opción A - Corporativa:
  - NestJS + TypeScript + Prisma
  - Recomendado para sistemas empresariales, seguridad y mantenibilidad

- Opción B - IA:
  - FastAPI + Python
  - Recomendado para agentes de IA y procesamiento complejo de documentos

### Base de datos e infraestructura
- PostgreSQL como base de datos relacional principal
- Google Cloud Platform (GCP) como plataforma de despliegue
- Cloud Run para aplicaciones frontend y backend
- Cloud SQL para base de datos gestionada y segura

## Reglas de implementación sugeridas
- Priorizar una arquitectura limpia y modular.
- Mantener separación clara entre frontend, backend y datos.
- Favorecer buenas prácticas de seguridad y auditoría.
- Diseñar el modelo de datos para soportar relaciones entre empleados, roles, contratos y auditorías.
- Preparar la solución para integrar agentes de IA en una segunda fase sin reestructurar por completo el sistema.

## Entregables esperados
- Estructura base del frontend
- Estructura base del backend
- Modelo de datos inicial en PostgreSQL
- Configuración básica de despliegue en GCP
- Documentación de decisiones técnicas

## Notas para agentes
- Si el usuario pide crear la arquitectura, priorizar una solución escalable y bien documentada.
- Si el usuario solicita implementar funcionalidades, mantener el enfoque en una base técnica coherente con esta propuesta.
- Si aparece una decisión entre backend corporativo y backend IA, preguntar cuál es la prioridad antes de tomar una decisión definitiva.
- No introducir tecnologías que contradigan esta propuesta sin justificarlo.

## Resumen corto
Este proyecto está planteado como una solución moderna, segura y preparada para IA, con React/Vite en el frontend, una opción de backend según el peso de la IA, PostgreSQL como base de datos y GCP como infraestructura principal.
