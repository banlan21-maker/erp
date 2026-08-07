-- 삼각형 잔재: 형태 enum + 실측 세 변 컬럼 (width1/length1 에는 외접 사각형이 저장됨)
ALTER TYPE "RemnantShape" ADD VALUE IF NOT EXISTS 'TRIANGLE';
ALTER TABLE "Remnant" ADD COLUMN "sideA" DOUBLE PRECISION;
ALTER TABLE "Remnant" ADD COLUMN "sideB" DOUBLE PRECISION;
ALTER TABLE "Remnant" ADD COLUMN "sideC" DOUBLE PRECISION;
