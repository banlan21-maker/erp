/**
 * 등록잔재 '사전등록' 실태 (읽기 전용).
 * 스키마 의도: 미리 등록 = PENDING → 원판 절단되면 IN_STOCK 승격 + 판번호 자동부여
 * 실제       : 생성 시 곧바로 IN_STOCK → 승격 코드(where status=PENDING)가 영영 안 돈다
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const reg = await p.remnant.findMany({
  where: { type: "REGISTERED" },
  select: { remnantNo: true, status: true, heatNo: true, reservedFor: true, weight: true,
            drawingList: { select: { status: true, heatNo: true, block: true, drawingNo: true, project: { select: { projectCode: true } } } } },
});
console.log(`■ 등록잔재 ${reg.length}건`);

const linked = reg.filter(r => r.drawingList);
const notCut = linked.filter(r => r.drawingList.status !== "CUT");
console.log(`\n① 원판 도면에 연결된 것: ${linked.length}건 (미연결 ${reg.length - linked.length}건)`);
console.log(`② 그중 원판이 아직 절단 전인데 잔재는 이미 재고/소진: ${notCut.length}건  ← 실물 없는 재고`);
for (const r of notCut.slice(0, 15))
  console.log(`     ${r.remnantNo.padEnd(14)} 잔재=${r.status.padEnd(9)} 원판도면=${r.drawingList.status.padEnd(10)} ${r.drawingList.project?.projectCode}/${r.drawingList.block ?? "-"} ${r.drawingList.drawingNo ?? ""}`);
console.log(`     (미절단 원판에 매달린 잔재 중량 합계: ${notCut.reduce((s, r) => s + (r.weight ?? 0), 0).toFixed(0)}kg)`);
console.log(`     그중 이미 다른 블록에 확정(선점)된 것: ${notCut.filter(r => r.reservedFor).length}건`);
console.log(`     그중 이미 소진(절단에 사용)된 것: ${notCut.filter(r => r.status === "EXHAUSTED").length}건  ← 원판도 안 잘렸는데 잔재는 다 씀`);

const cutNoHeat = linked.filter(r => r.drawingList.status === "CUT" && !r.heatNo && r.drawingList.heatNo);
console.log(`\n③ 원판은 절단됐고 원판 판번호도 있는데 잔재에 판번호가 안 붙은 것: ${cutNoHeat.length}건`);
console.log(`   → 승격 코드(PENDING→IN_STOCK + heatNo 부여)가 안 돌아서 생긴 결과. 밀시트 역추적이 끊긴다.`);
for (const r of cutNoHeat.slice(0, 8))
  console.log(`     ${r.remnantNo.padEnd(14)} 원판판번호=${r.drawingList.heatNo}  잔재판번호=(없음)`);

console.log(`\n④ 전체 등록잔재 판번호 보유율: ${reg.filter(r => r.heatNo).length}/${reg.length}`);
console.log(`   PENDING 상태 잔재: ${reg.filter(r => r.status === "PENDING").length}건 (승격 코드가 도는 조건)`);
await p.$disconnect();
