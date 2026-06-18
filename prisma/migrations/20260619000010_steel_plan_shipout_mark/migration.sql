-- 강재 외부출고 선별 확정 마킹 (출고등록 — 판번호 확인 후 선별지시서 출력 시 확정정보 "출고" 표시)
ALTER TABLE "SteelPlan" ADD COLUMN "shipoutMarkedAt" TIMESTAMP(3);
ALTER TABLE "SteelPlan" ADD COLUMN "shipoutHeatNo" TEXT;

-- 출고등록 판번호 매칭 조회 성능 (사양+상태 복합 인덱스)
CREATE INDEX "SteelPlan_vesselCode_material_status_thickness_width_length_idx" ON "SteelPlan"("vesselCode", "material", "status", "thickness", "width", "length");
