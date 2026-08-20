import type { PrismaClient, Prisma } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 발생예정(PENDING) 잔재로는 절단할 수 없다.
 *
 * 왜 확정이 아니라 절단에서 막는가:
 *   "A 원판을 자르면 A-1 등록잔재가 나온다" 를 미리 등록하고, 그 A-1 을 B 도면에
 *   미리 확정(선점)해 두는 것은 정당한 자재 계획이다 — 그래서 확정은 열어 둔다.
 *   하지만 A 가 실제로 잘리기 전에는 A-1 이 세상에 없으므로 B 를 자를 수는 없다.
 *   원판 도면을 절단완료하면 A-1 이 발생예정 → 재고로 승격되고(lib/cutting-complete.ts)
 *   그때부터 B 절단이 가능해진다. 즉 이 가드는 "순서"를 강제할 뿐 계획을 막지 않는다.
 *
 * @returns 막아야 하면 사용자에게 보여줄 안내 문구, 통과면 null
 */
export async function remnantNotReadyMessage(db: Db, drawingListId: string | null | undefined): Promise<string | null> {
  if (!drawingListId) return null;
  const row = await db.drawingList.findUnique({
    where: { id: drawingListId },
    select: {
      assignedRemnant: {
        select: {
          remnantNo: true, status: true,
          drawingList: { select: { drawingNo: true, block: true } }, // 이 잔재를 낳는 원판 도면
        },
      },
    },
  });
  const r = row?.assignedRemnant;
  if (!r || r.status !== "PENDING") return null;

  const src = r.drawingList ? `${r.drawingList.block ?? ""} ${r.drawingList.drawingNo ?? ""}`.trim() : "";
  return (
    `${r.remnantNo} 은(는) 아직 발생예정입니다 — 원판이 절단되지 않아 실물이 없습니다.\n` +
    (src ? `원판 도면 [${src}] 을 먼저 절단완료 처리하면 재고로 바뀌어 이 작업이 가능해집니다.`
         : `원판 도면을 먼저 절단완료 처리하세요.`)
  );
}
