-- 운송 운전자 마스터 (일반차량 / 용차) 추가
-- 차량운행일지 driver / 용차사용 driverName 자동완성 소스
-- 기존 string 컬럼과 FK 연결 없음 (자유 입력 + 자동완성 선택)

CREATE TYPE "TransportDriverType" AS ENUM ('REGULAR', 'CHARTER');

CREATE TABLE "TransportDriver" (
    "id" TEXT NOT NULL,
    "type" "TransportDriverType" NOT NULL,
    "name" TEXT NOT NULL,
    "vehicleNo" TEXT,
    "phoneNo" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportDriver_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransportDriver_type_name_key" ON "TransportDriver"("type", "name");
CREATE INDEX "TransportDriver_type_idx" ON "TransportDriver"("type");
