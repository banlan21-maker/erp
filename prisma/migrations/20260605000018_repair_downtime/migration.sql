-- AlterTable: 수선이력에 비가동시간(분) 컬럼 추가
ALTER TABLE "MgmtRepairLog" ADD COLUMN "downtimeMinutes" INTEGER;
