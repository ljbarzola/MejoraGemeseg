# Modulo: Personal (RRHH)

## Descripcion
Gestion integral de personal: reclutamiento, contratos, certificaciones, bitacoras y conexion con Google Drive.

## Submodulos

### 1. Reclutamiento External y Creación de Vacantes (`/personal/reclutamiento`)
Módulo de gestión de vacantes y visualización de candidatos externos recibidos vía Google Drive.

**Creación de Puestos:**
- RRHH crea puestos con campos de formulario requeridos y archivos PDF requeridos.
- Cada puesto se guarda en la base de datos y genera automáticamente un archivo `Puesto_<Nombre>.json` dentro de la carpeta `Reclutamiento` de Google Drive.

**Sincronización:**
- Botón **"Sincronizar"**: Lee las subcarpetas `[Nombre - Cédula]` dentro de `Reclutamiento` en Google Drive.
- Lee el archivo `candidato.json` interno de cada postulante.
- **Porcentaje de Completitud**: Calculado dinámicamente según la cantidad de archivos PDF subidos vs. los archivos requeridos especificados en la vacante a la que aplicó.
- **Detalle (Modal)**: Muestra información general, porcentaje de completitud, checklist de archivos y botón **"Ver Carpeta en Drive"** (abre el folder directo en Google Drive).

**Endpoints:**
- `GET/POST/DELETE /personal/reclutamiento/puestos` - CRUD de puestos/vacantes
- `POST /personal/reclutamiento/sync` - Sincronizar candidatos postulados desde Drive

### 2. Kanban de Reclutamiento Interiores

**Columnas por defecto:** POSTULADO → VALIDACION_DOCUMENTAL → TEST_PSICOLOGICO → TEST_MEDICO → APROBADO/RECHAZADO

**Campos del candidato (11+):**
- Nombre completo, Cedula, Telefono, Email
- Puesto aspirado, Disponibilidad horaria, Salario esperado
- Educacion, Experiencia laboral, Referencias
- Observaciones, CV (archivo)

**Endpoints:**
- `GET/POST /personal/kanban/columns` - Listar/crear columnas
- `PATCH/DELETE /personal/kanban/columns/:id` - Editar/eliminar columna
- `GET/POST /personal/candidates` - Listar/crear candidatos
- `PATCH /personal/candidates/:id` - Actualizar candidato
- `PATCH /personal/candidates/:id/move` - Mover candidato a columna
- `GET /personal/candidates/:id/history` - Historial de movimientos

### 2. Generador de Contratos
Extraccion de datos del candidato para autocompletar contratos.

**Plantillas:** 3 tipos predefinidos
1. Contrato a termino indefinido
2. Contrato a termino fijo
3. Acta de entrega de uniformes

**Campos reemplazables:** `[NOMBRE]`, `[CEDULA]`, `[PUESTO]`, `[FECHA_INICIO]`, `[SALARIO]`, `[EMPRESA]`, etc.

**Endpoints:**
- `GET/POST /personal/contracts/templates` - Listar/subir plantillas
- `POST /personal/contracts/generate` - Generar contrato con campos rellenados

### 3. Panel de Vencimientos y Cumplimiento
Dashboard de alertas para certificaciones proximas a caducar.

**Certificaciones:** Nivel 1, Nivel 2, Reentrenamiento, Examen Ocupacional

**Alertas:** 30, 15, 7 y 1 dia antes del vencimiento

**Endpoints:**
- `GET/POST /personal/certifications` - Listar/crear certificaciones
- `GET /personal/certifications/alerts` - Alertas de vencimiento

### 4. Bitacoras e Informes Publicos
Registro de bitacoras con plantillas estandarizadas.

**Plantillas (4 tipos):**
1. Permiso de ingreso
2. Respuesta a administrador de contrato
3. Novedad operativa
4. Salida de personal

**Endpoints:**
- `GET/POST /personal/logs/templates` - Listar plantillas
- `GET/POST /personal/logs/entries` - Listar/crear registros

### Distinción de Nombres y Términos
- **Custodias (Módulo independiente)**: Gestión operativa de rutas de transporte, vehículos, guías, estado de trayecto y liquidación de nómina de escolta.
- **Guardias (Submenú en Personal / RRHH)**: Gestión del personal de seguridad/custodios (certificaciones, contratos, cumplimiento documental sincronizado desde la carpeta Drive `RH > Custodios`).

### 5. Conexion Google Drive + Panel de Cumplimiento
Sincronización con Google Drive para leer carpetas de empleados y verificar documentos.

**Estructura de carpetas:** `RH > Custodios/[Nombre-Cedula]` y `RH > Personal Administrativo/[Nombre-Cedula]`

**Autenticación:** Service Account con archivo `google-service-account.json` en raíz del backend. Soporte para Shared Drives (Unidades Compartidas) con `supportsAllDrives: true`.

**Requisitos por defecto:**
- **Custodias (9):** Hoja de Vida, Cédula, Papeleta de Votación, Antecedentes Penales, Título de Bachiller, Referencias Laborales, Curso Nivel 1, Curso Nivel 2, Reentrenamiento Vigente
- **Personal (2):** Cédula, Contrato

**Sincronización:** Botón manual "Sincronizar" (cualquier usuario en la sección)

**Endpoints:**
- `POST /personal/drive/sync` - Sincronizar carpetas de Drive
- `GET /personal/drive/compliance/:cedula` - Checklist de cumplimiento
- `GET /personal/drive/tree` - Árbol de carpetas
- `GET /personal/drive/config` - Configuración actual
- `POST /personal/drive/config` - Guardar configuración
- `POST /personal/drive/test` - Probar conexión
- `GET /personal/document-types` - Listar requisitos
- `POST /personal/document-types` - Crear requisito
- `PATCH /personal/document-types/:id` - Editar requisito
- `DELETE /personal/document-types/:id` - Eliminar requisito

**Archivos:**
- `backend/src/modules/personal/services/drive.service.ts`
- `backend/src/modules/personal/drive.controller.ts`
- `backend/src/modules/personal/drive.module.ts`
- `frontend/src/pages/personal/compliance/CompliancePanel.tsx`
- `frontend/src/pages/personal/compliance/DriveConfig.tsx`
- `frontend/src/pages/personal/compliance/DocumentTypeConfig.tsx`

## Reglas
- Multitenant con companyId
- Solo ADMIN puede gestionar
- Historial completo de movimientos en Kanban
- Alertas automaticas de vencimiento

## Datos de Ejemplo (Seed)
- **5 Kanban columns**: Postulado, Validación Documental, Test Psicológico, Test Médico, Aprobado
- **5 Candidates**: Ana Vera (Aprobado), Carlos Muñoz (Test Psicológico), María Paredes (Postulado), Luis Gómez (Test Médico), Diana Torres (Validación Documental)
- **5 Certifications**: Roberto Díaz (Nivel 1), Sandra Luna (Reentrenamiento), Fernando Castro (Examen Ocupacional), Eduardo Reyes (Nivel 2), Patricia Acosta (Nivel 1)
- **5 Log Entries**: 2 permisos de ingreso, 1 novedad operativa, 1 salida de personal, 1 respuesta a administrador
- **3 Contract Templates**: Término Indefinido, Término Fijo, Acta de Entrega de Uniformes
- **3 Contracts**: Ana Vera (SIGNED), Luis Gómez (DRAFT), Diana Torres (DRAFT)
