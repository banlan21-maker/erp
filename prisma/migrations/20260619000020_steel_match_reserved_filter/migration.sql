-- 강재매칭: 확정정보 필터 옵션 (ANY=상관없이, NONE=확정정보 없는것만)
ALTER TABLE "SteelMatchJob" ADD COLUMN "reservedFilter" TEXT NOT NULL DEFAULT 'ANY';

-- 출고 마킹 확정정보 표시 라벨 (예: 매칭이름). null이면 호선코드로 대체
ALTER TABLE "SteelPlan" ADD COLUMN "shipoutLabel" TEXT;
