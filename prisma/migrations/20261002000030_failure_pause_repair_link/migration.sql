-- 작업일보 장비고장 정지 ↔ 장비관리 수선이력 연결 (2026-10-02)
ALTER TABLE "Equipment" ADD COLUMN "mgmtEquipmentId" TEXT;
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_mgmtEquipmentId_fkey"
  FOREIGN KEY ("mgmtEquipmentId") REFERENCES "MgmtEquipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CuttingPause" ADD COLUMN "repairLogId" TEXT;
ALTER TABLE "CuttingPause" ADD COLUMN "repairDismissedAt" TIMESTAMP(3);
ALTER TABLE "CuttingPause" ADD CONSTRAINT "CuttingPause_repairLogId_fkey"
  FOREIGN KEY ("repairLogId") REFERENCES "MgmtRepairLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 현장 장비 ↔ 장비관리 장비: "플라즈마 N호기" ↔ "CNC 플라즈마 N호기" (가스 절단기는 장비관리에 없음)
UPDATE "Equipment" e SET "mgmtEquipmentId" = m."id"
  FROM "MgmtEquipment" m
 WHERE m."name" = 'CNC ' || e."name";
