# Modulo: Companies

## Descripcion
Multi-tenant con white-labeling (colores, logo, dominio).

## Endpoints
- `GET /companies` - Listar empresas (solo ADMIN)
- `GET /companies/mine` - Empresa del usuario autenticado
- `GET /companies/slug/:slug` - Buscar empresa por slug (publico)
- `GET /companies/:id` - Detalle de empresa
- `POST /companies` - Crear empresa (solo super admin)
- `PATCH /companies/:id` - Actualizar empresa
- `DELETE /companies/:id` - Eliminar empresa (solo super admin)
- `POST /companies/:id/logo` - Subir logo

## White-labeling
- Cada empresa tiene: name, slug, logoUrl, primaryColor, secondaryColor, accentColor, bgColor, textColor, domain
- Logo se sube a `uploads/logos/` y se sirve via `express.static`
- `resolveLogoUrl()` en frontend prepende `VITE_API_URL` a paths `/uploads/`
- Login detecta dominio del email y carga theme de la empresa

## Reglas
- Super Admin (`companyId: null`) puede ver y gestionar todas las empresas
- Admin de empresa solo gestiona su propia empresa
- Los datos se filtran por companyId en todos los queries
