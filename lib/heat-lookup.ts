/**
 * 판번호 조회 — 표기 차이를 흡수하는 공용 헬퍼.
 *
 * 배경: 현장 입력창은 바코드 스캐너가 붙이는 제어문자·개행을 걸러내려고 입력을 정리한다.
 * 그런데 정리 규칙이 하이픈까지 지워버려서, 실물 라벨이 "SUS-4" 인 철판을 찍으면
 * "SUS4" 가 서버로 가고 DB 에는 "SUS-4" 만 있으니 "등록되지 않은 판번호" 가 떴다.
 * 현재 DB 의 판번호 7,623개 중 72개가 하이픈을 포함한다(SUS-*, J-*, C25-*).
 *
 * 대응: 입력창은 하이픈을 통과시키고(사용자가 그대로 칠 수 있게), 서버는 정확 일치가
 * 실패했을 때 "영문·숫자만 남긴 형태" 로 한 번 더 찾는다. 현재 데이터에서 정규화 후
 * 서로 겹치는 판번호는 0건이라 이 폴백은 모호하지 않다.
 *
 * 정규화 비교는 인덱스를 타지 않으므로 반드시 "정확 일치 실패 시에만" 호출할 것.
 */
import { prisma } from "@/lib/prisma";
import type { SteelPlanHeatStatus, Prisma } from "@prisma/client";

// 트랜잭션 안/밖 모두에서 쓸 수 있도록 DB 클라이언트를 주입받는다 (기본: 전역 prisma)
type Db = Prisma.TransactionClient | typeof prisma;

/** 비교용 정규화 — 대문자화 후 영문·숫자만 남긴다 (현장 입력창과 동일 규칙) */
export const normalizeHeatNo = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * 입력 판번호를 정규화(영숫자만)했을 때 일치하는 SteelPlanHeat id 목록.
 * 정확 일치가 실패한 뒤 표기차(하이픈 등)를 흡수해 재조회할 때 쓴다.
 * 인덱스를 타지 않는 full scan 이므로 정확 일치 실패 시에만 호출할 것.
 * @param db 트랜잭션 클라이언트를 넘기면 그 트랜잭션 안에서 조회한다.
 */
export async function normalizedHeatIds(db: Db, heatNo: string): Promise<string[]> {
  const norm = normalizeHeatNo(heatNo.trim());
  if (!norm) return [];
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "SteelPlanHeat"
    WHERE regexp_replace(upper("heatNo"), '[^A-Z0-9]', '', 'g') = ${norm}
  `;
  return rows.map((r) => r.id);
}

/**
 * 판번호로 SteelPlanHeat 을 찾는다. 정확 일치를 먼저 시도하고, 없으면 정규화 비교로 재시도.
 *
 * @param heatNo 사용자가 입력한 판번호 (정리 전 원문)
 * @param status 이 상태인 것만 (생략하면 상태 무관)
 * @returns 찾은 heat 목록 (createdAt 오름차순). 없으면 빈 배열.
 */
export async function findHeatsByNo(
  heatNo: string,
  status?: SteelPlanHeatStatus,
) {
  const raw = heatNo.trim();
  if (!raw) return [];

  const exact = await prisma.steelPlanHeat.findMany({
    where: { heatNo: raw, ...(status ? { status } : {}) },
    orderBy: { createdAt: "asc" },
  });
  if (exact.length > 0) return exact;

  // 정확 일치 실패 — 표기 차이(하이픈 등)를 무시하고 재시도.
  // 입력이 이미 정규형이어도 반드시 재시도해야 한다. 현장 입력창이 하이픈을 지우므로
  // "SUS4"(정규형) 로 들어와 DB 의 "SUS-4" 를 찾아야 하는 경우가 바로 이 케이스다.
  const norm = normalizeHeatNo(raw);
  if (!norm) return [];

  const ids = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "SteelPlanHeat"
    WHERE regexp_replace(upper("heatNo"), '[^A-Z0-9]', '', 'g') = ${norm}
  `;
  if (ids.length === 0) return [];

  return prisma.steelPlanHeat.findMany({
    where: { id: { in: ids.map(r => r.id) }, ...(status ? { status } : {}) },
    orderBy: { createdAt: "asc" },
  });
}

/** 그 판번호가 상태 불문 존재하는지 (NOT_FOUND vs ALREADY_USED 구분용) */
export async function heatExists(heatNo: string): Promise<boolean> {
  return (await findHeatsByNo(heatNo)).length > 0;
}
