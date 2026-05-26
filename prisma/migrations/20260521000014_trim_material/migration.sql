-- 재질(material) 앞뒤 공백 제거 — 도면/철판 매칭 실패(공백 불일치) 방지
UPDATE "DrawingList" SET "material" = TRIM("material") WHERE "material" <> TRIM("material");
UPDATE "SteelPlan"   SET "material" = TRIM("material") WHERE "material" <> TRIM("material");
UPDATE "SteelPlanHeat" SET "material" = TRIM("material") WHERE "material" <> TRIM("material");
