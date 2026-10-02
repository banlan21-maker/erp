import type { Prisma } from "@prisma/client";

// 업로드 배치번호 생성: YYYYMMDD-NN  (한국시간 KST 기준 날짜)
// 해당 날짜의 기존 업로드번호 중 최대 순번 + 1 (예: 20260615-01, -02, -03)
// 중간 번호(-02)를 지워도 기존 -01/-03 은 그대로 유지되고, 다음 업로드는 최대값+1 로 이어짐
// 트랜잭션 클라이언트(tx)로 읽어 같은 트랜잭션의 createMany 와 원자적으로 묶음
// 쓰는 곳: 강재 엑셀 업로드(POST /api/steel-plan) · 송장 스캔 입고(POST /api/steel-plan/invoice-receive)
export async function genBatchNo(tx: Prisma.TransactionClient): Promise<string> {
  // Docker 컨테이너가 UTC 여도 한국 달력 날짜로 발번 (en-CA → "2026-06-15")
  const kstDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const prefix = `${kstDate.replace(/-/g, "")}-`;   // "20260615-"

  // 같은 날짜의 기존 업로드번호 조회 (steelPlan + steelPlanHeat 양쪽 — 일부만 남아도 재사용 방지)
  const [plans, heats] = await Promise.all([
    tx.steelPlan.findMany({
      where: { uploadBatchNo: { startsWith: prefix } },
      select: { uploadBatchNo: true }, distinct: ["uploadBatchNo"],
    }),
    tx.steelPlanHeat.findMany({
      where: { uploadBatchNo: { startsWith: prefix } },
      select: { uploadBatchNo: true }, distinct: ["uploadBatchNo"],
    }),
  ]);

  let maxSeq = 0;
  for (const { uploadBatchNo } of [...plans, ...heats]) {
    const seq = Number(uploadBatchNo?.split("-")[1]);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  }

  return `${prefix}${String(maxSeq + 1).padStart(2, "0")}`;
}
