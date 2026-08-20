-- 잔재 외부출고 귀속 라벨 (= SteelMatchJob.name). 원판 SteelPlan.shipoutLabel 과 같은 역할.
--
-- 없던 시절에는 출고된 잔재가 '전역 풀' 로 취급돼, 다른 호선·다른 매칭작업에서 나간 잔재가
-- 재질·두께·폭·길이만 같으면 남의 매칭 목록을 '출고' 로 덮었다.
-- 실측: Steellist-1023-S30P(월드-SK) 의 2개 행이 KYTS-1022 잔재 때문에 출고로 표시됐다
--       (그 목록에서 실제로 나간 강재는 0장).
--
-- 기존 데이터는 어느 작업에서 내보냈는지 알 방법이 없어 NULL 로 둔다.
-- NULL 은 어느 매칭 목록에도 잡히지 않는다 — 잘못 덮던 것이 사라진다.
ALTER TABLE "Remnant" ADD COLUMN "shipoutLabel" TEXT;
CREATE INDEX "Remnant_shipoutLabel_idx" ON "Remnant"("shipoutLabel");
