-- 입출고 이력의 성격 구분 — 실제 매입·사용 vs 재고 맞추기
--
-- 지금은 재고 조정과 품목 등록 시 초기재고가 입고/출고 이력으로 기록돼
-- 월별 통계의 '매입량·사용량' 에 그대로 합산된다.
-- 실측(2026-08-21): 4월 입고의 9% · 7월 4% · 8월은 100% 가 조정분이었다.
CREATE TYPE "SupplyMoveKind" AS ENUM ('NORMAL', 'ADJUST', 'INITIAL');

ALTER TABLE "SupplyInbound"  ADD COLUMN "kind" "SupplyMoveKind" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "SupplyOutbound" ADD COLUMN "kind" "SupplyMoveKind" NOT NULL DEFAULT 'NORMAL';

-- 기존 데이터 소급 — 담당자/사용자 칸에 성격이 적혀 있다
UPDATE "SupplyInbound"  SET "kind" = 'INITIAL' WHERE "receivedBy" IN ('초기재고', '초기재고보정');
UPDATE "SupplyInbound"  SET "kind" = 'ADJUST'  WHERE "receivedBy" = '재고조정';
UPDATE "SupplyOutbound" SET "kind" = 'INITIAL' WHERE "usedBy"     IN ('초기재고', '초기재고보정');
UPDATE "SupplyOutbound" SET "kind" = 'ADJUST'  WHERE "usedBy"     = '재고조정';

CREATE INDEX "SupplyInbound_kind_idx"  ON "SupplyInbound"("kind");
CREATE INDEX "SupplyOutbound_kind_idx" ON "SupplyOutbound"("kind");
