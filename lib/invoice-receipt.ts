/**
 * 송장 스캔 입고 — 송장 한 줄을 ERP 강재와 맞추는 판정 (2026-10-03)
 *
 * 흐름: 재강사 목록(엑셀)을 먼저 '프로젝트 강재 목록'에 올리면 강재가 등록(REGISTERED)으로 잡힌다.
 *   어떤 재강사는 목록에 판번호를 주고(판번호 리스트도 같이 생김), 어떤 재강사는 안 준다.
 *   철판이 들어오면 종이 송장(판번호 + 사양)을 스캔해 그 강재를 입고로 바꾼다.
 * 그래서 송장 판번호가 ERP 에 이미 있는 건 '중복'이 아니라 정상이다(예전엔 중복이라 막혀 입고를 못 했다 — 실무 피드백).
 *
 * 줄마다 판정(kind):
 *   receive        판번호가 목록에 있음(대기) + 같은 호선·사양 등록 강재 있음 → 그 강재를 입고로(같은 업로드 묶음 우선)
 *   receiveAddHeat 판번호 없음 + 같은 호선·사양 등록 강재 있음 → 강재 입고 + 그 강재 묶음에 판번호 추가
 *   newPlan        같은 호선·사양 등록 강재가 없음 → 목록에 없는 강재. 확인하면 새로 등록하며 입고(+판번호)
 *   planOnly       판번호는 목록에 있는데(대기) 그 사양 강재가 하나도 없음 → 강재만 새로 만들어 입고
 *   received       판번호는 목록에 있는데 그 사양 등록 강재가 남아 있지 않고 이미 입고 이상인 강재가 있음 → 이미 입고됨(제외)
 *   consumed       판번호가 이미 절단·외부출고 → 제외
 * 판번호가 목록에 있으면 그 판번호의 호선·사양이 기준이다(송장 판독 값과 다르면 note 로 알림).
 * 같은 사양이 여러 줄이면 등록 강재를 한 장씩 나눠 준다 — 판번호 있는 줄 먼저(묶음 일치 우선), 그다음 나머지(오래된 강재부터).
 */
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type ReceiptKind = "receive" | "receiveAddHeat" | "newPlan" | "planOnly" | "received" | "consumed";
export type ReceiptRowIn = { vesselCode: string; material: string; thickness: number; width: number; length: number; heatNo: string };
export type ReceiptDecision = {
  kind: ReceiptKind;
  planId: string | null;            // receive / receiveAddHeat — 입고로 바꿀 등록 강재
  planBatch: string | null;         // 그 강재의 업로드 묶음(판번호를 추가할 때 같은 묶음으로)
  heatId: string | null;            // 목록에 있던 판번호
  // 실제로 쓸 값 — 목록 판번호가 있으면 그 판번호의 호선·사양
  vesselCode: string; material: string; thickness: number; width: number; length: number;
  note: string | null;
};

export const RECEIPT_LABEL: Record<ReceiptKind, string> = {
  receive: "입고",
  receiveAddHeat: "입고 + 판번호 추가",
  newPlan: "목록에 없음 — 새로 등록",
  planOnly: "강재 새로 등록",
  received: "이미 입고됨",
  consumed: "이미 절단·출고",
};
/** 기본으로 빼는 판정 */
export const RECEIPT_EXCLUDED: ReceiptKind[] = ["received", "consumed"];

const specKey = (v: string, m: string, t: number, w: number, l: number) => `${v}|${m.trim().toUpperCase()}|${t}|${w}|${l}`;

