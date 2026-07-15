-- I1 대응: ShipmentItem.originShipoutLabel 추가
-- 현장직접출고로 담을 때 원 자재가 사무실 선별(SteelPlan.shipoutLabel) 되어 있었다면
-- 그 라벨을 스냅샷으로 보존. 출고 확정 후 SteelPlan.shipoutLabel 은 null 로
-- 정리되지만 이 스냅샷으로 "원래 어느 선별 작업 자재였는지" 사후 추적 가능.

ALTER TABLE "ShipmentItem"
  ADD COLUMN IF NOT EXISTS "originShipoutLabel" TEXT;
