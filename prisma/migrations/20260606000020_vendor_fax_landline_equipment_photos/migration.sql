-- Vendor: 일반전화 + FAX 컬럼 추가
ALTER TABLE "Vendor" ADD COLUMN "landline" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "fax" TEXT;

-- MgmtEquipment: 사진 2장 컬럼 추가
ALTER TABLE "MgmtEquipment" ADD COLUMN "photoUrl1" TEXT;
ALTER TABLE "MgmtEquipment" ADD COLUMN "photoUrl2" TEXT;
