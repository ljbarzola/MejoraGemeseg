# Base de Datos

## Motor
PostgreSQL 17 (Supabase en produccion, Docker en desarrollo)

## ORM
Prisma v7 con adapter `@prisma/adapter-pg`

## Enums
| Enum | Valores |
|------|---------|
| `UserRole` | ADMIN, MANAGER, EMPLOYEE |
| `ProjectStatus` | ACTIVE, ON_HOLD, COMPLETED, CANCELLED |
| `MemberRole` | OWNER, MEMBER, VIEWER |
| `TaskStatus` | TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELLED |
| `Priority` | LOW, MEDIUM, HIGH, URGENT |
| `CustodiaType` | HACIENDA, PUERTO, VIP |
| `CustodiaEstado` | LISTO_PARA_CUSTODIAR, EN_CAMINO, LLEGO |
| `CandidateStatus` | POSTULADO, VALIDACION_DOCUMENTAL, TEST_PSICOLOGICO, TEST_MEDICO, APROBADO, RECHAZADO |
| `ContractType` | TERMINO_INDEFINIDO, TERMINO_FIJO, ENTREGA_UNIFORMES |
| `LogType` | PERMISO_INGRESO, RESPUESTA_ADMIN_CONTRATO, NOVEDAD_OPERATIVA, SALIDA_PERSONAL |

## Modelos Core (17)
Company, Department, Role, User, Project, ProjectMember, Task, TaskAssignee, Agent, UserAgent, Conversation, ChatMessage, AiLog, Tool, ToolAssignment, ToolAuditLog, CompanySection, UserPermission

## Modelos Cacao (14)
CacaoSupplier, CacaoClient, CacaoQuality, CacaoLot, CacaoReception, CacaoSettlement, CacaoSettlementLot, CacaoKardex, CacaoPriceFixing, CacaoShipment, CacaoShipmentLot, CacaoPayable, CacaoReceivable, CacaoPayment, CacaoUnitConfig

## Modelos Custodias (1)
Custodia — campos: numeroGuia, tipoCustodia (HACIENDA/PUERTO/VIP), estado (LISTO_PARA_CUSTODIAR/EN_CAMINO/LLEGO), choferName/Cedula, custodio1Name/Cedula, custodio2Name/Cedula, cliente, placa, direccionSalida/Llegada, fechaHoraSalida/Llegada, observaciones, nombreHacienda, cantidadSacos, contenedores[], companyId, createdBy

## Modelos Personal (13)
KanbanColumn, Candidate, CandidateHistory, ContractTemplate, Contract, Certification, CertificationAlert, LogTemplate, LogEntry, EmployeeDriveFolder, DocumentType, EmployeeDocument, FolderConfig

## Modelos Ventas (4)
SalesGoal, ClientVisit, Lead, SalesApiKey

## Reglas de Negocio
- Kardex almacena en kg, unidades configurables por empresa
- Lot IDs: 5-digit format `LOTE-YYYY-00001`
- Settlements: `LIQ-XXXX`, Shipments: `EMB-XXXX`
- Contratos generados con campos `[NOMBRE]`, `[CEDULA]`, etc.
- Alertas de certificacion: 30, 15, 7, 1 dia antes del vencimiento
- Custodias: Solo estado `LLEGO` liquida nomina
- Custodias: Tarifas $20/$10/$23 por persona segun tipo
