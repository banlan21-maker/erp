-- DrawingList: 절단도면 PDF 추출용 필드 추가
ALTER TABLE "DrawingList" ADD COLUMN "cutLength"     DOUBLE PRECISION;
ALTER TABLE "DrawingList" ADD COLUMN "markingLength" DOUBLE PRECISION;
ALTER TABLE "DrawingList" ADD COLUMN "sourcePdfId"   TEXT;
ALTER TABLE "DrawingList" ADD COLUMN "sourcePdfPage" INTEGER;

-- CuttingDrawingPreset (Phase B)
CREATE TABLE "CuttingDrawingPreset" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "vendor"      TEXT,
    "description" TEXT,
    "layoutMode"  TEXT NOT NULL DEFAULT 'SINGLE',
    "rules"       JSONB NOT NULL,
    "sampleUrl"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuttingDrawingPreset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CuttingDrawingPreset_name_key" ON "CuttingDrawingPreset"("name");

-- CuttingDrawingPdf (Phase A)
CREATE TABLE "CuttingDrawingPdf" (
    "id"         TEXT NOT NULL,
    "projectId"  TEXT NOT NULL,
    "block"      TEXT,
    "filename"   TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "pageCount"  INTEGER NOT NULL DEFAULT 1,
    "fileSize"   INTEGER NOT NULL,
    "presetId"   TEXT,
    "extracted"  JSONB,
    "uploadedBy" TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuttingDrawingPdf_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CuttingDrawingPdf_projectId_block_idx" ON "CuttingDrawingPdf"("projectId", "block");

ALTER TABLE "CuttingDrawingPdf"
  ADD CONSTRAINT "CuttingDrawingPdf_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CuttingDrawingPdf"
  ADD CONSTRAINT "CuttingDrawingPdf_presetId_fkey"
  FOREIGN KEY ("presetId") REFERENCES "CuttingDrawingPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
