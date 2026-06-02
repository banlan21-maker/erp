-- AlterTable: 수선이력에 고장원인 컬럼 추가
ALTER TABLE "MgmtRepairLog" ADD COLUMN "cause" TEXT;

-- CreateTable: 수선 소모비용 라인 아이템
CREATE TABLE "MgmtRepairCost" (
    "id"        TEXT NOT NULL,
    "repairId"  TEXT NOT NULL,
    "itemName"  TEXT NOT NULL,
    "amount"    INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MgmtRepairCost_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MgmtRepairCost" ADD CONSTRAINT "MgmtRepairCost_repairId_fkey"
  FOREIGN KEY ("repairId") REFERENCES "MgmtRepairLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 기존 레거시 cost 값을 MgmtRepairCost로 이관 (단일 항목 '비용'으로)
INSERT INTO "MgmtRepairCost" ("id", "repairId", "itemName", "amount", "sortOrder", "createdAt")
SELECT
  'mig_' || "id",
  "id",
  '비용',
  "cost",
  0,
  CURRENT_TIMESTAMP
FROM "MgmtRepairLog"
WHERE "cost" IS NOT NULL AND "cost" > 0;
