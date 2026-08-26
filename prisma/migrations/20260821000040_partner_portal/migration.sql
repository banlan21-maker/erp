-- 협력 설계업체 공유 링크 — 여유원재 현황을 외부에서 보고 선점·사용기록을 남긴다.
-- 엑셀을 주고받다 없는 철판에 네스팅하거나 있는 철판을 안 쓰는 일을 막는다.
CREATE TYPE "PartnerClaimStatus" AS ENUM ('RESERVED', 'USED', 'RELEASED');

CREATE TABLE "PartnerPortal" (
  "id"        TEXT NOT NULL,
  "token"     TEXT NOT NULL,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "memo"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "PartnerPortal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerPortal_token_key" ON "PartnerPortal"("token");
CREATE INDEX "PartnerPortal_active_idx" ON "PartnerPortal"("active");

CREATE TABLE "PartnerVendor" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "memo"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerVendor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerVendor_name_key" ON "PartnerVendor"("name");

CREATE TABLE "PartnerClaim" (
  "id"         TEXT NOT NULL,
  "remnantId"  TEXT NOT NULL,
  "vendorId"   TEXT NOT NULL,
  "vesselCode" TEXT NOT NULL,
  "block"      TEXT,
  "memo"       TEXT,
  "status"     "PartnerClaimStatus" NOT NULL DEFAULT 'RESERVED',
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt"     TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "actor"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerClaim_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PartnerClaim_remnantId_idx" ON "PartnerClaim"("remnantId");
CREATE INDEX "PartnerClaim_status_idx"    ON "PartnerClaim"("status");
ALTER TABLE "PartnerClaim" ADD CONSTRAINT "PartnerClaim_remnantId_fkey"
  FOREIGN KEY ("remnantId") REFERENCES "Remnant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerClaim" ADD CONSTRAINT "PartnerClaim_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "PartnerVendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
