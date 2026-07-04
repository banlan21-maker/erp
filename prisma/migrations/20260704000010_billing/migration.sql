-- 기성관리 (원청 대금 청구)
CREATE TYPE "BillingRateMode" AS ENUM ('BLOCK', 'FLAT');
CREATE TYPE "BillingUnit" AS ENUM ('TON', 'KG');
CREATE TYPE "BillingStatus" AS ENUM ('DRAFT', 'ISSUED');
CREATE TYPE "BillingItemCategory" AS ENUM ('MAIN', 'ADDON', 'TRANSPORT', 'ETC');

CREATE TABLE "BillingClient" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "bizNo"       TEXT,
  "ceo"         TEXT,
  "address"     TEXT,
  "bizType"     TEXT,
  "bizItem"     TEXT,
  "phone"       TEXT,
  "unit"        "BillingUnit" NOT NULL DEFAULT 'TON',
  "rateMode"    "BillingRateMode" NOT NULL DEFAULT 'BLOCK',
  "defaultRate" DOUBLE PRECISION,
  "addCutRate"  DOUBLE PRECISION,
  "memo"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingClient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingStatement" (
  "id"             TEXT NOT NULL,
  "clientId"       TEXT NOT NULL,
  "ym"             TEXT NOT NULL,
  "title"          TEXT,
  "status"         "BillingStatus" NOT NULL DEFAULT 'DRAFT',
  "clientSnapshot" JSONB,
  "supplyAmount"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "vat"            DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "prevBalance"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "deposit"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "balance"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "memo"           TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingStatement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingItem" (
  "id"          TEXT NOT NULL,
  "statementId" TEXT NOT NULL,
  "category"    "BillingItemCategory" NOT NULL DEFAULT 'MAIN',
  "itemDate"    TEXT,
  "description" TEXT NOT NULL,
  "qty"         DOUBLE PRECISION,
  "weight"      DOUBLE PRECISION,
  "unitPrice"   DOUBLE PRECISION,
  "amount"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "vatAmount"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "BillingItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingStatement_clientId_ym_idx" ON "BillingStatement"("clientId", "ym");
CREATE INDEX "BillingStatement_ym_idx" ON "BillingStatement"("ym");
CREATE INDEX "BillingItem_statementId_idx" ON "BillingItem"("statementId");

ALTER TABLE "BillingStatement" ADD CONSTRAINT "BillingStatement_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "BillingClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingItem" ADD CONSTRAINT "BillingItem_statementId_fkey"
  FOREIGN KEY ("statementId") REFERENCES "BillingStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
