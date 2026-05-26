-- 재질(material) 대문자 통일 — 표시·매칭 일관성 (트림 포함)
UPDATE "DrawingList"   SET "material" = UPPER(TRIM("material")) WHERE "material" <> UPPER(TRIM("material"));
UPDATE "SteelPlan"     SET "material" = UPPER(TRIM("material")) WHERE "material" <> UPPER(TRIM("material"));
UPDATE "SteelPlanHeat" SET "material" = UPPER(TRIM("material")) WHERE "material" <> UPPER(TRIM("material"));
UPDATE "Remnant"       SET "material" = UPPER(TRIM("material")) WHERE "material" <> UPPER(TRIM("material"));
