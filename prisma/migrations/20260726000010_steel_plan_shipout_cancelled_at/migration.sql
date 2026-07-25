-- 출고취소 후 선별 유지된 강재 표시 (shipoutLabel 변형 대신 별도 필드 — 라벨은 강재매칭 귀속 키)
ALTER TABLE "SteelPlan" ADD COLUMN "shipoutCancelledAt" TIMESTAMP(3);
