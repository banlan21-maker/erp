import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 잔재번호 자동채번 — REM-YYYY-NNN (2026-10-02 공용화).
 *
 * 예전엔 같은 코드가 여러 라우트에 복사돼 있었고 대부분 `orderBy: { remnantNo: "desc" }`
 * (문자열 정렬)로 최댓값을 구했다. 999 를 넘으면 "REM-2026-999" 가 "REM-2026-1000" 보다
 * 크게 정렬돼 같은 번호를 다시 뽑고 unique 충돌로 등록이 실패한다. 프로젝트 강재를 여유원재로
 * 한꺼번에 옮기는 기능이 생겨 실제로 넘을 수 있게 돼서 숫자 최댓값 기준으로 통일한다.
 *
 * 같은 트랜잭션 안에서 여러 개가 필요하면 count 로 한 번에 받는다(배치 안 중복 방지).
 */
export async function nextRemnantNos(db: Db, count = 1): Promise<string[]> {
  const year = new Date().getFullYear();
  const prefix = `REM-${year}-`;
  const rows = await db.remnant.findMany({
    where: { remnantNo: { startsWith: prefix } },
    select: { remnantNo: true },
  });
  let max = 0;
  for (const { remnantNo } of rows) {
    const n = parseInt(remnantNo.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return Array.from({ length: count }, (_, i) => `${prefix}${String(max + 1 + i).padStart(3, "0")}`);
}

export async function nextRemnantNo(db: Db): Promise<string> {
  return (await nextRemnantNos(db, 1))[0];
}
