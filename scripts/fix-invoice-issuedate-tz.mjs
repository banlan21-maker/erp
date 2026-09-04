/**
 * 거래명세표 발행일자 하루 밀림 소급 정리 (2026-09-04).
 *
 * 원인: 명세표 화면의 발행일자 date input 이 저장은 로컬 자정(`new Date("YYYY-MM-DDT00:00:00")`),
 *       표시는 ISO 앞 10자였다. KST(+9)에서 로컬 자정 = 전날 15:00Z 라 고른 날짜보다
 *       하루 앞선 날이 인쇄됐다. 저장을 UTC 자정으로 바꿔 왕복을 맞췄고(components/invoice-print.tsx),
 *       이 스크립트는 그 전에 저장된 값을 되돌린다.
 *
 * 대상: issueDate 가 정확히 15:00Z 인 레코드 — 사용자가 직접 고른 것만 해당한다
 *       (출고 확정 시 자동 세팅되는 값은 처음부터 UTC 자정이라 무관).
 *
 * 실행: node scripts/fix-invoice-issuedate-tz.mjs          (미리보기)
 *       node scripts/fix-invoice-issuedate-tz.mjs --apply  (반영 + undo 파일 생성)
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");

const rows = await prisma.shipmentVehicle.findMany({
  where: { issueDate: { not: null } },
  select: { id: true, invoiceNo: true, issueDate: true },
});

// 로컬(KST) 자정으로 저장된 것 = UTC 15:00 정각
const bad = rows.filter(r => r.issueDate.getUTCHours() === 15 && r.issueDate.getUTCMinutes() === 0);

console.log(`발행일자 보유 ${rows.length}건 중 하루 밀린 저장 ${bad.length}건`);
if (bad.length === 0) { await prisma.$disconnect(); process.exit(0); }

const undo = [];
for (const r of bad) {
  // 15:00Z + 9h = 사용자가 실제로 고른 날의 UTC 자정
  const fixed = new Date(r.issueDate.getTime() + 9 * 3600 * 1000);
  console.log(`   ${r.invoiceNo}  ${r.issueDate.toISOString().slice(0, 10)} → ${fixed.toISOString().slice(0, 10)}`);
  undo.push({ id: r.id, invoiceNo: r.invoiceNo, before: r.issueDate.toISOString(), after: fixed.toISOString() });
  if (APPLY) {
    await prisma.shipmentVehicle.update({ where: { id: r.id }, data: { issueDate: fixed } });
  }
}

if (APPLY) {
  writeFileSync("scripts/fix-invoice-issuedate-tz-undo.json", JSON.stringify(undo, null, 2), "utf-8");
  console.log(`\n반영 완료 — 되돌리려면 scripts/fix-invoice-issuedate-tz-undo.json 의 before 값으로 update`);
} else {
  console.log(`\n미리보기입니다. 반영하려면 --apply`);
}

await prisma.$disconnect();
