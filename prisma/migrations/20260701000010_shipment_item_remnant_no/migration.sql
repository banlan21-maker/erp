-- 거래명세표 "잔재번호" 컬럼: 잔재(여유원재/등록잔재/현장잔재) 출고 시 잔재번호 스냅샷
ALTER TABLE "ShipmentItem" ADD COLUMN "remnantNo" TEXT;
