-- 용차사용대장 자동등록 기반
--
-- 지금은 외부출고관리에 차량·운전자·납품처·자재가 다 있는데도 대장을 손으로 다시 적는다.
-- 출고장 목록에서 용차분을 골라 일괄 등록할 수 있게 하고, 금액은 단가표로 자동 계산한다.

-- 대장 ↔ 출고 송장 연결 (자동등록 출처 + 중복 방지 + 출고취소 시 정리 근거)
ALTER TABLE "CharterUsage" ADD COLUMN "shipmentVehicleId" TEXT;
ALTER TABLE "CharterUsage" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "CharterUsage_shipmentVehicleId_key" ON "CharterUsage"("shipmentVehicleId");
CREATE INDEX "CharterUsage_date_idx" ON "CharterUsage"("date");
ALTER TABLE "CharterUsage" ADD CONSTRAINT "CharterUsage_shipmentVehicleId_fkey"
  FOREIGN KEY ("shipmentVehicleId") REFERENCES "ShipmentVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 납품처별 기본단가 (진교 출발 기준)
CREATE TABLE "CharterRate" (
  "id"           TEXT NOT NULL,
  "deliveryName" TEXT NOT NULL,
  "region"       TEXT,
  "baseCost"     INTEGER NOT NULL,
  "memo"         TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CharterRate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CharterRate_deliveryName_key" ON "CharterRate"("deliveryName");

-- 폭 구간별 할증
CREATE TABLE "CharterSurcharge" (
  "id"        TEXT NOT NULL,
  "minWidth"  INTEGER NOT NULL,
  "maxWidth"  INTEGER,
  "amount"    INTEGER NOT NULL,
  "label"     TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CharterSurcharge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CharterSurcharge_sortOrder_idx" ON "CharterSurcharge"("sortOrder");
