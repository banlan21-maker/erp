import type { Prisma } from "@prisma/client";

/**
 * 출고장 자재(ShipmentItem)를 사람에게 보여줄 때의 순서 — 한 군데서만 정한다.
 *
 * 왜 필요한가 (2026-09-04):
 *   거래명세표가 20행마다 장을 나누고 NO 를 매기는데, 조회에 orderBy 가 없어
 *   DB 원시 순서가 그대로 나왔다. 명세표는 자재 칸을 인라인 편집할 때마다
 *   모든 행을 PATCH 해 행이 재기록되므로 그 순서가 실제로 바뀐다
 *   (정렬 전후로 소계가 달라지는 것으로 확인).
 *
 *   기준을 파일마다 따로 쓰면 화면·API·인쇄물이 서로 다른 순서를 보게 되므로
 *   (실측: 436건 중 47건이 갈림) 여기 하나만 두고 전부 이걸 쓴다.
 *
 * createdAt 만으로는 부족하다 — 한 트랜잭션에서 담긴 자재는 `@default(now())` 가
 * 트랜잭션 시각이라 전부 같은 값이다. id(cuid, 생성순 증가)로 한 번 더 끊는다.
 *
 * 순서가 무관한 곳(출고 취소의 재고복원 루프 등)에는 붙이지 않는다.
 */
export const SHIPMENT_ITEM_ORDER: Prisma.ShipmentItemOrderByWithRelationInput[] = [
  { createdAt: "asc" },
  { id: "asc" },
];
