# Gemeseg Mejora

## Propósito del proyecto
Este documento presenta la propuesta de arquitectura y dirección técnica para modernizar Gemeseg mediante una solución web escalable, segura y preparada para incorporar inteligencia artificial en una segunda fase.

## ¿Para quién está pensado?
Este README está orientado a personas interesadas en entender la visión del proyecto, las decisiones técnicas principales y la ruta propuesta de implementación.

## Visión general
La idea es construir una plataforma modular para gestionar procesos corporativos, usuarios, roles, contratos y auditorías, con una base tecnológica preparada para crecer y evolucionar.

## Propuesta técnica

### Frontend
- React con Vite para un desarrollo rápido, moderno y eficiente.
- React Query (TanStack) para gestionar caché y peticiones de datos.
- Zustand para manejar estado global de forma simple.
- Estilos con CSS puro y variables para control corporativo, o Tailwind CSS si se prioriza velocidad de desarrollo.

### Backend
Se propone una decisión según la importancia de la IA en la Fase 2:

- Opción A: NestJS + TypeScript + Prisma
  - Ideal para entornos empresariales.
  - Favorece arquitecturas limpias, mantenibles y seguras.

- Opción B: FastAPI + Python
  - Mejor para desarrollar agentes de IA rápidamente.
  - Adecuado para trabajo con documentos complejos y servicios de Model Garden.

### Base de datos e infraestructura
- PostgreSQL como base de datos principal.
- Google Cloud Platform (GCP) como plataforma de despliegue.
- Cloud Run para alojar frontend y backend.
- Cloud SQL para la administración segura de la base de datos.

## Principios de diseño
- Escalabilidad
- Seguridad
- Mantenibilidad
- Preparación para IA
- Integración simple con servicios cloud

## Fase inicial recomendada
1. Definir el alcance funcional del sistema.
2. Elegir entre la opción A o B del backend según la relevancia de la IA.
3. Crear la estructura base del frontend y backend.
4. Diseñar el modelo de datos en PostgreSQL.
5. Preparar la infraestructura en GCP.

## Resumen ejecutivo
La propuesta combina una arquitectura moderna para la interfaz, un backend flexible según el nivel de inteligencia artificial, y una infraestructura cloud robusta basada en GCP para garantizar una base sólida de crecimiento.
