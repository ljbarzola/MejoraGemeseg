# Modulo: Agents (IA)

## Descripcion
Agentes de IA con instrucciones personalizadas y conversaciones.

## Endpoints Admin
- `GET /admin/agents` - Listar usuarios con agentes asignados
- `GET /admin/agents/catalog` - Catalogo de agentes
- `GET /admin/agents/assignments` - Todas las asignaciones
- `POST /admin/agents` - Crear agente (se auto-asigna al creador)
- `PATCH /admin/agents/:id` - Actualizar agente
- `DELETE /admin/agents/:id` - Eliminar agente
- `POST /admin/agents/:id/assign/:userId` - Asignar agente
- `DELETE /admin/agents/:id/assign/:userId` - Quitar agente

## Endpoints Usuario
- `GET /agents/available` - Agentes disponibles (global + asignados)
- `POST /chat/message` - Enviar mensaje al asistente IA
- `GET /chat/conversations` - Listar conversaciones
- `GET /chat/conversations/:id/messages` - Mensajes de una conversacion

## Reglas
- Solo ADMIN puede gestionar agentes
- Cada agente tiene: nombre, instrucciones (system prompt), alcance (GLOBAL/PROJECTS/TASKS/ADMIN)
- Agente global (createdBy: null) disponible para todos
- Cada combinacion usuario+agente tiene sus propias conversaciones
- Rate limit: 50 mensajes/dia por usuario
- GitHub Models (gpt-4o-mini) con fallback a mock
