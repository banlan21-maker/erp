-- 잔재 외부출고 선별: 선별목록(출고 예약 풀)에 추가되면 마킹. status 는 그대로(되돌리기 가능).
ALTER TABLE "Remnant" ADD COLUMN "shipoutMarkedAt" TIMESTAMP(3);

-- ShipmentItem: 원판(SteelPlan) 전용 → 잔재(Remnant)도 출고 가능하게 확장
--   steelPlanId 를 nullable 로, remnantId 추가 (정확히 한쪽만 채워짐)
ALTER TABLE "ShipmentItem" ALTER COLUMN "steelPlanId" DROP NOT NULL;
ALTER TABLE "ShipmentItem" ADD COLUMN "remnantId" TEXT;
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_remnantId_fkey" FOREIGN KEY ("remnantId") REFERENCES "Remnant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ShipmentItem_remnantId_idx" ON "ShipmentItem"("remnantId");
