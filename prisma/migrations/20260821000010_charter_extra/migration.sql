-- 용차 추가항목 — 가변기·슬라이드, 합짐처럼 자재 치수만으로는 판정할 수 없어
-- 사람이 골라야 하는 가산 금액. 대장에서 버튼으로 켜고 끄면 비용에 바로 반영된다.
CREATE TABLE "CharterExtra" (
  "id"        TEXT NOT NULL,
  "code"      TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "amount"    INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CharterExtra_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CharterExtra_code_key" ON "CharterExtra"("code");
CREATE INDEX "CharterExtra_sortOrder_idx" ON "CharterExtra"("sortOrder");

-- 대장 행마다 켜져 있는 추가항목 코드 (쉼표구분)
ALTER TABLE "CharterUsage" ADD COLUMN "extras" TEXT;

-- 기본값 — 받은 단가표 기준. 사용자가 단가표 화면에서 고칠 수 있다.
INSERT INTO "CharterExtra" ("id", "code", "label", "amount", "sortOrder", "updatedAt") VALUES
  ('chx_slide', 'SLIDE', '가변/슬라이드', 150000, 1, CURRENT_TIMESTAMP),
  ('chx_join1', 'JOIN1', '합짐1',          30000, 2, CURRENT_TIMESTAMP),
  ('chx_join2', 'JOIN2', '합짐2',          50000, 3, CURRENT_TIMESTAMP);
