-- CuttingLog 테이블에 컬럼 추가 (drawingListId, width, length, qty, drawingNo)
-- porNo를 NOT NULL로 변경

ALTER TABLE "CuttingLog"
  ADD COLUMN IF NOT EXISTS "drawingListId" TEXT,
  ADD COLUMN IF NOT EXISTS "width"         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "length"        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "qty"           INTEGER,
  ADD COLUMN IF NOT EXISTS "drawingNo"     TEXT;

-- porNo NOT NULL (기존 NULL 값을 빈 문자열로 치환 후 변경)
UPDATE "CuttingLog" SET "porNo" = '' WHERE "porNo" IS NULL;
ALTER TABLE "CuttingLog" ALTER COLUMN "porNo" SET NOT NULL;

-- DrawingList → CuttingLog 관계
ALTER TABLE "CuttingLog"
  ADD CONSTRAINT "CuttingLog_drawingListId_fkey"
  FOREIGN KEY ("drawingListId") REFERENCES "DrawingList"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