export async function classifyReceipt(db: Db, rows: ReceiptRowIn[]): Promise<ReceiptDecision[]> {
  const norm = rows.map(r => ({ ...r, vesselCode: r.vesselCode.trim(), material: r.material.trim().toUpperCase(), heatNo: r.heatNo.trim().toUpperCase() }));
  const heatNos = [...new Set(norm.map(r => r.heatNo).filter(Boolean))];
  const heats = heatNos.length
    ? await db.steelPlanHeat.findMany({
        where: { heatNo: { in: heatNos, mode: "insensitive" } },
        select: { id: true, heatNo: true, status: true, vesselCode: true, material: true, thickness: true, width: true, length: true, uploadBatchNo: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  // 같은 판번호가 여러 행이면(수입재 등) 대기인 것 우선
  const heatBy = new Map<string, typeof heats[number]>();
  for (const h of heats) {
    const k = h.heatNo.toUpperCase(), cur = heatBy.get(k);
    if (!cur || (cur.status !== "WAITING" && h.status === "WAITING")) heatBy.set(k, h);
  }

  // 줄마다 기준 호선·사양
  const base = norm.map(r => {
    const h = r.heatNo ? heatBy.get(r.heatNo) : undefined;
    const use = h ? { vesselCode: h.vesselCode, material: h.material.toUpperCase(), thickness: h.thickness, width: h.width, length: h.length } : r;
    const differs = h && (h.vesselCode !== r.vesselCode || use.material !== r.material || h.thickness !== r.thickness || h.width !== r.width || h.length !== r.length);
    return { r, h, use, note: differs ? `판번호 목록 기준 ${h!.vesselCode} ${h!.material} ${h!.thickness}×${h!.width}×${h!.length} (송장 판독 ${r.vesselCode || "-"} ${r.material} ${r.thickness}×${r.width}×${r.length})` : null };
  });

  // 등록 강재 후보 — 줄들의 호선·사양
  const specs = [...new Map(base.map(b => [specKey(b.use.vesselCode, b.use.material, b.use.thickness, b.use.width, b.use.length), b.use])).values()]
    .filter(s => s.vesselCode && s.material && s.thickness > 0 && s.width > 0 && s.length > 0);
  const specWhere = specs.map(s => ({ vesselCode: s.vesselCode, material: { equals: s.material, mode: "insensitive" as const }, thickness: s.thickness, width: s.width, length: s.length }));
  const regPlans = specWhere.length
    ? await db.steelPlan.findMany({
        where: { status: "REGISTERED", archivedAt: null, OR: specWhere },
        select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true, uploadBatchNo: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const pool = new Map<string, typeof regPlans>();
  for (const p of regPlans) {
    const k = specKey(p.vesselCode, p.material, p.thickness, p.width, p.length);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k)!.push(p);
  }
  const take = (k: string, batch: string | null) => {
    const arr = pool.get(k);
    if (!arr?.length) return null;
    const i = batch ? arr.findIndex(p => p.uploadBatchNo === batch) : -1;
    return arr.splice(i >= 0 ? i : 0, 1)[0];
  };

  const out: (ReceiptDecision | null)[] = base.map(() => null);
  const mk = (b: typeof base[number], kind: ReceiptKind, plan: { id: string; uploadBatchNo: string | null } | null, extra?: string | null): ReceiptDecision => ({
    kind, planId: plan?.id ?? null, planBatch: plan?.uploadBatchNo ?? null, heatId: b.h?.id ?? null,
    vesselCode: b.use.vesselCode, material: b.use.material, thickness: b.use.thickness, width: b.use.width, length: b.use.length,
    note: [b.note, extra].filter(Boolean).join(" · ") || null,
  });

  // ① 판번호가 목록에 있는 줄
  const noPlanHeat: number[] = [];
  base.forEach((b, i) => {
    if (!b.h) return;
    if (b.h.status !== "WAITING") { out[i] = mk(b, "consumed", null, b.h.status === "CUT" ? "절단됨" : "외부출고됨"); return; }
    const p = take(specKey(b.use.vesselCode, b.use.material, b.use.thickness, b.use.width, b.use.length), b.h.uploadBatchNo);
    if (p) out[i] = mk(b, "receive", p);
    else noPlanHeat.push(i);
  });
  // ② 판번호가 없는 줄
  base.forEach((b, i) => {
    if (b.h) return;
    const p = take(specKey(b.use.vesselCode, b.use.material, b.use.thickness, b.use.width, b.use.length), null);
    out[i] = p ? mk(b, "receiveAddHeat", p) : mk(b, "newPlan", null);
  });
  // ③ 판번호는 대기인데 등록 강재가 없음 — 이미 입고된 사양이면 '이미 입고됨', 강재 자체가 없으면 강재만 새로
  if (noPlanHeat.length) {
    const done = await db.steelPlan.findMany({
      where: {
        status: { in: ["RECEIVED", "ISSUED", "COMPLETED", "SHIPPED_OUT"] },
        OR: noPlanHeat.map(i => { const u = base[i].use; return { vesselCode: u.vesselCode, material: { equals: u.material, mode: "insensitive" as const }, thickness: u.thickness, width: u.width, length: u.length }; }),
      },
      select: { vesselCode: true, material: true, thickness: true, width: true, length: true },
    });
    const doneKeys = new Set(done.map(p => specKey(p.vesselCode, p.material, p.thickness, p.width, p.length)));
    for (const i of noPlanHeat) {
      const b = base[i];
      out[i] = doneKeys.has(specKey(b.use.vesselCode, b.use.material, b.use.thickness, b.use.width, b.use.length))
        ? mk(b, "received", null, "같은 사양 등록 강재가 남아 있지 않음")
        : mk(b, "planOnly", null, "판번호만 있고 강재가 없음");
    }
  }
  return out as ReceiptDecision[];
}

export type ReceiptApplyItem = ReceiptRowIn & { storageLocation: string | null };
export class ReceiptConflict extends Error {}

/**
 * 판정대로 적용 — 트랜잭션(tx) 안에서. 이미 입고·절단·출고 줄이 있거나 그사이 다른 곳에서 처리됐으면 ReceiptConflict.
 *   receive/receiveAddHeat: 등록 강재 → 입고(조건부 갱신), receiveAddHeat 는 그 강재 묶음에 판번호 추가
 *   newPlan/planOnly: 새 묶음 하나로 강재(입고) 생성, newPlan 은 판번호도
 */
export async function applyReceipt(
  tx: Prisma.TransactionClient, items: ReceiptApplyItem[], ds: ReceiptDecision[],
  opts: { receivedAt: Date; sourceFile: string; genBatch: () => Promise<string> },
): Promise<{ counts: Record<ReceiptKind, number>; newBatch: string | null }> {
  const blocked = ds.map((d, i) => ({ d, i })).filter(x => RECEIPT_EXCLUDED.includes(x.d.kind));
  if (blocked.length) throw new ReceiptConflict(`이미 입고됐거나 절단·출고된 판번호가 있어 입고하지 않았습니다: ${blocked.map(x => `${items[x.i].heatNo}(${RECEIPT_LABEL[x.d.kind]})`).join(", ")}`);
  const counts: Record<ReceiptKind, number> = { receive: 0, receiveAddHeat: 0, newPlan: 0, planOnly: 0, received: 0, consumed: 0 };
  let newBatch: string | null = null;
  for (const [i, d] of ds.entries()) {
    const it = items[i];
    counts[d.kind]++;
    const spec = { vesselCode: d.vesselCode, material: d.material, thickness: d.thickness, width: d.width, length: d.length };
    if (d.kind === "receive" || d.kind === "receiveAddHeat") {
      const u = await tx.steelPlan.updateMany({
        where: { id: d.planId!, status: "REGISTERED" },
        data: { status: "RECEIVED", receivedAt: opts.receivedAt, ...(it.storageLocation ? { storageLocation: it.storageLocation } : {}) },
      });
      if (u.count !== 1) throw new ReceiptConflict(`${it.heatNo} 강재가 그사이 다른 곳에서 처리됐습니다. 다시 판독(또는 다시 대조)해 주세요.`);
      if (d.kind === "receiveAddHeat") {
        await tx.steelPlanHeat.create({ data: { ...spec, heatNo: it.heatNo, sourceFile: opts.sourceFile, uploadBatchNo: d.planBatch } });
      }
    } else {
      if (!newBatch) newBatch = await opts.genBatch();
      await tx.steelPlan.create({ data: { ...spec, status: "RECEIVED", receivedAt: opts.receivedAt, storageLocation: it.storageLocation, sourceFile: opts.sourceFile, uploadBatchNo: newBatch } });
      if (d.kind === "newPlan") {
        await tx.steelPlanHeat.create({ data: { ...spec, heatNo: it.heatNo, sourceFile: opts.sourceFile, uploadBatchNo: newBatch } });
      }
    }
  }
  return { counts, newBatch };
}
