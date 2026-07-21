-- 절단로그: 현장에서 고른 판번호(SteelPlanHeat) id 보존 — 완료 시 글자대조 없이 정확 소진
ALTER TABLE "CuttingLog" ADD COLUMN "selectedHeatId" TEXT;
