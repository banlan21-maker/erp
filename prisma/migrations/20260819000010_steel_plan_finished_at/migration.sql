-- 강재 '실제 종료일' — 절단완료일 또는 외부출고일.
--
-- 왜 issuedAt 으로는 안 되나: issuedAt 은 '절단장 투입일'이고,
-- 절단완료 처리는 이미 값이 있으면 덮어쓰지 않는다(lib/cutting-complete.ts).
-- 그래서 투입된 철판은 투입일이 남아, 판번호(cutAt=절단완료일)와 축이 달라진다.
-- 아카이브 판정이 두 목록에서 어긋나던 원인(2·3개월 기준 66·106건 격차).
ALTER TABLE "SteelPlan" ADD COLUMN "finishedAt" TIMESTAMP(3);

-- 아카이브 대상 판정 (status + finishedAt + archivedAt)
CREATE INDEX "SteelPlan_finishedAt_idx" ON "SteelPlan"("finishedAt");
