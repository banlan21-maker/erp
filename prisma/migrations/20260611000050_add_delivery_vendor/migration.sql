-- 절단파트 납품처(고객) 마스터
-- 절단·가공부재 납품받는 거래처. 출고장/거래명세표 자동출력 데이터 소스.
-- 자재거래처(Vendor) 와는 별도 (매출 측).

CREATE TABLE "DeliveryVendor" (
    "id"                  TEXT NOT NULL,
    "bizNo"               TEXT,
    "name"                TEXT NOT NULL,
    "ceo"                 TEXT,
    "address"             TEXT,
    "bizType"             TEXT,
    "bizItem"             TEXT,
    "phone"               TEXT,
    "fax"                 TEXT,
    "contactName"         TEXT,
    "contactPhone"        TEXT,
    "memo"                TEXT,
    "bizCertStoredName"   TEXT,
    "bizCertOriginalName" TEXT,
    "bizCertMimeType"     TEXT,
    "bizCertSize"         INTEGER,
    "isActive"            BOOLEAN NOT NULL DEFAULT true,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryVendor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryVendor_name_idx" ON "DeliveryVendor"("name");
