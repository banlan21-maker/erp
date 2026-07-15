-- I3 대응: Remnant.drawingListId FK 를 Cascade → SetNull 로 변경
-- 이유: §9 B4 원칙 "부모 도면이 소진·삭제되어도 자식 잔재는 독립 유지" 준수.
--       기존 Cascade 는 도면 삭제 시 그 도면에서 발생한 등록잔재까지 물리 삭제 →
--       밀시트(재료 성적서) 역추적 근거 소실.
--
-- SetNull 로 바뀌면 도면 삭제 시 잔재 레코드는 유지되고 drawingListId 만 null 로 해제.
-- 잔재의 heatNo/vesselCode/사양은 그대로라 원판 판번호까지 밀시트 역추적 가능.

ALTER TABLE "Remnant" DROP CONSTRAINT IF EXISTS "Remnant_drawingListId_fkey";
ALTER TABLE "Remnant"
  ADD CONSTRAINT "Remnant_drawingListId_fkey"
  FOREIGN KEY ("drawingListId") REFERENCES "DrawingList"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
