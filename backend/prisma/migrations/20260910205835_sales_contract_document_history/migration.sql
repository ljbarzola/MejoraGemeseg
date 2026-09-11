-- CreateTable
CREATE TABLE "SalesContractDocument" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesContractDocument_contractId_idx" ON "SalesContractDocument"("contractId");

-- AddForeignKey
ALTER TABLE "SalesContractDocument" ADD CONSTRAINT "SalesContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "SalesContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
