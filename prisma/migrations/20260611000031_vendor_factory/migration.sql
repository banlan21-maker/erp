-- Vendor 에 담당공장(factory) 컬럼 추가
-- 값: '진교' | '진동' | '공용' — 진교/진동 두 공장 중 주로 사용하는 곳, 둘 다면 '공용'
-- 기본값 '공용' 으로 기존 거래처 일괄 초기화 (관리자가 추후 개별 변경)

ALTER TABLE "Vendor" ADD COLUMN "factory" TEXT NOT NULL DEFAULT '공용';
