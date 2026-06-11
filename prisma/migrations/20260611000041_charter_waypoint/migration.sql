-- 용차사용에 경유지 컬럼 추가 (출발지·도착지 사이 중간 경유 1곳 선택입력)
ALTER TABLE "CharterUsage" ADD COLUMN "waypoint" TEXT;
