/**
 * 협력업체 공유 링크 — 선점 → 사용확정 흐름 검증 (읽기 전용 + 되돌리는 시뮬레이션).
 * 실제 API 를 타지 않고 같은 규칙을 재현해 결과만 확인한 뒤 원상복구한다.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const label = (v, ves, blk) => [v, ves, blk].filter(Boolean).join("/");

console.log("■ 외부 화면에 보일 여유원재 상태 분포");
const rows = await p.remnant.findMany({
  where: { type: "SURPLUS" },
  select: { id: true, remnantNo: true, status: true, reservedFor: true, shipoutMarkedAt: true,
            partnerClaims: { where: { status: "RESERVED" }, select: { id: true } } },
});
const st = { AVAILABLE: 0, RESERVED: 0, INHOUSE: 0, USED: 0 };
for (const r of rows) {
  const claim = r.partnerClaims[0];
  const inhouse = !claim && (!!r.shipoutMarkedAt || (!!r.reservedFor && r.status !== "EXHAUSTED"));
  st[r.status === "EXHAUSTED" ? "USED" : claim ? "RESERVED" : inhouse ? "INHOUSE" : "AVAILABLE"]++;
}
console.log(`   사용가능 ${st.AVAILABLE} · 선점중 ${st.RESERVED} · 본사사용 ${st.INHOUSE} · 사용완료 ${st.USED}  (총 ${rows.length})`);

const vendor = await p.partnerVendor.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } });
const free = rows.find(r => r.status === "IN_STOCK" && !r.reservedFor && !r.shipoutMarkedAt && r.partnerClaims.length === 0);
if (!vendor || !free) { console.log("\n검증할 대상이 없습니다."); await p.$disconnect(); process.exit(0); }

console.log(`\n■ 시뮬레이션 대상: ${free.remnantNo} · 업체 ${vendor.name}`);
const lbl = label(vendor.name, "TEST-1023", "B70P");

// 1) 선점
const taken = await p.remnant.updateMany({
  where: { id: free.id, type: "SURPLUS", status: "IN_STOCK", reservedFor: null, shipoutMarkedAt: null },
  data: { reservedFor: lbl },
});
const claim = await p.partnerClaim.create({
  data: { remnantId: free.id, vendorId: vendor.id, vesselCode: "TEST-1023", block: "B70P", actor: "검증", status: "RESERVED" },
});
console.log(`   ① 선점  → updateMany ${taken.count}건 · 확정정보 "${lbl}"`);

// 1-b) 같은 판을 또 선점하려 하면 막히는가 (동시 선점 방지)
const again = await p.remnant.updateMany({
  where: { id: free.id, type: "SURPLUS", status: "IN_STOCK", reservedFor: null, shipoutMarkedAt: null },
  data: { reservedFor: "다른업체/9999" },
});
console.log(`   ①-b 두 번째 선점 시도 → 갱신 ${again.count}건 ${again.count === 0 ? "(정상 — 막힌다)" : "(문제! 중복 선점됨)"}`);

// 2) 사용확정
const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const done = await p.remnant.updateMany({
  where: { id: free.id, status: "IN_STOCK" },
  data: { status: "EXHAUSTED", reservedFor: lbl, memo: `[설계업체] ${stamp} ${lbl} 사용확정` },
});
await p.partnerClaim.update({ where: { id: claim.id }, data: { status: "USED", usedAt: new Date() } });
const after = await p.remnant.findUnique({ where: { id: free.id }, select: { status: true, reservedFor: true, memo: true } });
console.log(`   ② 사용확정 → 갱신 ${done.count}건`);
console.log(`      ERP 상태  : ${after.status}`);
console.log(`      확정정보  : ${after.reservedFor}`);
console.log(`      메모      : ${after.memo}`);

// 3) 원상복구
await p.partnerClaim.delete({ where: { id: claim.id } });
await p.remnant.update({ where: { id: free.id }, data: { status: "IN_STOCK", reservedFor: null, memo: null } });
const back = await p.remnant.findUnique({ where: { id: free.id }, select: { status: true, reservedFor: true, memo: true } });
console.log(`\n   ③ 원상복구 → ${back.status} · 확정정보 ${back.reservedFor ?? "(없음)"} · 메모 ${back.memo ?? "(없음)"}`);

await p.$disconnect();
