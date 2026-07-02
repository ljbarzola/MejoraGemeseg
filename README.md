# Gemeseg Mejora

## ¿Qué es este proyecto?
Gemeseg Mejora es una plataforma en desarrollo para GEMESEG (Ecuador) diseñada para centralizar, modernizar y automatizar procesos internos.
En esta primera fase el foco está en gestionar proyectos, tareas y usuarios de forma segura, con una base preparada para integrar IA en etapas posteriores.

## Contexto
- Empresa: GEMESEG (Ecuador)
- Objetivo: centralizar operaciones internas en un espacio digital único.
- Metodología: Scrum con sprints de 1-2 semanas.
- Estado actual: Fase 1 en desarrollo.

## Funcionalidades clave
- Gestión de usuarios y roles con inicio de sesión seguro.
- Administración de proyectos y seguimiento de tareas.
- Base de datos relacional para mantener información estructurada.
- Soporte inicial para IA mediante cola de trabajo asíncrona.
- Interfaz frontend con identidad visual GEMESEG.
- Documentación de API disponible en `/docs`.

## Qué puede hacer hoy
- Registrar y gestionar usuarios.
- Crear, leer, actualizar y desactivar usuarios desde el backend.
- Estructura inicial de módulos para proyectos y tareas.
- Colas asíncronas con Bull para manejar procesos más largos.
- Configuración de entorno y despliegue local con Docker.

## Qué está en camino
- Módulos de RRHH y desempeño.
- Facturación y OCR.
- CRM y despliegue en Google Cloud.
- Integración más profunda de Claude API para asistencia en tareas.
- Formularios y paneles de administración más completos.

## Tecnología utilizada
- Frontend: React 18 + Vite
- Backend: NestJS + TypeScript
- Base de datos: PostgreSQL
- ORM: Prisma
- Colas: Bull + Redis
- Autenticación: JWT
- Contenedores: Docker Compose

## Cómo empezar
### Con Docker
1. Copia `.env.example` a `.env`.
2. Ajusta `DATABASE_URL`, `REDIS_HOST`, `JWT_SECRET`, `CLAUDE_API_KEY` y otros valores.
3. Ejecuta:
   - `docker compose up --build`
4. Accede a:
   - Backend: `http://localhost:3000`
   - Frontend: `http://localhost:5173`
   - Swagger: `http://localhost:3000/docs`

### Sin Docker
1. Backend:
   - `cd backend && npm install`
   - Copia `.env.example` a `.env` y configura los valores.
   - `npx prisma migrate dev --name init`
   - `npm run start:dev`
2. Frontend:
   - `cd frontend && npm install`
   - `npm run dev`
3. Prueba el backend en `http://localhost:3000` y el frontend en `http://localhost:5173`.

## Estructura principal del repositorio
```
gemeseg-app/
├── AGENT.md
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── .gitignore
├── backend/
│   ├── src/
│   ├── prisma/
│   ├── test/
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
└── docs/
    └── historias-usuario-fase1.md
```

## Colores corporativos
- Azul oscuro: `#100F31`
- Azul claro: `#12375F`
- Naranja: `#EE3B1B`
- Gris claro: `#E6E6E6`

## Nota para personas no técnicas
Este README explica qué hace el sistema, cómo empezar localmente y qué etapas están planificadas. No es necesario conocer todos los detalles técnicos para entender que la plataforma sirve a GEMESEG como un sistema moderno de gestión interna.