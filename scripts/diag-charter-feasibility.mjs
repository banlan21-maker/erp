/**
 * 용차사용대장 자동기록 가능성 점검 (읽기 전용).
 * 외부출고관리(ShipmentVehicle)가 들고 있는 정보로 대장 항목을 얼마나 채울 수 있나.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

console.log("■ 지금 쌓여 있는 것");
const cu = await p.charterUsage.count();
const sh = await p.shipment.count({ where: { status: "ACTIVE" } });
const vh = await p.shipmentVehicle.count({ where: { shipment: { status: "ACTIVE" } } });
console.log(`   용차사용대장 ${cu}건 · 활성 출고장 ${sh}건 · 출고 차량(송장) ${vh}대`);

console.log("\n■ 대장 항목이 실제로 얼마나 쓰이나 (사람이 손으로 적은 것)");
const rows = await p.charterUsage.findMany({ orderBy: { date: "desc" } });
const filled = (f) => rows.filter(r => r[f] !== null && r[f] !== "").length;
for (const f of ["driverName", "driverPhone", "vehicleNo", "items", "departure", "waypoint", "destination", "departTime", "cost", "memo"])
  console.log(`   ${f.padEnd(12)} ${String(filled(f)).padStart(3)}/${rows.length}`);
if (rows.length) {
  console.log("   최근 3건:");
  for (const r of rows.slice(0, 3))
    console.log(`     ${r.date.toISOString().slice(0,10)} ${r.driverName} ${r.vehicleNo ?? "-"} · ${r.departure ?? "-"}→${r.destination ?? "-"} · ${r.departTime ?? "-"} · ${r.cost?.toLocaleString() ?? "-"}원 · ${r.items ?? ""}`);
}

console.log("\n■ 출고 차량(송장)에 정보가 채워져 있나 — 자동기록의 원천");
const vs = await p.shipmentVehicle.findMany({
  where: { shipment: { status: "ACTIVE" } },
  select: {
    vehicleNo: true, driverName: true, driverPhone: true, deliverySnapshot: true, invoiceNo: true,
    shipment: { select: { shippedAt: true } },
    items: { select: { vesselCode: true, block: true, material: true, thickness: true, width: true, length: true, weight: true, remnantNo: true } },
  },
});
const has = (fn) => vs.filter(fn).length;
console.log(`   차량번호      ${has(v => v.vehicleNo)}/${vs.length}`);
console.log(`   운전자 이름   ${has(v => v.driverName)}/${vs.length}`);
console.log(`   운전자 전화   ${has(v => v.driverPhone)}/${vs.length}`);
console.log(`   납품처 스냅샷 ${has(v => v.deliverySnapshot)}/${vs.length}`);
console.log(`   품목 있음     ${has(v => v.items.length > 0)}/${vs.length}`);
console.log(`   출고시각(시:분이 00:00 아닌 것) ${has(v => { const d = v.shipment?.shippedAt; return d && (d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0); })}/${vs.length}`);

console.log("\n■ 납품처 스냅샷에 무엇이 들었나 (도착지·주소로 쓸 수 있나)");
const withSnap = vs.find(v => v.deliverySnapshot);
if (withSnap) console.log("   " + JSON.stringify(withSnap.deliverySnapshot).slice(0, 400));
else console.log("   스냅샷 있는 차량 없음");

console.log("\n■ 자동으로 만들 '출고품목' 요약 예시");
for (const v of vs.slice(0, 3)) {
  const it = v.items;
  const vessels = [...new Set(it.map(x => x.vesselCode).filter(Boolean))].join(",");
  const blocks = [...new Set(it.map(x => x.block).filter(Boolean))].join(",");
  const wt = it.reduce((s, x) => s + (x.weight ?? 0), 0);
  console.log(`   ${v.invoiceNo ?? "-"} · ${v.vehicleNo} · ${vessels}/${blocks} · ${it.length}건 ${wt.toFixed(0)}kg`);
}

console.log("\n■ 차량번호가 용차 운전자 마스터에 있는지 (우리차 vs 용차 구분 근거)");
const drivers = await p.transportDriver.findMany({ select: { type: true, name: true, vehicleNo: true } });
console.log(`   운전자 마스터 ${drivers.length}명 (용차 ${drivers.filter(d => d.type === "CHARTER").length} · 일반 ${drivers.filter(d => d.type === "REGULAR").length})`);
const charterNos = new Set(drivers.filter(d => d.type === "CHARTER" && d.vehicleNo).map(d => d.vehicleNo.trim()));
const shipNos = [...new Set(vs.map(v => v.vehicleNo?.trim()).filter(Boolean))];
console.log(`   출고에 쓰인 차량번호 ${shipNos.length}종 · 그중 용차 마스터에 있는 것 ${shipNos.filter(n => charterNos.has(n)).length}종`);
console.log(`   → 자동 판별은 어렵다. 사람이 체크하는 방식이 맞다.`);

await p.$disconnect();
