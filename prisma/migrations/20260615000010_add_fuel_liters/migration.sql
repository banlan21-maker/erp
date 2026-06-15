-- 차량운행일지: 유류비(금액) → 주유량(리터) 입력으로 전환
-- 기존 fuelCost(원) 컬럼은 보존하고, 신규 fuelLiters(L, 소수 허용) 컬럼 추가
ALTER TABLE "TransportDrivingLog" ADD COLUMN "fuelLiters" DOUBLE PRECISION;
