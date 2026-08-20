-- 돌발작업 묶음 키 — 한 번의 요청으로 여러 도면을 등록할 때 같은 값을 공유한다.
-- 작업일보는 UrgentWork 1건 = 절단 1건으로 다루므로 도면마다 행을 만들되,
-- "같은 요청에서 나왔다"는 사실은 이 컬럼으로 남긴다.
ALTER TABLE "UrgentWork" ADD COLUMN "batchNo" TEXT;
CREATE INDEX "UrgentWork_batchNo_idx" ON "UrgentWork"("batchNo");

-- 기존 행은 자기 자신이 묶음의 유일한 건이다.
UPDATE "UrgentWork" SET "batchNo" = "urgentNo" WHERE "batchNo" IS NULL;
