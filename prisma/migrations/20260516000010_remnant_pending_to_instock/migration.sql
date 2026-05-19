-- 잔재 상태 단순화: PENDING → IN_STOCK (재고/소진 2가지만 사용)
-- (RemnantStatus enum에는 IN_USE가 없으므로 PENDING만 변환)
UPDATE "Remnant" SET "status" = 'IN_STOCK' WHERE "status" = 'PENDING';
