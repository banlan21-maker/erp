-- ShipmentItem.steelPlanId 의 @unique 제약 제거
-- 이유: 출고 취소 시 ShipmentItem 보존 정책. unique 가 있으면 한 번 출고됐다 취소된 자재를 재출고할 수 없음.
-- 활성 출고장(ACTIVE)에서의 유일성은 application 레벨에서 강제 (POST /api/shipments 가드)

DROP INDEX IF EXISTS "ShipmentItem_steelPlanId_key";

-- 일반 인덱스로 대체 (조회 성능 유지)
CREATE INDEX IF NOT EXISTS "ShipmentItem_steelPlanId_idx" ON "ShipmentItem"("steelPlanId");
