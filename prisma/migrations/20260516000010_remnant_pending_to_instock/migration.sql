-- 잔재 상태 단순화: PENDING/IN_USE → IN_STOCK (재고/소진 2가지만 사용)
UPDATE "Remnant" SET "status" = 'IN_STOCK' WHERE "status" IN ('PENDING', 'IN_USE');
