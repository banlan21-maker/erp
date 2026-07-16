-- N20 대응: ShipmentItem.originStorageLocation 추가
-- 출고 확정 시 원판 보관위치 스냅샷. 취소 시 SteelPlan.storageLocation 로 복원.

ALTER TABLE "ShipmentItem"
  ADD COLUMN IF NOT EXISTS "originStorageLocation" TEXT;
