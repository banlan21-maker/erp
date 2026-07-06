-- 기성관리 BOM 업로드: 원청별 열 매핑 + 라인 호선/블록
ALTER TABLE "BillingClient" ADD COLUMN "bomStartRow"  INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "BillingClient" ADD COLUMN "bomColHo"     TEXT NOT NULL DEFAULT 'A';
ALTER TABLE "BillingClient" ADD COLUMN "bomColBlock"  TEXT NOT NULL DEFAULT 'B';
ALTER TABLE "BillingClient" ADD COLUMN "bomColQty"    TEXT NOT NULL DEFAULT 'H';
ALTER TABLE "BillingClient" ADD COLUMN "bomColWeight" TEXT NOT NULL DEFAULT 'I';

ALTER TABLE "BillingItem" ADD COLUMN "hoNo"  TEXT;
ALTER TABLE "BillingItem" ADD COLUMN "block" TEXT;
