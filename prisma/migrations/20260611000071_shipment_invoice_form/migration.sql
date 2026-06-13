-- 거래명세서 양식 (강재 출고증) 빈칸 필드 추가
-- ShipmentVehicle : 발행일자/작성자/작성자연락처/인수자
-- ShipmentItem    : 블록/절단예정일/선급/도면번호/절단장비/선별지시번호

ALTER TABLE "ShipmentVehicle"
  ADD COLUMN "issueDate"    TIMESTAMP(3),
  ADD COLUMN "writerName"   TEXT,
  ADD COLUMN "writerPhone"  TEXT,
  ADD COLUMN "receiverName" TEXT;

ALTER TABLE "ShipmentItem"
  ADD COLUMN "block"             TEXT,
  ADD COLUMN "cutScheduledDate"  TIMESTAMP(3),
  ADD COLUMN "classSociety"      TEXT,
  ADD COLUMN "drawingNo"         TEXT,
  ADD COLUMN "cuttingEquipment"  TEXT,
  ADD COLUMN "selectionOrderNo"  TEXT;
