-- 용차사용대장 적재중량 — 자동등록 시 그 차에 실린 자재 중량 합계를 넣는다.
-- 대장에서 몇 kg 나갔는지 바로 보이도록. 수기 등록분은 비어 있고 손으로 채울 수 있다.
ALTER TABLE "CharterUsage" ADD COLUMN "weight" DOUBLE PRECISION;
