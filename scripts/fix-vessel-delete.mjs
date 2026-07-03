// 호선 강재 삭제 언블록 — 취소된(CANCELLED) 출고장이 붙든 참조를 정리(steelPlanId=null)한 뒤,
// (--delete 시) 강재+판번호 삭제. 활성(ACTIVE) 출고 참조가 있으면 중단(안내).
// 읽기 전용 기본, 쓰기는 --apply.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const V = process.argv[2];
const APPLY = process.argv.includes("--apply");
const DELETE_PLATES = process.argv.includes("--delete");

async function main() {
  if (!V) { console.error("사용법: node scripts/fix-vessel-delete.mjs <호선> [--apply] [--delete]"); process.exit(1); }
  console.log(`호선 ${V} — 모드: ${APPLY ? "적용" : "미리보기"}${DELETE_PLATES ? " + 강재삭제" : ""}\n`);

  const plans = await prisma.steelPlan.findMany({ where: { vesselCode: V }, select: { id: true, status: true } });
  console.log(`강재 ${plans.length}장`);
  const completed = plans.filter((p) => p.status === "COMPLETED").length;
  if (completed > 0) { console.error(`✗ 중단: 절단완료 ${completed}건 포함. 작업일보에서 절단취소 먼저.`); await prisma.$disconnect(); process.exit(1); }

  const ids = plans.map((p) => p.id);
  const items = await prisma.shipmentItem.findMany({
    where: { steelPlanId: { in: ids } },
    select: { id: true, vehicle: { select: { shipment: { select: { status: true, shipmentNo: true } } } } },
  });
  const active = items.filter((it) => it.vehicle?.shipment?.status === "ACTIVE");
  const cancelled = items.filter((it) => it.vehicle?.shipment?.status === "CANCELLED");
  console.log(`출고 참조: 활성 ${active.length} / 취소 ${cancelled.length}`);
  if (active.length > 0) {
    console.error(`✗ 중단: 활성 출고장이 참조 중(${[...new Set(active.map((a) => a.vehicle?.shipment?.shipmentNo))].join(", ")}). 출고 취소 먼저.`);
    await prisma.$disconnect(); process.exit(1);
  }

  console.log(`\n계획: 취소출고 참조 ${cancelled.length}건 steelPlanId=null 정리${DELETE_PLATES ? ` → 강재 ${plans.length}장 + 판번호 삭제` : ""}`);

  if (APPLY) {
    await prisma.$transaction(async (tx) => {
      if (cancelled.length) await tx.shipmentItem.updateMany({ where: { id: { in: cancelled.map((c) => c.id) } }, data: { steelPlanId: null } });
      if (DELETE_PLATES) {
        const dh = await tx.steelPlanHeat.deleteMany({ where: { vesselCode: V } });
        const dp = await tx.steelPlan.deleteMany({ where: { vesselCode: V } });
        console.log(`✔ 삭제: 강재 ${dp.count} / 판번호 ${dh.count}`);
      } else {
        console.log(`✔ 참조 정리 완료 — 이제 UI에서 삭제 가능`);
      }
    });
  } else {
    console.log(`\n※ 미리보기. 적용: node scripts/fix-vessel-delete.mjs ${V} --apply${DELETE_PLATES ? " --delete" : ""}`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("오류:", e.message); await prisma.$disconnect(); process.exit(1); });
