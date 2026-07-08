-- 아카이브(숨김): 완료·출고된 오래된 강재/판번호를 활성 목록서 제외
ALTER TABLE "SteelPlan"     ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "SteelPlanHeat" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "SteelPlan_archivedAt_idx"     ON "SteelPlan"("archivedAt");
CREATE INDEX "SteelPlanHeat_archivedAt_idx" ON "SteelPlanHeat"("archivedAt");
