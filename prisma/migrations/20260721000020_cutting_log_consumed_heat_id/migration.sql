-- 절단로그: 실제 소진한 판번호(SteelPlanHeat) id — 복원 정확도(selectedHeatId 충돌 시 형제 소진 대응)
ALTER TABLE "CuttingLog" ADD COLUMN "consumedHeatId" TEXT;
