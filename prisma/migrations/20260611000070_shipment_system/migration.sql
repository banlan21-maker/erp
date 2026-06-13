-- 강재 외부 출고 시스템
-- SteelPlanStatus 에 SHIPPED_OUT 추가
-- SteelPlanHeatStatus 에 SHIPPED 추가
-- ShipmentStatus enum 신규
-- Shipment / ShipmentVehicle / ShipmentItem 모델 신규
-- SteelPlanHeat 에 shippedAt, autoCreatedFromShipment 컬럼 + 인덱스 추가

ALTER TYPE "SteelPlanStatus"     ADD VALUE 'SHIPPED_OUT';
ALTER TYPE "SteelPlanHeatStatus" ADD VALUE 'SHIPPED';

CREATE TYPE "ShipmentStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- SteelPlanHeat 확장
ALTER TABLE "SteelPlanHeat"
  ADD COLUMN "shippedAt" TIMESTAMP(3),
  ADD COLUMN "autoCreatedFromShipment" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "SteelPlanHeat_heatNo_idx" ON "SteelPlanHeat"("heatNo");
CREATE INDEX "SteelPlanHeat_vesselCode_material_thickness_width_length_idx"
  ON "SteelPlanHeat"("vesselCode", "material", "thickness", "width", "length");

-- Shipment
CREATE TABLE "Shipment" (
    "id"           TEXT NOT NULL,
    "shipmentNo"   TEXT NOT NULL,
    "shippedAt"    TIMESTAMP(3) NOT NULL,
    "status"       "ShipmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt"  TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdBy"    TEXT,
    "memo"         TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Shipment_shipmentNo_key" ON "Shipment"("shipmentNo");
CREATE INDEX "Shipment_shippedAt_idx" ON "Shipment"("shippedAt");
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- ShipmentVehicle
CREATE TABLE "ShipmentVehicle" (
    "id"               TEXT NOT NULL,
    "shipmentId"       TEXT NOT NULL,
    "sequence"         INTEGER NOT NULL,
    "vehicleNo"        TEXT NOT NULL,
    "driverName"       TEXT,
    "driverPhone"      TEXT,
    "loadLimit"        DOUBLE PRECISION,
    "totalWeight"      DOUBLE PRECISION,
    "supplierId"       TEXT,
    "supplierSnapshot" JSONB,
    "deliveryId"       TEXT,
    "deliverySnapshot" JSONB,
    "invoiceNo"        TEXT,
    "invoicedAt"       TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentVehicle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShipmentVehicle_invoiceNo_key" ON "ShipmentVehicle"("invoiceNo");
CREATE INDEX "ShipmentVehicle_shipmentId_idx" ON "ShipmentVehicle"("shipmentId");
ALTER TABLE "ShipmentVehicle"
  ADD CONSTRAINT "ShipmentVehicle_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ShipmentItem
CREATE TABLE "ShipmentItem" (
    "id"              TEXT NOT NULL,
    "vehicleId"       TEXT NOT NULL,
    "steelPlanId"     TEXT NOT NULL,
    "steelPlanHeatId" TEXT,
    "vesselCode"      TEXT NOT NULL,
    "material"        TEXT NOT NULL,
    "thickness"       DOUBLE PRECISION NOT NULL,
    "width"           DOUBLE PRECISION NOT NULL,
    "length"          DOUBLE PRECISION NOT NULL,
    "weight"          DOUBLE PRECISION NOT NULL,
    "heatNo"          TEXT,
    "manualHeatNo"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShipmentItem_steelPlanId_key" ON "ShipmentItem"("steelPlanId");
CREATE INDEX "ShipmentItem_vehicleId_idx" ON "ShipmentItem"("vehicleId");
CREATE INDEX "ShipmentItem_steelPlanHeatId_idx" ON "ShipmentItem"("steelPlanHeatId");
ALTER TABLE "ShipmentItem"
  ADD CONSTRAINT "ShipmentItem_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "ShipmentVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShipmentItem"
  ADD CONSTRAINT "ShipmentItem_steelPlanId_fkey"
  FOREIGN KEY ("steelPlanId") REFERENCES "SteelPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentItem"
  ADD CONSTRAINT "ShipmentItem_steelPlanHeatId_fkey"
  FOREIGN KEY ("steelPlanHeatId") REFERENCES "SteelPlanHeat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
