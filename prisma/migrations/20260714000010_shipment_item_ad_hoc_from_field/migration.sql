-- ShipmentItem.adHocFromField 추가
-- 현장(/field/shipout - 현장직접출고 탭) 에서 사무실 선별지시서 없이
-- 즉시 담아 출고된 자재임을 표시하는 감사 태그. 흐름 자체에는 영향 없음.

ALTER TABLE "ShipmentItem"
  ADD COLUMN IF NOT EXISTS "adHocFromField" BOOLEAN NOT NULL DEFAULT false;
