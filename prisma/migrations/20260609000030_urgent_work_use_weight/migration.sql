-- UrgentWork 모델에 사용중량(useWeight) 필드 추가
-- 돌발작업 등록 시 예상 절단 사용량을 입력받기 위함.
-- 작업일보관리 및 절단보고서에서 부재 사용중량 표시·집계용.

ALTER TABLE "UrgentWork" ADD COLUMN "useWeight" DOUBLE PRECISION;
