-- AlterTable: 법인카드 사용대장 구분(사무실/현장) 컬럼 추가
ALTER TABLE "CardUsage" ADD COLUMN "category" TEXT;
