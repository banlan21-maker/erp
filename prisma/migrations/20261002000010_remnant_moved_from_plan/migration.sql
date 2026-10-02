-- 프로젝트 강재 → 여유원재 이동 시 원래 강재·판번호 스냅샷 (되돌리기용)
ALTER TABLE "Remnant" ADD COLUMN "movedFromPlan" JSONB;
