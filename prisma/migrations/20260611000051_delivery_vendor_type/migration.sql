-- DeliveryVendor 에 거래처 종류(공급처/납품처) 추가
-- 기존 데이터는 모두 DELIVERY(납품처) 로 마이그레이션

CREATE TYPE "DeliveryVendorType" AS ENUM ('SUPPLIER', 'DELIVERY');

ALTER TABLE "DeliveryVendor"
  ADD COLUMN "vendorType" "DeliveryVendorType" NOT NULL DEFAULT 'DELIVERY';

CREATE INDEX "DeliveryVendor_vendorType_idx" ON "DeliveryVendor"("vendorType");
