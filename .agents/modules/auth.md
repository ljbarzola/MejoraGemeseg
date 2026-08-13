# Modulo: Auth

## Descripcion
Autenticacion y autorizacion JWT con roles.

## Endpoints
- `POST /auth/register` - Registro (solo @gemeseg.com via domain guard)
- `POST /auth/login` - Login, retorna JWT con `{ sub, email, role, companyId }`
- `GET /auth/profile` - Perfil del usuario autenticado

## JWT
- Expira en 7 dias
- Payload: `{ sub, email, role, companyId }`
- Password hasheada con bcrypt (salt 10)

## Guards
- `AuthGuard('jwt')` - Protege rutas autenticadas
- `RolesGuard` - Verifica rol ADMIN para rutas restringidas
- Domain guard - Solo permite registros @gemeseg.com

## Convenciones
- Usar `req.user.userId` (no `req.user.sub`) para obtener ID del usuario
- El companyId viene en el JWT y se usa para filtrar datos
