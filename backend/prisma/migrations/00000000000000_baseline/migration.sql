-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CustodiaType" AS ENUM ('HACIENDA', 'PUERTO', 'VIP');

-- CreateEnum
CREATE TYPE "CustodiaEstado" AS ENUM ('LISTO_PARA_CUSTODIAR', 'EN_CAMINO', 'LLEGO');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('POSTULADO', 'VALIDACION_DOCUMENTAL', 'TEST_PSICOLOGICO', 'TEST_MEDICO', 'APROBADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'ENTREGA_UNIFORMES');

-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('PERMISO_INGRESO', 'RESPUESTA_ADMIN_CONTRATO', 'NOVEDAD_OPERATIVA', 'SALIDA_PERSONAL');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitOutcome" AS ENUM ('INTERESTED', 'QUOTED', 'CLOSED_SALE', 'NOT_INTERESTED', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('GOOGLE_ADS', 'WEB_FORM', 'EMAIL', 'MANUAL');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'QUOTED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "TipoMovimientoPersonal" AS ENUM ('ENTRADA', 'SALIDA');

-- CreateEnum
CREATE TYPE "EstadoMovimientoPersonal" AS ENUM ('EN_PROCESO', 'COMPLETADO');

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#100F31',
    "secondaryColor" TEXT NOT NULL DEFAULT '#12375F',
    "accentColor" TEXT NOT NULL DEFAULT '#EE3B1B',
    "bgColor" TEXT NOT NULL DEFAULT '#f8fafc',
    "textColor" TEXT NOT NULL DEFAULT '#1e293b',
    "domain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "documentNumber" TEXT,
    "position" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "departmentId" INTEGER,
    "roleId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "activeAgentId" INTEGER,
    "companyId" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" INTEGER NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" SERIAL NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "projectId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" INTEGER NOT NULL,
    "estimatedHours" DOUBLE PRECISION,
    "endDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,
    "instructions" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAgent" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "agentId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "context" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "agentId" INTEGER NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokensUsed" INTEGER,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokensUsed" INTEGER,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tool" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolAssignment" (
    "id" SERIAL NOT NULL,
    "toolId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "version" TEXT,
    "licenseKey" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolAuditLog" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "performedBy" INTEGER NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoSupplier" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "paymentTerms" TEXT,
    "bank" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CacaoSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoClient" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "contact" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CacaoClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoQuality" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "fixedPrice" DOUBLE PRECISION,
    "humidityDiscount" DOUBLE PRECISION NOT NULL DEFAULT 7,
    "impurityDiscount" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isFixedPrice" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CacaoQuality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoLot" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "qualityId" INTEGER NOT NULL,
    "netWeight" DOUBLE PRECISION NOT NULL,
    "averageCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "differential" DOUBLE PRECISION,

    CONSTRAINT "CacaoLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoReception" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "guideNumber" TEXT NOT NULL,
    "grossWeight" DOUBLE PRECISION NOT NULL,
    "tare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netWeight" DOUBLE PRECISION NOT NULL,
    "humidity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impurities" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "provisionalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualityId" INTEGER,
    "lotId" INTEGER,
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "differential" DOUBLE PRECISION,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'KG',

    CONSTRAINT "CacaoReception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoSettlement" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalNetWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CacaoSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoSettlementLot" (
    "id" SERIAL NOT NULL,
    "settlementId" INTEGER NOT NULL,
    "lotId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CacaoSettlementLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoKardex" (
    "id" SERIAL NOT NULL,
    "lotId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "balanceQty" DOUBLE PRECISION NOT NULL,
    "balanceCost" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceUnit" TEXT,

    CONSTRAINT "CacaoKardex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoPriceFixing" (
    "id" SERIAL NOT NULL,
    "lotId" INTEGER NOT NULL,
    "referencePrice" DOUBLE PRECISION,
    "differential" DOUBLE PRECISION,
    "fixedPrice" DOUBLE PRECISION,
    "pendingWeight" DOUBLE PRECISION,
    "fixedDate" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CacaoPriceFixing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoShipment" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "clientId" INTEGER NOT NULL,
    "contractRef" TEXT NOT NULL,
    "totalWeight" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "salePrice" DOUBLE PRECISION NOT NULL,
    "margin" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "salePricePerKg" DOUBLE PRECISION NOT NULL,
    "totalWeightKg" DOUBLE PRECISION NOT NULL,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'KG',

    CONSTRAINT "CacaoShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoShipmentLot" (
    "id" SERIAL NOT NULL,
    "shipmentId" INTEGER NOT NULL,
    "lotId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "saleAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantityKg" DOUBLE PRECISION NOT NULL,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'KG',

    CONSTRAINT "CacaoShipmentLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoPayable" (
    "id" SERIAL NOT NULL,
    "settlementId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CacaoPayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoReceivable" (
    "id" SERIAL NOT NULL,
    "shipmentId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "receivedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CacaoReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoPayment" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'TRANSFER',
    "reference" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payableId" INTEGER,
    "receivableId" INTEGER,

    CONSTRAINT "CacaoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacaoUnitConfig" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "kgPerUnit" DOUBLE PRECISION NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CacaoUnitConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySection" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanySection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "section" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Custodia" (
    "id" SERIAL NOT NULL,
    "numeroGuia" TEXT NOT NULL,
    "tipoCustodia" "CustodiaType" NOT NULL,
    "estado" "CustodiaEstado" NOT NULL DEFAULT 'LISTO_PARA_CUSTODIAR',
    "choferName" TEXT NOT NULL,
    "choferCedula" TEXT NOT NULL DEFAULT '',
    "custodio1Name" TEXT NOT NULL,
    "custodio1Cedula" TEXT NOT NULL DEFAULT '',
    "custodio2Name" TEXT NOT NULL,
    "custodio2Cedula" TEXT NOT NULL DEFAULT '',
    "cliente" TEXT NOT NULL DEFAULT '',
    "placa" TEXT NOT NULL DEFAULT '',
    "direccionSalida" TEXT NOT NULL DEFAULT '',
    "direccionLlegada" TEXT NOT NULL DEFAULT '',
    "fechaHoraSalida" TIMESTAMP(3),
    "fechaHoraLlegada" TIMESTAMP(3),
    "observaciones" TEXT,
    "nombreHacienda" TEXT,
    "cantidadSacos" INTEGER,
    "contenedores" TEXT[],
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Custodia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanColumn" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#718096',
    "triggersHire" BOOLEAN NOT NULL DEFAULT false,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanbanColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "positionApplied" TEXT NOT NULL,
    "availability" TEXT,
    "salaryExpected" DOUBLE PRECISION,
    "education" TEXT,
    "experience" TEXT,
    "references" TEXT,
    "observations" TEXT,
    "cvUrl" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'POSTULADO',
    "columnId" INTEGER,
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateHistory" (
    "id" SERIAL NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "fromColumn" TEXT,
    "toColumn" TEXT NOT NULL,
    "notes" TEXT,
    "performedBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "driveUrl" TEXT,
    "docxPath" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractField" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "variableName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "systemField" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContractField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" SERIAL NOT NULL,
    "cedula" TEXT NOT NULL,
    "nombreGuardia" TEXT NOT NULL,
    "templateId" INTEGER NOT NULL,
    "fieldValues" JSONB,
    "generatedUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" SERIAL NOT NULL,
    "employeeName" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "documentUrl" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificationAlert" (
    "id" SERIAL NOT NULL,
    "certificationId" INTEGER NOT NULL,
    "daysBefore" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificationAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LogType" NOT NULL,
    "content" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogEntry" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "LogType" NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDriveFolder" (
    "id" SERIAL NOT NULL,
    "employeeName" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "puesto" TEXT,
    "folderId" TEXT NOT NULL,
    "folderUrl" TEXT NOT NULL,
    "folderType" TEXT NOT NULL DEFAULT 'PERSONAL',
    "lastSyncAt" TIMESTAMP(3),
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeDriveFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" SERIAL NOT NULL,
    "employeeName" TEXT NOT NULL,
    "cedula" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "expiryConfirmedBy" INTEGER,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entidad" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "driveFolderId" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitoDocumento" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "aplicaA" TEXT NOT NULL,
    "entidadId" INTEGER,
    "duracionValor" INTEGER,
    "duracionUnidad" TEXT,
    "anticipacionValor" INTEGER NOT NULL DEFAULT 30,
    "anticipacionUnidad" TEXT NOT NULL DEFAULT 'DIAS',
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequisitoDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsignacionGuardia" (
    "id" SERIAL NOT NULL,
    "cedula" TEXT NOT NULL,
    "nombreGuardia" TEXT NOT NULL,
    "entidadId" INTEGER NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3),
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsignacionGuardia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardiaContacto" (
    "id" SERIAL NOT NULL,
    "cedula" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardiaContacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardiaFichaPersonal" (
    "id" SERIAL NOT NULL,
    "cedula" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "fechaNacimiento" TIMESTAMP(3),
    "contactoEmergenciaNombre" TEXT,
    "contactoEmergenciaTelefono" TEXT,
    "horario" TEXT,
    "puestoFormal" TEXT,
    "salarioAcordado" DOUBLE PRECISION,
    "driveFileId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuardiaFichaPersonal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertaVencimiento" (
    "id" SERIAL NOT NULL,
    "employeeDocumentId" INTEGER NOT NULL,
    "requisitoDocumentoId" INTEGER NOT NULL,
    "expiryDateAlertado" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "AlertaVencimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolderConfig" (
    "id" SERIAL NOT NULL,
    "driveFolderId" TEXT NOT NULL,
    "driveFolderName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CUMPLIMIENTO',
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FolderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesGoal" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "weeklyVisitGoal" INTEGER NOT NULL DEFAULT 20,
    "year" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientVisit" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientAddress" TEXT,
    "clientPhone" TEXT,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'PLANNED',
    "checkInTime" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "commercialOffer" TEXT,
    "quotedAmount" DOUBLE PRECISION DEFAULT 0,
    "outcome" "VisitOutcome",
    "notes" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "companyName" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'WEB_FORM',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "assignedUserId" INTEGER,
    "campaignName" TEXT,
    "estimatedValue" DOUBLE PRECISION DEFAULT 0,
    "closedValue" DOUBLE PRECISION DEFAULT 0,
    "notes" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesApiKey" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPosition" (
    "id" SERIAL NOT NULL,
    "puesto" TEXT NOT NULL,
    "descripcion" TEXT,
    "camposRequeridos" JSONB NOT NULL DEFAULT '[]',
    "archivosRequeridos" JSONB NOT NULL DEFAULT '[]',
    "estado" TEXT NOT NULL DEFAULT 'ABIERTA',
    "driveFileId" TEXT,
    "driveFolderId" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SistemaVerificacion" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "urlPortal" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SistemaVerificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoPersonal" (
    "id" SERIAL NOT NULL,
    "cedula" TEXT NOT NULL,
    "nombreGuardia" TEXT NOT NULL,
    "tipo" "TipoMovimientoPersonal" NOT NULL,
    "estado" "EstadoMovimientoPersonal" NOT NULL DEFAULT 'EN_PROCESO',
    "origen" TEXT NOT NULL,
    "candidateId" INTEGER,
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completadoAt" TIMESTAMP(3),

    CONSTRAINT "MovimientoPersonal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoPersonalItem" (
    "id" SERIAL NOT NULL,
    "movimientoId" INTEGER NOT NULL,
    "sistemaVerificacionId" INTEGER,
    "nombreSistema" TEXT NOT NULL,
    "completado" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "completadoPor" INTEGER,
    "completadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoPersonalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentReview" (
    "id" SERIAL NOT NULL,
    "cedula" TEXT NOT NULL,
    "documentTypeId" INTEGER,
    "driveFileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "reason" TEXT,
    "reviewedDriveFileId" TEXT,
    "reviewedFileName" TEXT,
    "reviewedBy" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentReviewHistory" (
    "id" SERIAL NOT NULL,
    "reviewId" INTEGER NOT NULL,
    "cedula" TEXT NOT NULL,
    "documentTypeName" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "driveFileId" TEXT,
    "fileName" TEXT,
    "performedBy" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentReviewHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "driveUrl" TEXT,
    "docxPath" TEXT,
    "generatedPdfPath" TEXT,
    "boldsignTemplateId" TEXT,
    "emailSubject" TEXT,
    "emailBody" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesField" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "variableName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isClientField" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" TEXT,
    "dropdownOptions" TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesContract" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT NOT NULL,
    "clientPhone" TEXT,
    "clientCompany" TEXT,
    "clientRuc" TEXT,
    "clientAddress" TEXT,
    "fieldValues" JSONB NOT NULL,
    "annexA" JSONB,
    "annexB" JSONB,
    "annexC" JSONB,
    "generatedPdfPath" TEXT,
    "boldsignDocumentId" TEXT,
    "boldsignStatus" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignee_taskId_userId_key" ON "TaskAssignee"("taskId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_createdBy_name_key" ON "Agent"("createdBy", "name");

-- CreateIndex
CREATE UNIQUE INDEX "UserAgent_userId_agentId_key" ON "UserAgent"("userId", "agentId");

-- CreateIndex
CREATE INDEX "Conversation_userId_idx" ON "Conversation"("userId");

-- CreateIndex
CREATE INDEX "Conversation_agentId_idx" ON "Conversation"("agentId");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_idx" ON "ChatMessage"("conversationId");

-- CreateIndex
CREATE INDEX "AiLog_userId_idx" ON "AiLog"("userId");

-- CreateIndex
CREATE INDEX "AiLog_createdAt_idx" ON "AiLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tool_name_key" ON "Tool"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ToolAssignment_toolId_userId_key" ON "ToolAssignment"("toolId", "userId");

-- CreateIndex
CREATE INDEX "ToolAuditLog_assignmentId_idx" ON "ToolAuditLog"("assignmentId");

-- CreateIndex
CREATE INDEX "ToolAuditLog_createdAt_idx" ON "ToolAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CacaoQuality_name_key" ON "CacaoQuality"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CacaoLot_code_key" ON "CacaoLot"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CacaoPayable_settlementId_key" ON "CacaoPayable"("settlementId");

-- CreateIndex
CREATE UNIQUE INDEX "CacaoReceivable_shipmentId_key" ON "CacaoReceivable"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySection_companyId_section_key" ON "CompanySection"("companyId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_section_key" ON "UserPermission"("userId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "Custodia_numeroGuia_key" ON "Custodia"("numeroGuia");

-- CreateIndex
CREATE INDEX "Custodia_companyId_idx" ON "Custodia"("companyId");

-- CreateIndex
CREATE INDEX "Custodia_estado_idx" ON "Custodia"("estado");

-- CreateIndex
CREATE INDEX "Custodia_tipoCustodia_idx" ON "Custodia"("tipoCustodia");

-- CreateIndex
CREATE INDEX "KanbanColumn_companyId_idx" ON "KanbanColumn"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanColumn_companyId_name_key" ON "KanbanColumn"("companyId", "name");

-- CreateIndex
CREATE INDEX "Candidate_companyId_idx" ON "Candidate"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_companyId_cedula_key" ON "Candidate"("companyId", "cedula");

-- CreateIndex
CREATE INDEX "Contract_companyId_cedula_idx" ON "Contract"("companyId", "cedula");

-- CreateIndex
CREATE INDEX "Certification_companyId_idx" ON "Certification"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDriveFolder_companyId_cedula_key" ON "EmployeeDriveFolder"("companyId", "cedula");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_companyId_folder_name_key" ON "DocumentType"("companyId", "folder", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDocument_driveFileId_key" ON "EmployeeDocument"("driveFileId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDocument_companyId_driveFileId_key" ON "EmployeeDocument"("companyId", "driveFileId");

-- CreateIndex
CREATE INDEX "Entidad_companyId_idx" ON "Entidad"("companyId");

-- CreateIndex
CREATE INDEX "RequisitoDocumento_companyId_idx" ON "RequisitoDocumento"("companyId");

-- CreateIndex
CREATE INDEX "RequisitoDocumento_entidadId_idx" ON "RequisitoDocumento"("entidadId");

-- CreateIndex
CREATE INDEX "AsignacionGuardia_companyId_cedula_idx" ON "AsignacionGuardia"("companyId", "cedula");

-- CreateIndex
CREATE INDEX "AsignacionGuardia_entidadId_idx" ON "AsignacionGuardia"("entidadId");

-- CreateIndex
CREATE UNIQUE INDEX "GuardiaContacto_companyId_cedula_key" ON "GuardiaContacto"("companyId", "cedula");

-- CreateIndex
CREATE UNIQUE INDEX "GuardiaFichaPersonal_companyId_cedula_key" ON "GuardiaFichaPersonal"("companyId", "cedula");

-- CreateIndex
CREATE INDEX "AlertaVencimiento_companyId_idx" ON "AlertaVencimiento"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertaVencimiento_employeeDocumentId_requisitoDocumentoId_e_key" ON "AlertaVencimiento"("employeeDocumentId", "requisitoDocumentoId", "expiryDateAlertado");

-- CreateIndex
CREATE UNIQUE INDEX "FolderConfig_companyId_type_key" ON "FolderConfig"("companyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "SalesGoal_companyId_userId_year_weekNumber_key" ON "SalesGoal"("companyId", "userId", "year", "weekNumber");

-- CreateIndex
CREATE INDEX "ClientVisit_companyId_userId_idx" ON "ClientVisit"("companyId", "userId");

-- CreateIndex
CREATE INDEX "Lead_companyId_assignedUserId_idx" ON "Lead"("companyId", "assignedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesApiKey_apiKey_key" ON "SalesApiKey"("apiKey");

-- CreateIndex
CREATE INDEX "SalesApiKey_companyId_idx" ON "SalesApiKey"("companyId");

-- CreateIndex
CREATE INDEX "JobPosition_companyId_idx" ON "JobPosition"("companyId");

-- CreateIndex
CREATE INDEX "SistemaVerificacion_companyId_idx" ON "SistemaVerificacion"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SistemaVerificacion_companyId_nombre_key" ON "SistemaVerificacion"("companyId", "nombre");

-- CreateIndex
CREATE INDEX "MovimientoPersonal_companyId_cedula_idx" ON "MovimientoPersonal"("companyId", "cedula");

-- CreateIndex
CREATE INDEX "MovimientoPersonal_companyId_tipo_estado_idx" ON "MovimientoPersonal"("companyId", "tipo", "estado");

-- CreateIndex
CREATE INDEX "MovimientoPersonalItem_movimientoId_idx" ON "MovimientoPersonalItem"("movimientoId");

-- CreateIndex
CREATE INDEX "DocumentReview_companyId_cedula_idx" ON "DocumentReview"("companyId", "cedula");

-- CreateIndex
CREATE INDEX "DocumentReviewHistory_companyId_cedula_idx" ON "DocumentReviewHistory"("companyId", "cedula");

-- CreateIndex
CREATE INDEX "SalesTemplate_companyId_idx" ON "SalesTemplate"("companyId");

-- CreateIndex
CREATE INDEX "SalesField_templateId_idx" ON "SalesField"("templateId");

-- CreateIndex
CREATE INDEX "SalesContract_companyId_status_idx" ON "SalesContract"("companyId", "status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_activeAgentId_fkey" FOREIGN KEY ("activeAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAgent" ADD CONSTRAINT "UserAgent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAgent" ADD CONSTRAINT "UserAgent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiLog" ADD CONSTRAINT "AiLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolAssignment" ADD CONSTRAINT "ToolAssignment_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolAssignment" ADD CONSTRAINT "ToolAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolAuditLog" ADD CONSTRAINT "ToolAuditLog_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ToolAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolAuditLog" ADD CONSTRAINT "ToolAuditLog_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoLot" ADD CONSTRAINT "CacaoLot_qualityId_fkey" FOREIGN KEY ("qualityId") REFERENCES "CacaoQuality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoReception" ADD CONSTRAINT "CacaoReception_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CacaoLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoReception" ADD CONSTRAINT "CacaoReception_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "CacaoSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoSettlement" ADD CONSTRAINT "CacaoSettlement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "CacaoSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoSettlementLot" ADD CONSTRAINT "CacaoSettlementLot_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CacaoLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoSettlementLot" ADD CONSTRAINT "CacaoSettlementLot_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CacaoSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoKardex" ADD CONSTRAINT "CacaoKardex_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CacaoLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoPriceFixing" ADD CONSTRAINT "CacaoPriceFixing_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CacaoLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoShipment" ADD CONSTRAINT "CacaoShipment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CacaoClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoShipmentLot" ADD CONSTRAINT "CacaoShipmentLot_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CacaoLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoShipmentLot" ADD CONSTRAINT "CacaoShipmentLot_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "CacaoShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoPayable" ADD CONSTRAINT "CacaoPayable_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CacaoSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoPayable" ADD CONSTRAINT "CacaoPayable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "CacaoSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoReceivable" ADD CONSTRAINT "CacaoReceivable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "CacaoClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoReceivable" ADD CONSTRAINT "CacaoReceivable_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "CacaoShipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoPayment" ADD CONSTRAINT "CacaoPayment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "CacaoPayable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CacaoPayment" ADD CONSTRAINT "CacaoPayment_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "CacaoReceivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySection" ADD CONSTRAINT "CompanySection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Custodia" ADD CONSTRAINT "Custodia_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Custodia" ADD CONSTRAINT "Custodia_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanColumn" ADD CONSTRAINT "KanbanColumn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "KanbanColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateHistory" ADD CONSTRAINT "CandidateHistory_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateHistory" ADD CONSTRAINT "CandidateHistory_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractField" ADD CONSTRAINT "ContractField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificationAlert" ADD CONSTRAINT "CertificationAlert_certificationId_fkey" FOREIGN KEY ("certificationId") REFERENCES "Certification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogTemplate" ADD CONSTRAINT "LogTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogTemplate" ADD CONSTRAINT "LogTemplate_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEntry" ADD CONSTRAINT "LogEntry_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LogTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEntry" ADD CONSTRAINT "LogEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEntry" ADD CONSTRAINT "LogEntry_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDriveFolder" ADD CONSTRAINT "EmployeeDriveFolder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentType" ADD CONSTRAINT "DocumentType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_expiryConfirmedBy_fkey" FOREIGN KEY ("expiryConfirmedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entidad" ADD CONSTRAINT "Entidad_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitoDocumento" ADD CONSTRAINT "RequisitoDocumento_entidadId_fkey" FOREIGN KEY ("entidadId") REFERENCES "Entidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitoDocumento" ADD CONSTRAINT "RequisitoDocumento_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionGuardia" ADD CONSTRAINT "AsignacionGuardia_entidadId_fkey" FOREIGN KEY ("entidadId") REFERENCES "Entidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionGuardia" ADD CONSTRAINT "AsignacionGuardia_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionGuardia" ADD CONSTRAINT "AsignacionGuardia_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardiaContacto" ADD CONSTRAINT "GuardiaContacto_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardiaFichaPersonal" ADD CONSTRAINT "GuardiaFichaPersonal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaVencimiento" ADD CONSTRAINT "AlertaVencimiento_employeeDocumentId_fkey" FOREIGN KEY ("employeeDocumentId") REFERENCES "EmployeeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaVencimiento" ADD CONSTRAINT "AlertaVencimiento_requisitoDocumentoId_fkey" FOREIGN KEY ("requisitoDocumentoId") REFERENCES "RequisitoDocumento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaVencimiento" ADD CONSTRAINT "AlertaVencimiento_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderConfig" ADD CONSTRAINT "FolderConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesGoal" ADD CONSTRAINT "SalesGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesGoal" ADD CONSTRAINT "SalesGoal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientVisit" ADD CONSTRAINT "ClientVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientVisit" ADD CONSTRAINT "ClientVisit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesApiKey" ADD CONSTRAINT "SalesApiKey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPosition" ADD CONSTRAINT "JobPosition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SistemaVerificacion" ADD CONSTRAINT "SistemaVerificacion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPersonal" ADD CONSTRAINT "MovimientoPersonal_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPersonal" ADD CONSTRAINT "MovimientoPersonal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPersonal" ADD CONSTRAINT "MovimientoPersonal_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPersonalItem" ADD CONSTRAINT "MovimientoPersonalItem_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "MovimientoPersonal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPersonalItem" ADD CONSTRAINT "MovimientoPersonalItem_sistemaVerificacionId_fkey" FOREIGN KEY ("sistemaVerificacionId") REFERENCES "SistemaVerificacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoPersonalItem" ADD CONSTRAINT "MovimientoPersonalItem_completadoPor_fkey" FOREIGN KEY ("completadoPor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReview" ADD CONSTRAINT "DocumentReview_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReview" ADD CONSTRAINT "DocumentReview_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReview" ADD CONSTRAINT "DocumentReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReviewHistory" ADD CONSTRAINT "DocumentReviewHistory_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "DocumentReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReviewHistory" ADD CONSTRAINT "DocumentReviewHistory_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReviewHistory" ADD CONSTRAINT "DocumentReviewHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTemplate" ADD CONSTRAINT "SalesTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTemplate" ADD CONSTRAINT "SalesTemplate_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesField" ADD CONSTRAINT "SalesField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SalesTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesContract" ADD CONSTRAINT "SalesContract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesContract" ADD CONSTRAINT "SalesContract_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesContract" ADD CONSTRAINT "SalesContract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SalesTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

