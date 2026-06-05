-- CuttingDrawingPreset: layoutMode → method 컬럼 교체
ALTER TABLE "CuttingDrawingPreset" DROP COLUMN IF EXISTS "layoutMode";
ALTER TABLE "CuttingDrawingPreset" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'TEXT';

-- CuttingDrawingExtraction (Phase B — 페이지별 추출 결과)
CREATE TABLE "CuttingDrawingExtraction" (
    "id"         TEXT NOT NULL,
    "pdfId"      TEXT NOT NULL,
    "presetId"   TEXT,
    "pageNumber" INTEGER NOT NULL,
    "drawingNo"  TEXT,
    "partWeight" DOUBLE PRECISION,
    "markingLen" DOUBLE PRECISION,
    "cuttingLen" DOUBLE PRECISION,
    "method"     TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "rawText"    TEXT,
    "notes"      TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuttingDrawingExtraction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CuttingDrawingExtraction_pdfId_pageNumber_key" ON "CuttingDrawingExtraction"("pdfId", "pageNumber");
CREATE INDEX "CuttingDrawingExtraction_pdfId_idx" ON "CuttingDrawingExtraction"("pdfId");

ALTER TABLE "CuttingDrawingExtraction"
  ADD CONSTRAINT "CuttingDrawingExtraction_pdfId_fkey"
  FOREIGN KEY ("pdfId") REFERENCES "CuttingDrawingPdf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CuttingDrawingExtraction"
  ADD CONSTRAINT "CuttingDrawingExtraction_presetId_fkey"
  FOREIGN KEY ("presetId") REFERENCES "CuttingDrawingPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 초기 프리셋 시드 3종 (UPSERT 대신 ON CONFLICT 사용 — 재실행 안전)
INSERT INTO "CuttingDrawingPreset" ("id", "name", "vendor", "description", "method", "rules", "createdAt", "updatedAt")
VALUES
  (
    'preset_hht_nesting',
    '한국조선기술 NESTING',
    '한국조선기술',
    'N/C NESTING PLAN — 사용중량(Kg) / Cut-Len(M) / Mark-Len(M)',
    'TEXT',
    '{
      "detectKeywords": ["사용중량(Kg)", "Cut-Len(M)", "Mark-Len(M)"],
      "drawingNo":  { "label": "DWG NO",      "valuePattern": "[A-Z0-9]+NC[A-Z]\\d+" },
      "partWeight": { "label": "사용중량(Kg)", "valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
      "markingLen": { "label": "Mark-Len(M)", "valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
      "cuttingLen": { "label": "Cut-Len(M)",  "valuePattern": "[0-9]+(?:\\.[0-9]+)?" }
    }'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'preset_nc_part_weight',
    'NC 가공도 (PART WEIGHT)',
    NULL,
    'OCR — PART WEIGHT / CUTTING LEN / MARKING LEN',
    'OCR',
    '{
      "detectKeywords": ["PART WEIGHT", "CUTTING LEN", "MARKING LEN"],
      "drawingNo":  { "label": "DWG",          "valuePattern": "[A-Z]{2,}[A-Z0-9-]*\\d+" },
      "partWeight": { "label": "PART WEIGHT",  "valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
      "markingLen": { "label": "MARKING LEN",  "valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
      "cuttingLen": { "label": "CUTTING LEN",  "valuePattern": "[0-9]+(?:\\.[0-9]+)?" }
    }'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'preset_nc_total_part_weight',
    'NC 가공도 (TOTAL PART WEIGHT)',
    NULL,
    'OCR — TOTAL PART WEIGHT / CUTTING LEN / MARKING LEN',
    'OCR',
    '{
      "detectKeywords": ["TOTAL PART WEIGHT", "CUTTING LEN", "MARKING LEN"],
      "drawingNo":  { "label": "DWG",                "valuePattern": "[A-Z]{2,}[A-Z0-9-]*\\d+" },
      "partWeight": { "label": "TOTAL PART WEIGHT",  "valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
      "markingLen": { "label": "MARKING LEN",        "valuePattern": "[0-9]+(?:\\.[0-9]+)?" },
      "cuttingLen": { "label": "CUTTING LEN",        "valuePattern": "[0-9]+(?:\\.[0-9]+)?" }
    }'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
ON CONFLICT ("id") DO NOTHING;
