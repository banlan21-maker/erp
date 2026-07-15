-- I2 대응: SteelPlanHeat.autoCreatedFromSurplusCut 추가
-- 여유원재(Remnant type=SURPLUS) 절단완료 시 사양+heatNo 매칭 heat 가 없어
-- 신규 생성된 판번호에 마커. 절단 취소 시 이 heat 는 WAITING 복원 대신 완전 삭제.
-- (원판이 IN_STOCK 로 되살아나면서 유령 WAITING heat 잔류 방지)

ALTER TABLE "SteelPlanHeat"
  ADD COLUMN IF NOT EXISTS "autoCreatedFromSurplusCut" BOOLEAN NOT NULL DEFAULT false;
