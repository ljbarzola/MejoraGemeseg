/**
 * Tablas de configuración y envío de las custodias en campo, creadas al arrancar (2026-11-24, Fase 1).
 *
 * Mismo motivo y patrón que contabilidad.schema.ts: el despliegue no corre migraciones, así que las
 * tablas se aseguran solas. Son TABLAS NUEVAS (nadie más las lee), por lo que un servidor anterior
 * sigue funcionando sin ellas. No tienen modelo de Prisma: se leen y escriben con SQL directo.
 * Las columnas nuevas de `Custodia` van aparte, en src/prisma/custodia-campo.schema.ts.
 */
export const ASUNTO_CORREO_DEFECTO = 'Guía de custodia {guia}';
export const TEXTO_CORREO_DEFECTO =
  'Estimado cliente:\n\nAdjuntamos la guía de custodia {guia} del servicio del {fecha}.\n\nSaludos,\nOperaciones Gemeseg';

export const CUSTODIAS_CONFIG_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "CustodiaConfig" (
    "companyId" INTEGER NOT NULL,
    "firmaMomento" TEXT NOT NULL DEFAULT 'LLEGADA',
    "firmaObligatoria" BOOLEAN NOT NULL DEFAULT false,
    "correoCopias" JSONB NOT NULL DEFAULT '[]',
    "correoAsunto" TEXT NOT NULL DEFAULT 'Guía de custodia {guia}',
    "correoTexto" TEXT NOT NULL DEFAULT E'Estimado cliente:\\n\\nAdjuntamos la guía de custodia {guia} del servicio del {fecha}.\\n\\nSaludos,\\nOperaciones Gemeseg',
    "telefonoOperaciones" TEXT,
    "camposSembrados" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "CustodiaConfig_pkey" PRIMARY KEY ("companyId")
  )`,
  `DO $$ BEGIN
    ALTER TABLE "CustodiaConfig" ADD CONSTRAINT "CustodiaConfig_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,

  `CREATE TABLE IF NOT EXISTS "CustodiaFirmaCliente" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "salesClientId" INTEGER NOT NULL,
    "firmaMomento" TEXT NOT NULL,
    CONSTRAINT "CustodiaFirmaCliente_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CustodiaFirmaCliente_companyId_salesClientId_key"
     ON "CustodiaFirmaCliente"("companyId", "salesClientId")`,
  `DO $$ BEGIN
    ALTER TABLE "CustodiaFirmaCliente" ADD CONSTRAINT "CustodiaFirmaCliente_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,

  `CREATE TABLE IF NOT EXISTS "CustodiaRuta" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "origen" TEXT NOT NULL DEFAULT '',
    "destino" TEXT NOT NULL DEFAULT '',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "CustodiaRuta_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CustodiaRuta_companyId_idx" ON "CustodiaRuta"("companyId")`,
  `DO $$ BEGIN
    ALTER TABLE "CustodiaRuta" ADD CONSTRAINT "CustodiaRuta_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,

  `CREATE TABLE IF NOT EXISTS "CustodiaRutaPunto" (
    "id" SERIAL NOT NULL,
    "rutaId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "minutosDesdeAnterior" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CustodiaRutaPunto_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CustodiaRutaPunto_rutaId_idx" ON "CustodiaRutaPunto"("rutaId")`,
  `DO $$ BEGIN
    ALTER TABLE "CustodiaRutaPunto" ADD CONSTRAINT "CustodiaRutaPunto_rutaId_fkey"
      FOREIGN KEY ("rutaId") REFERENCES "CustodiaRuta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,

  // Campos configurables de la guía. «Borrar» = desactivar (nunca DELETE): los viajes viejos guardan su valor
  // por id y una foto de la etiqueta en `Custodia.guia.etiquetas`.
  `CREATE TABLE IF NOT EXISTS "CustodiaCampo" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tipoServicio" TEXT NOT NULL,
    "bloque" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "opciones" JSONB NOT NULL DEFAULT '[]',
    "obligatorio" BOOLEAN NOT NULL DEFAULT false,
    "llenaQuien" TEXT NOT NULL DEFAULT 'OFICINA',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "enPdf" BOOLEAN NOT NULL DEFAULT true,
    "esSello" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "CustodiaCampo_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CustodiaCampo_companyId_idx" ON "CustodiaCampo"("companyId")`,
  `DO $$ BEGIN
    ALTER TABLE "CustodiaCampo" ADD CONSTRAINT "CustodiaCampo_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,

  // Historial de envíos de la guía al cliente.
  `CREATE TABLE IF NOT EXISTS "CustodiaEnvio" (
    "id" SERIAL NOT NULL,
    "custodiaId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "para" JSONB NOT NULL,
    "copia" JSONB NOT NULL DEFAULT '[]',
    "asunto" TEXT NOT NULL,
    "enviadoPor" INTEGER,
    "enviadoPorNombre" TEXT,
    "enviadoEn" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,
    CONSTRAINT "CustodiaEnvio_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "CustodiaEnvio_custodiaId_idx" ON "CustodiaEnvio"("custodiaId")`,
  `DO $$ BEGIN
    ALTER TABLE "CustodiaEnvio" ADD CONSTRAINT "CustodiaEnvio_custodiaId_fkey"
      FOREIGN KEY ("custodiaId") REFERENCES "Custodia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,

  // ───── Fase 2: el celular del custodio (2026-11-24) ─────

  // Días que dura el enlace de fotos que se manda al cliente.
  `ALTER TABLE "CustodiaConfig" ADD COLUMN IF NOT EXISTS "diasEnlaceFotos" INTEGER NOT NULL DEFAULT 90`,

  // Celulares de la empresa vinculados con un código de un solo uso; solo se guarda el hash de su token.
  `CREATE TABLE IF NOT EXISTS "CustodiaDispositivo" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "creadoPor" INTEGER,
    "creadoEn" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "ultimoUso" TIMESTAMPTZ,
    "revocadoEn" TIMESTAMPTZ,
    "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoHasta" TIMESTAMPTZ,
    CONSTRAINT "CustodiaDispositivo_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CustodiaDispositivo_tokenHash_key" ON "CustodiaDispositivo"("tokenHash")`,
  `CREATE INDEX IF NOT EXISTS "CustodiaDispositivo_companyId_idx" ON "CustodiaDispositivo"("companyId")`,

  `CREATE TABLE IF NOT EXISTS "CustodiaDispositivoCodigo" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMPTZ NOT NULL,
    "creadoPor" INTEGER,
    CONSTRAINT "CustodiaDispositivoCodigo_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CustodiaDispositivoCodigo_codigoHash_key" ON "CustodiaDispositivoCodigo"("codigoHash")`,

  // PIN de 4 dígitos de cada persona (scrypt con sal, formato «sal:hash»).
  `CREATE TABLE IF NOT EXISTS "CustodiaPin" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "cedula" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "creadoPor" INTEGER,
    "creadoEn" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "actualizadoEn" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "CustodiaPin_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CustodiaPin_companyId_cedula_key" ON "CustodiaPin"("companyId", "cedula")`,

  // Sesión de una persona en un celular, sobre un viaje.
  `CREATE TABLE IF NOT EXISTS "CustodiaSesion" (
    "id" SERIAL NOT NULL,
    "custodiaId" INTEGER NOT NULL,
    "dispositivoId" INTEGER NOT NULL,
    "cedula" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "creadaEn" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "cerradaEn" TIMESTAMPTZ,
    CONSTRAINT "CustodiaSesion_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CustodiaSesion_tokenHash_key" ON "CustodiaSesion"("tokenHash")`,
  `CREATE INDEX IF NOT EXISTS "CustodiaSesion_dispositivoId_idx" ON "CustodiaSesion"("dispositivoId")`,
  `DO $$ BEGIN
    ALTER TABLE "CustodiaSesion" ADD CONSTRAINT "CustodiaSesion_custodiaId_fkey"
      FOREIGN KEY ("custodiaId") REFERENCES "Custodia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,

  // Lo que pasa en el recorrido: salida, puntos, novedades y llegada. `clientUuid` hace el envío idempotente.
  `CREATE TABLE IF NOT EXISTS "CustodiaEvento" (
    "id" SERIAL NOT NULL,
    "custodiaId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "puntoId" INTEGER,
    "puntoNombre" TEXT,
    "novedadTipo" TEXT,
    "texto" TEXT,
    "ocurridoEn" TIMESTAMPTZ NOT NULL,
    "recibidoEn" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "precisionM" DOUBLE PRECISION,
    "autorCedula" TEXT,
    "autorNombre" TEXT,
    "dispositivoId" INTEGER,
    CONSTRAINT "CustodiaEvento_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CustodiaEvento_clientUuid_key" ON "CustodiaEvento"("clientUuid")`,
  `CREATE INDEX IF NOT EXISTS "CustodiaEvento_custodiaId_idx" ON "CustodiaEvento"("custodiaId")`,
  `DO $$ BEGIN
    ALTER TABLE "CustodiaEvento" ADD CONSTRAINT "CustodiaEvento_custodiaId_fkey"
      FOREIGN KEY ("custodiaId") REFERENCES "Custodia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,

  // Fotos: el archivo vive en el almacenamiento (nube o base local), aquí solo su clave.
  `CREATE TABLE IF NOT EXISTS "CustodiaFoto" (
    "id" SERIAL NOT NULL,
    "custodiaId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "momento" TEXT NOT NULL,
    "puntoId" INTEGER,
    "eventoUuid" TEXT,
    "etiqueta" TEXT,
    "comentario" TEXT,
    "claveArchivo" TEXT NOT NULL,
    "claveMiniatura" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "bytesMiniatura" INTEGER NOT NULL,
    "tomadaEn" TIMESTAMPTZ NOT NULL,
    "recibidaEn" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "precisionM" DOUBLE PRECISION,
    "autorCedula" TEXT,
    "autorNombre" TEXT,
    "dispositivoId" INTEGER,
    "borradaEn" TIMESTAMPTZ,
    CONSTRAINT "CustodiaFoto_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CustodiaFoto_clientUuid_key" ON "CustodiaFoto"("clientUuid")`,
  `CREATE INDEX IF NOT EXISTS "CustodiaFoto_custodiaId_idx" ON "CustodiaFoto"("custodiaId")`,
  `DO $$ BEGIN
    ALTER TABLE "CustodiaFoto" ADD CONSTRAINT "CustodiaFoto_custodiaId_fkey"
      FOREIGN KEY ("custodiaId") REFERENCES "Custodia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,

  // Firmas de entrega y recepción: una por momento (la nueva reemplaza a la anterior). No se borran en la limpieza.
  `CREATE TABLE IF NOT EXISTS "CustodiaFirma" (
    "id" SERIAL NOT NULL,
    "custodiaId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "momento" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cedula" TEXT NOT NULL DEFAULT '',
    "claveImagen" TEXT NOT NULL,
    "firmadaEn" TIMESTAMPTZ NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "autorCedula" TEXT,
    "autorNombre" TEXT,
    "dispositivoId" INTEGER,
    CONSTRAINT "CustodiaFirma_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CustodiaFirma_clientUuid_key" ON "CustodiaFirma"("clientUuid")`,
  `CREATE INDEX IF NOT EXISTS "CustodiaFirma_custodiaId_idx" ON "CustodiaFirma"("custodiaId")`,
  `DO $$ BEGIN
    ALTER TABLE "CustodiaFirma" ADD CONSTRAINT "CustodiaFirma_custodiaId_fkey"
      FOREIGN KEY ("custodiaId") REFERENCES "Custodia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,

  // Enlace público con las fotos del recorrido que se manda al cliente en el correo (solo se guarda el hash).
  `CREATE TABLE IF NOT EXISTS "CustodiaEnlaceFotos" (
    "id" SERIAL NOT NULL,
    "custodiaId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMPTZ NOT NULL,
    "creadoEn" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "desactivadoEn" TIMESTAMPTZ,
    CONSTRAINT "CustodiaEnlaceFotos_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CustodiaEnlaceFotos_tokenHash_key" ON "CustodiaEnlaceFotos"("tokenHash")`,
  `CREATE INDEX IF NOT EXISTS "CustodiaEnlaceFotos_custodiaId_idx" ON "CustodiaEnlaceFotos"("custodiaId")`,
  `DO $$ BEGIN
    ALTER TABLE "CustodiaEnlaceFotos" ADD CONSTRAINT "CustodiaEnlaceFotos_custodiaId_fkey"
      FOREIGN KEY ("custodiaId") REFERENCES "Custodia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,

  // ───── Fotos desde la galería, fotos pedidas configurables y observaciones del custodio (2026-11-24) ─────

  // Qué fotos se piden al salir y al llegar, por tipo de servicio. Nulo = lo de por defecto (ver custodias-fotos-pedidas.util.ts).
  `ALTER TABLE "CustodiaConfig" ADD COLUMN IF NOT EXISTS "fotosPedidas" JSONB`,
  // De dónde salió cada foto: CAMARA o GALERIA. Nulo en las fotos anteriores (se tomaron con la cámara).
  `ALTER TABLE "CustodiaFoto" ADD COLUMN IF NOT EXISTS "origen" TEXT`,
];
