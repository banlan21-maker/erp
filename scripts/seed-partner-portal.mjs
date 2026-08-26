/**
 * 협력업체 공유 링크 초기 설정 (2026-08-21).
 * 링크 1개 발급 + 설계업체 3곳 등록. ERP 잔재관리 > 업체공유 탭에서 이어서 관리한다.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");

const VENDORS = ["설계업체A", "설계업체B", "설계업체C"];
console.log("■ 등록할 설계업체:", VENDORS.join(" · "), "(이름은 화면에서 바꿀 수 있다)");
const existing = await p.partnerPortal.findFirst({ where: { active: true } });
console.log(existing ? `   기존 링크 있음 (${existing.createdAt.toISOString().slice(0,10)})` : "   기존 링크 없음");

if (!APPLY) { console.log("\n(미리보기만 — 반영하려면 --apply)"); await p.$disconnect(); process.exit(0); }

for (const [i, name] of VENDORS.entries()) {
  await p.partnerVendor.upsert({ where: { name }, create: { name, sortOrder: i }, update: {} });
}
let portal = existing;
if (!portal) {
  portal = await p.partnerPortal.create({ data: { token: randomBytes(32).toString("base64url"), memo: "최초 발급" } });
}
console.log(`\n✔ 업체 ${VENDORS.length}곳 · 링크 준비 완료`);
console.log(`   https://kotecherp.duckdns.org/partner/${portal.token}`);
console.log("   ※ 이 주소는 로그인이 없다. 유출되면 ERP 잔재관리 > 업체공유 에서 재발급할 것.");
await p.$disconnect();
