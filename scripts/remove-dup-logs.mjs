// 완전중복 작업일보 정리 — 같은 호선+사양+판번호에서 '같은 도면·같은 작업자'로 2건 이상 기록된 것 중
// 가장 이른 1건만 남기고 나머지 로그를 직접 삭제(복원 side-effect 없이). 강재·판번호·도면 상태는 그대로.
// 기본 미리보기, --apply 로 적용. 삭제분은 remove-dup-logs-undo.json 에 백업.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { writeFileSync } from "node:fs";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const APPLY = process.argv.includes("--apply");

const up = (s) => (s ?? "").trim().toUpperCase();
const vk = (s) => (s ?? "").trim();
const hKey = (v, m, t, w, l, h) => `${vk(v)}|${up(m)}|${t}|${w}|${l}|${up(h)}`;
const d = (x) => x ? new Date(x).toISOString().slice(0, 16).replace("T", " ") : "-";

async function main() {
  console.log(`모드: ${APPLY ? "★ 적용(APPLY) ★" : "미리보기(dry-run)"}\n`);
  const logs = await prisma.cuttingLog.findMany({
    where: { status: "COMPLETED", isUrgent: false, heatNo: { not: "" } },
    select: {
      id: true, equipmentId: true, projectId: true, drawingListId: true, urgentWorkId: true,
      heatNo: true, material: true, thickness: true, width: true, length: true, qty: true, drawingNo: true,
      operator: true, status: true, startAt: true, endAt: true, memo: true, isUrgent: true,
      project: { select: { projectCode: true } }, drawingList: { select: { alternateVesselCode: true } },
    },
  });

  const groups = new Map();
  for (const lg of logs) {
    const v = lg.drawingList?.alternateVesselCode?.trim() || lg.project?.projectCode || "";
    const k = hKey(v, lg.material, lg.thickness, lg.width, lg.length, lg.heatNo);
    (groups.get(k) ?? groups.set(k, []).get(k)).push({ ...lg, _v: v });
  }

  const toDelete = [];
  for (const [, arr] of groups) {
    if (arr.length < 2) continue;
    const draws = new Set(arr.map((l) => l.drawingNo));
    const ops = new Set(arr.map((l) => l.operator));
    if (draws.size !== 1 || ops.size !== 1) continue; // 완전중복(같은 도면·같은 작업자)만
    // 가동시간 정확성: 소요시간(endAt−startAt)이 가장 짧은(정상) 1건을 남기고 나머지 삭제
    // (12일짜리 등 비정상 span 로그가 유지돼 가동시간이 부풀지 않도록)
    const dur = (l) => (l.endAt && l.startAt) ? Math.abs(new Date(l.endAt).getTime() - new Date(l.startAt).getTime()) : Infinity;
    arr.sort((a, b) => dur(a) - dur(b));
    for (const l of arr.slice(1)) toDelete.push(l);
  }

  console.log(`완전중복 삭제 대상: ${toDelete.length} 로그`);
  toDelete.forEach((l) => console.log(`  삭제 | ${l._v} | ${up(l.material)} ${l.thickness}×${l.width}×${l.length} | 판번호 ${l.heatNo} | 도면 ${l.drawingNo} | ${l.operator} | ${d(l.startAt)}~${d(l.endAt)}`));

  if (APPLY) {
    // 백업 저장
    writeFileSync("scripts/remove-dup-logs-undo.json", JSON.stringify(toDelete.map((l) => ({
      id: l.id, equipmentId: l.equipmentId, projectId: l.projectId, drawingListId: l.drawingListId, urgentWorkId: l.urgentWorkId,
      heatNo: l.heatNo, material: l.material, thickness: l.thickness, width: l.width, length: l.length, qty: l.qty,
      drawingNo: l.drawingNo, operator: l.operator, status: l.status, startAt: l.startAt, endAt: l.endAt, memo: l.memo, isUrgent: l.isUrgent,
    })), null, 2), "utf8");
    // 직접 삭제 (applyCuttingRestore 미호출 — 강재/판번호/도면 상태 보존)
    const ids = toDelete.map((l) => l.id);
    const res = await prisma.cuttingLog.deleteMany({ where: { id: { in: ids } } });
    console.log(`\n✔ 삭제 완료: ${res.count} 로그 (백업: scripts/remove-dup-logs-undo.json)`);
  } else {
    console.log(`\n※ 미리보기. 적용: node scripts/remove-dup-logs.mjs --apply`);
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("오류:", e.message); await prisma.$disconnect(); process.exit(1); });
