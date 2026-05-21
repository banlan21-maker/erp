-- CreateTable
CREATE TABLE "GasFacilityCheck" (
    "id"          TEXT NOT NULL,
    "date"        TEXT NOT NULL,
    "time"        TEXT NOT NULL,
    "o2Pressure"  DOUBLE PRECISION,
    "o2Charge"    DOUBLE PRECISION,
    "lpgPressure" DOUBLE PRECISION,
    "lpgCharge"   DOUBLE PRECISION,
    "co2Pressure" DOUBLE PRECISION,
    "co2Charge"   DOUBLE PRECISION,
    "memo"        TEXT,
    "recordedBy"  TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GasFacilityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompressorCheck" (
    "id"         TEXT NOT NULL,
    "date"       TEXT NOT NULL,
    "time"       TEXT NOT NULL,
    "runtime1"   DOUBLE PRECISION,
    "runtime2"   DOUBLE PRECISION,
    "runtime3"   DOUBLE PRECISION,
    "pressure1"  DOUBLE PRECISION,
    "pressure2"  DOUBLE PRECISION,
    "pressure3"  DOUBLE PRECISION,
    "temp1"      DOUBLE PRECISION,
    "temp2"      DOUBLE PRECISION,
    "temp3"      DOUBLE PRECISION,
    "visual1"    TEXT,
    "visual2"    TEXT,
    "visual3"    TEXT,
    "memo"       TEXT,
    "recordedBy" TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompressorCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GasFacilityCheck_date_idx" ON "GasFacilityCheck"("date");

-- CreateIndex
CREATE INDEX "CompressorCheck_date_idx" ON "CompressorCheck"("date");
