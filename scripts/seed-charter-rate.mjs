/**
 * 용차 단가·할증 초기 등록 (2026-08-20).
 *
 * 단가는 받은 운송단가표(에스로지스)와 과거 대장 실적을 대조해 정했다.
 *   · 표에 있는 구간(영도/고성/통영/거제/진동/진주)은 표 금액 그대로
 *   · 표에 없는 납품처(밀양·김해 등)는 실적에서 가장 많이 쓰인 금액
 *     — 지역이 아니라 납품처마다 굳어진 단가가 있어서, 주소로 지역을 추정하는 것보다 정확하다
 *
 * 할증은 폭 구간으로만 잡는다. 표에는 폭·길이가 나란히 적혀 있으나 실적 역산 결과
 * 길이로는 발동하지 않았다(길이 15,000 초과 2건 모두 할증 0원). 정확도 95%(132/139).
 *
 * 등록 후 관리 화면에서 사용자가 수정·추가할 수 있다.
 *
 * 실행:  node scripts/seed-charter-rate.mjs          (미리보기)
 *        node scripts/seed-charter-rate.mjs --apply  (반영)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");

// 납품처명 → { 구간, 기본단가 }.  실적 건수 많은 순.
const RATES = [
  { deliveryName: "월드테크(밀양)",     region: "밀양",   baseCost: 370000, memo: "실적 134/184건" },
  { deliveryName: "태금",              region: "고성",   baseCost: 270000, memo: "표 고성단가" },
  { deliveryName: "덕광",              region: "고성",   baseCost: 270000, memo: "표 고성단가" },
  { deliveryName: "(주)세림",          region: "밀양",   baseCost: 370000, memo: "실적 17/22건" },
  { deliveryName: "세림",              region: "밀양",   baseCost: 370000, memo: "대장 표기 별칭" },
  { deliveryName: "월드테크",          region: "김해",   baseCost: 370000, memo: "실적 9/9건" },
  { deliveryName: "비씨워터젯",         region: "거제",   baseCost: 370000, memo: "표 거제단가" },
  { deliveryName: "삼강에스앤씨 내업2팀", region: "고성",   baseCost: 270000, memo: "표 고성단가" },
  { deliveryName: "삼강에스앤씨",       region: "고성",   baseCost: 270000, memo: "대장 표기 별칭" },
  { deliveryName: "야나세 통영조선소",   region: "진동",   baseCost: 300000, memo: "표 진동단가" },
  { deliveryName: "한국야나세",         region: "진동",   baseCost: 300000, memo: "실적 8/8건" },
  { deliveryName: "통영조선소",         region: "통영",   baseCost: 320000, memo: "표 통영단가" },
  { deliveryName: "코리아조선",         region: "통영",   baseCost: 320000, memo: "표 통영단가" },
  { deliveryName: "경원(김해장유)",     region: "김해",   baseCost: 370000, memo: "실적 5/5건" },
  { deliveryName: "광도",              region: "거제",   baseCost: 370000, memo: "실적 4/4건" },
  { deliveryName: "삼부TS",            region: "진주",   baseCost: 280000, memo: "표 진주단가 (실적 1건은 330,000)" },
  { deliveryName: "BCW",              region: "거제",   baseCost: 370000, memo: "비씨워터젯 별칭" },
];

// 폭 구간별 할증 (mm 이상~이하)
const SURCHARGES = [
  { minWidth: 3101, maxWidth: 3400, amount: 40000,  label: "3101-3400", sortOrder: 1 },
  { minWidth: 3401, maxWidth: 4000, amount: 100000, label: "3401-4000", sortOrder: 2 },
  { minWidth: 4001, maxWidth: null, amount: 120000, label: "4001-",     sortOrder: 3 },
];

console.log("■ 납품처별 기본단가");
for (const r of RATES)
  console.log(`   ${r.deliveryName.padEnd(20)} ${(r.region ?? "").padEnd(5)} ${r.baseCost.toLocaleString().padStart(9)}원   ${r.memo ?? ""}`);
console.log("\n■ 폭 구간별 할증");
for (const s of SURCHARGES)
  console.log(`   폭 ${s.label.padEnd(11)} ${s.amount.toLocaleString().padStart(9)}원`);
console.log("\n   ※ '가변기·슬라이드(혼합) 150,000' 과 '동지역합짐 50,000 / 타지역합짐 30,000' 은");
console.log("     폭으로 판정할 수 없어 자동계산에 넣지 않는다 — 대장에서 손으로 더하면 된다.");

if (!APPLY) { console.log("\n(미리보기만 — 반영하려면 --apply)"); await prisma.$disconnect(); process.exit(0); }

let rn = 0;
for (const r of RATES) {
  await prisma.charterRate.upsert({
    where: { deliveryName: r.deliveryName },
    create: r,
    update: {},   // 이미 있으면 사용자가 고친 값을 존중해 덮지 않는다
  });
  rn++;
}
let sn = 0;
if ((await prisma.charterSurcharge.count()) === 0) {
  for (const s of SURCHARGES) { await prisma.charterSurcharge.create({ data: s }); sn++; }
} else {
  console.log("   (할증표가 이미 있어 건너뜀 — 사용자가 고친 값 보존)");
}
console.log(`\n✔ 단가 ${rn}건 확인/등록 · 할증 ${sn}건 등록`);
await prisma.$disconnect();
