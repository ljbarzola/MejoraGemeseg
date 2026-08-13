# Arquitectura del Software

## Vision General
MejoraGemeseg es una plataforma web multi-tenant para gestionar procesos internos de GEMESEG y sus empresas afiliadas.

## Stack Tecnologico

### Backend
- **Framework:** NestJS v11 + TypeScript
- **ORM:** Prisma v7 (con `@prisma/adapter-pg`)
- **Base de datos:** PostgreSQL 17
- **Auth:** Passport.js (JWT, expira 7 dias) + bcryptjs (salt 10)
- **Validacion:** class-validator + class-transformer
- **IA:** GitHub Models (`gpt-4o-mini`)
- **PDF:** PDFKit (custodias: orden, nomina, rol de pago)

### Frontend
- **Framework:** React 18 + Vite
- **Routing:** react-router-dom
- **HTTP:** Axios (con interceptor JWT)
- **Estilos:** CSS custom con paleta corporativa

### Infraestructura
- **Desarrollo:** Docker (PostgreSQL + Redis), Backend :3000, Frontend :5173
- **Produccion:** Supabase (DB), Railway (backend), Vercel (frontend)

## Patrones de Diseno

### Multi-tenancy
- `companyId` en User y modelos de datos
- Super Admin (`companyId: null`) ve todo
- Company Admin solo ve su empresa
- Filtros por `companyId` en todos los queries

### Permisos
- `CompanySection`: que secciones puede ver cada empresa
- `UserPermission`: que puede ver/escribir cada usuario
- `SectionRoute`: wrapper en frontend que redirige si no tiene acceso
- `usePerm()`: hook para verificar permisos en componentes

### Layout
- Sidebar izquierdo colapsable (64px / 240px)
- `main-content` con margin-left dinamico
- `page-container` para contenido de paginas
- `page-card` para tarjetas de formulario

### CSS Classes Principales
- `.page-container`, `.page-header-row`, `.page-eyebrow`
- `.page-card`, `.admin-section`
- `.form-group`, `.form-row`, `.form-actions`, `.cacao-form`
- `.tasks-table-wrapper`, `.tasks-table`
- `.auth-btn`, `.btn-secondary`, `.btn-danger-sm`
- `.status-badge`, `.sidebar-*`

## Colores Corporativos
- Azul Oscuro: `#100F31`
- Azul Claro: `#12375F`
- Naranja: `#EE3B1B`
- Gris Claro: `#E6E6E6`
