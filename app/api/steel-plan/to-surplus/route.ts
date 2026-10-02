export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nextRemnantNos } from "@/lib/remnant-numbering";
import { syncDrawingListBySpecs } from "@/lib/sync-drawing-spec";

/**
 * 프로젝트 강재 → 여유원재 이동 (2026-10-02)
 *
 * 프로젝트가 끝나면 남는 입고 강재를 여유원재로 옮긴다. 예전엔 잔재관리에 손으로 다시 등록해
 * 같은 철판이 두 목록에 동시에 있었다(B63141203). 여기서는 **이동** — 강재 행과 그 판번호 행을
 * 지우고 같은 정보로 여유원재를 만든다. 원래 행은 Remnant.movedFromPlan 에 스냅샷으로 남겨
 * [되돌리기] 가 같은 id·입고일·위치·판번호로 정확히 복원한다.
 *
 * 판번호: 강재와 판번호는 사양 단위로만 연결돼 있어(1:1 고리 없음) 어느 판번호가 따라갈지
 * 사용자가 고른다. 같은 호선·사양의 대기(WAITING) 판번호가 후보. 고른 수만큼 앞 강재부터
 * 짝지어 여유원재 heatNo 에 넣고, 남는 강재는 판번호 없이 만든다(현장 작업일보에서 입력).
 *
 * POST { action: "preview", ids }                       → 사양별 묶음 + 판번호 후보 + 못 옮기는 행
 * POST { action: "move", ids, heatIds, registeredBy }   → 이동
 * POST { action: "restore", remnantId }                 → 프로젝트 강재로 되돌리기
 */

const MOVABLE = { status: "RECEIVED" as const, reservedFor: null, shipoutMarkedAt: null, archivedAt: null };

const weightOf = (t: number, w: number, l: number) => Math.round(t * w * l * 7.85 / 1_000_000 * 10) / 10;
const specKey = (p: { vesselCode: string; material: string; thickness: number; width: number; length: number }) =>
  [p.vesselCode, p.material.trim().toUpperCase(), p.thickness, p.width, p.length].join("|");

function blockReason(p: { status: string; reservedFor: string | null; shipoutMarkedAt: Date | null; archivedAt: Date | null }): string | null {
  if (p.archivedAt) return "아카이브(숨김) 자재";
  if (p.status !== "RECEIVED") return p.status === "REGISTERED" ? "미입고 — 실물이 없습니다" : `입고 상태가 아님(${p.status})`;
  if (p.reservedFor) return `블록확정(${p.reservedFor}) — 확정취소 먼저`;
  if (p.shipoutMarkedAt) return "출고 선별 중 — 선별 해제 먼저";
  return null;
}

class MoveError extends Error {}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const action = String(b?.action ?? "");

    // ── 미리보기 ─────────────────────────────────────────────────────────
    if (action === "preview") {
      const ids: string[] = Array.isArray(b?.ids) ? b.ids : [];
      if (!ids.length) return NextResponse.json({ success: false, error: "선택된 강재가 없습니다." }, { status: 400 });
      const plans = await prisma.steelPlan.findMany({
        where: { id: { in: ids } },
        select: { id: true, vesselCode: true, material: true, thickness: true, width: true, length: true,
                  status: true, reservedFor: true, shipoutMarkedAt: true, archivedAt: true, storageLocation: true },
        orderBy: [{ vesselCode: "asc" }, { thickness: "asc" }, { width: "asc" }, { length: "asc" }],
      });
      const blocked = plans.flatMap(p => { const r = blockReason(p); return r ? [{ id: p.id, vesselCode: p.vesselCode, spec: `${p.material} ${p.thickness}×${p.width}×${p.length}`, reason: r }] : []; });
      const ok = plans.filter(p => !blockReason(p));

      const groups = new Map<string, { key: string; vesselCode: string; material: string; thickness: number; width: number; length: number; planIds: string[]; heats: { id: string; heatNo: string }[] }>();
      for (const p of ok) {
        const k = specKey(p);
        if (!groups.has(k)) groups.set(k, { key: k, vesselCode: p.vesselCode, material: p.material, thickness: p.thickness, width: p.width, length: p.length, planIds: [], heats: [] });
        groups.get(k)!.planIds.push(p.id);
      }
      for (const g of groups.values()) {
        g.heats = await prisma.steelPlanHeat.findMany({
          where: { vesselCode: g.vesselCode, material: { equals: g.material, mode: "insensitive" },
                   thickness: g.thickness, width: g.width, length: g.length, status: "WAITING", archivedAt: null },
          select: { id: true, heatNo: true },
          orderBy: [{ createdAt: "asc" }, { heatNo: "asc" }],
        });
      }
      return NextResponse.json({ success: true, groups: [...groups.values()], blocked });
    }

    // ── 이동 ─────────────────────────────────────────────────────────────
    if (action === "move") {
      const ids: string[] = Array.isArray(b?.ids) ? b.ids : [];
      const heatIds: string[] = Array.isArray(b?.heatIds) ? b.heatIds : [];
      const registeredBy = String(b?.registeredBy ?? "").trim();
      if (!ids.length) return NextResponse.json({ success: false, error: "선택된 강재가 없습니다." }, { status: 400 });
      if (!registeredBy) return NextResponse.json({ success: false, error: "처리자 이름을 입력하세요." }, { status: 400 });

      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
      const affected: { vesselCode: string; material: string; thickness: number; width: number; length: number }[] = [];

      const created = await prisma.$transaction(async (tx) => {
        const plans = await tx.steelPlan.findMany({ where: { id: { in: ids }, ...MOVABLE }, orderBy: { createdAt: "asc" } });
        if (plans.length !== ids.length) {
          throw new MoveError(`옮길 수 없는 강재가 ${ids.length - plans.length}건 섞여 있습니다(입고·미확정·미선별만 가능). 새로고침 후 다시 선택하세요.`);
        }
        const heats = heatIds.length
          ? await tx.steelPlanHeat.findMany({ where: { id: { in: heatIds }, status: "WAITING", archivedAt: null } })
          : [];
        if (heats.length !== heatIds.length) throw new MoveError("고른 판번호 중 이미 사용·출고된 것이 있습니다. 새로고침 후 다시 고르세요.");

        // 판번호는 같은 호선·사양 강재에만 붙일 수 있고, 강재 장수를 넘을 수 없다
        const planByKey = new Map<string, typeof plans>();
        for (const p of plans) { const k = specKey(p); if (!planByKey.has(k)) planByKey.set(k, []); planByKey.get(k)!.push(p); }
        const heatByKey = new Map<string, typeof heats>();
        for (const h of heats) {
          const k = specKey(h);
          if (!planByKey.has(k)) throw new MoveError(`판번호 ${h.heatNo} 는 선택한 강재와 호선·사양이 다릅니다.`);
          if (!heatByKey.has(k)) heatByKey.set(k, []);
          heatByKey.get(k)!.push(h);
        }
        for (const [k, hs] of heatByKey) {
          if (hs.length > planByKey.get(k)!.length) throw new MoveError(`판번호를 강재 장수보다 많이 골랐습니다 (${k.split("|").slice(1).join(" ")}).`);
        }

        // 취소된 출고장 이력이 Restrict FK 로 붙들고 있으면 지울 수 없다 — 활성 출고는 위 MOVABLE 로 이미 배제
        await tx.shipmentItem.updateMany({ where: { steelPlanId: { in: ids } }, data: { steelPlanId: null } });
        if (heatIds.length) await tx.shipmentItem.updateMany({ where: { steelPlanHeatId: { in: heatIds } }, data: { steelPlanHeatId: null } });

        // 강재 ↔ (판번호|없음) 짝 — 사양 묶음 안에서 앞 강재부터 고른 판번호를 붙인다
        const pairs = [...planByKey].flatMap(([k, ps]) => ps.map((plan, j) => ({ plan, heat: heatByKey.get(k)?.[j] ?? null })));
        const nos = await nextRemnantNos(tx, pairs.length);
        const out = pairs.map(({ plan, heat }, i) => ({ remnantNo: nos[i], heatNo: heat?.heatNo ?? null, vesselCode: plan.vesselCode }));
        for (const [i, { plan: p, heat: h }] of pairs.entries()) {
          affected.push({ vesselCode: p.vesselCode, material: p.material, thickness: p.thickness, width: p.width, length: p.length });
          await tx.remnant.create({
            data: {
              remnantNo: nos[i],
              type: "SURPLUS",
              shape: "RECTANGLE",
              material: p.material.trim().toUpperCase(),
              thickness: p.thickness,
              width1: p.width,
              length1: p.length,
              weight: weightOf(p.thickness, p.width, p.length),
              heatNo: h?.heatNo ?? null,
              location: p.storageLocation,
              sourceVesselName: p.vesselCode,
              originalVesselName: p.vesselCode,
              registeredBy,
              memo: `${p.vesselCode} 프로젝트 강재에서 이동 (${today})`,
              status: "IN_STOCK",
              movedFromPlan: JSON.parse(JSON.stringify({ plan: p, heat: h })) as Prisma.InputJsonValue,
            },
          });
        }
        const delPlans = await tx.steelPlan.deleteMany({ where: { id: { in: ids }, ...MOVABLE } });
        if (delPlans.count !== plans.length) throw new MoveError("처리 중 강재 상태가 바뀌었습니다. 새로고침 후 다시 시도하세요.");
        if (heatIds.length) {
          const delHeats = await tx.steelPlanHeat.deleteMany({ where: { id: { in: heatIds }, status: "WAITING" } });
          if (delHeats.count !== heatIds.length) throw new MoveError("처리 중 판번호 상태가 바뀌었습니다. 새로고침 후 다시 시도하세요.");
        }
        return out;
      }, { timeout: 60_000 });

      await syncDrawingListBySpecs(affected);
      return NextResponse.json({
        success: true,
        moved: created.length,
        withHeat: created.filter(c => c.heatNo).length,
        first: created[0]?.remnantNo, last: created[created.length - 1]?.remnantNo,
      });
    }

    // ── 되돌리기 ─────────────────────────────────────────────────────────
    if (action === "restore") {
      const remnantId = String(b?.remnantId ?? "");
      const rem = await prisma.remnant.findUnique({
        where: { id: remnantId },
        include: {
          assignedToLists: { select: { id: true } },
          urgentWorks:     { select: { urgentNo: true } },
          partnerClaims:   { where: { status: { in: ["RESERVED", "USED"] } }, select: { id: true } },
          shipmentItems:   { where: { vehicle: { shipment: { status: "ACTIVE" } } }, select: { id: true } },
        },
      });
      if (!rem) return NextResponse.json({ success: false, error: "여유원재를 찾을 수 없습니다." }, { status: 404 });
      if (!rem.movedFromPlan) return NextResponse.json({ success: false, error: "프로젝트 강재에서 옮겨 온 여유원재가 아닙니다." }, { status: 409 });
      const why =
        rem.status !== "IN_STOCK" ? `재고 상태가 아닙니다(${rem.status})`
        : rem.reservedFor ? `확정돼 있습니다(${rem.reservedFor})`
        : rem.shipoutMarkedAt ? "출고 선별돼 있습니다"
        : rem.assignedToLists.length ? "도면에 지정돼 있습니다"
        : rem.urgentWorks.length ? `돌발작업에 연결돼 있습니다(${rem.urgentWorks.map(u => u.urgentNo).join(", ")})`
        : rem.partnerClaims.length ? "설계업체가 선점·사용했습니다"
        : rem.shipmentItems.length ? "외부출고돼 있습니다"
        : null;
      if (why) return NextResponse.json({ success: false, error: `되돌릴 수 없습니다 — ${why}. 이미 쓰인 여유원재는 되돌리지 않습니다.` }, { status: 409 });

      const snap = rem.movedFromPlan as { plan: Record<string, unknown>; heat: Record<string, unknown> | null };
      const P = snap.plan;
      const d = (v: unknown) => (v ? new Date(String(v)) : null);
      const spec = { vesselCode: String(P.vesselCode), material: String(P.material), thickness: Number(P.thickness), width: Number(P.width), length: Number(P.length) };

      try {
        await prisma.$transaction(async (tx) => {
          await tx.steelPlan.create({
            data: {
              id: String(P.id), ...spec,
              status: "RECEIVED",
              receivedAt: d(P.receivedAt),
              selectionPrintedAt: d(P.selectionPrintedAt),
              memo: (P.memo as string | null) ?? null,
              storageLocation: rem.location ?? (P.storageLocation as string | null) ?? null,
              sourceFile: (P.sourceFile as string | null) ?? null,
              uploadBatchNo: (P.uploadBatchNo as string | null) ?? null,
              createdAt: d(P.createdAt) ?? undefined,
            },
          });
          const H = snap.heat;
          const heatNo = (rem.heatNo?.trim() || (H?.heatNo as string | undefined) || "").trim();
          if (heatNo) {
            await tx.steelPlanHeat.create({
              data: {
                ...(H && String(H.heatNo).trim().toUpperCase() === heatNo.toUpperCase() ? { id: String(H.id), sourceFile: (H.sourceFile as string | null) ?? null, uploadBatchNo: (H.uploadBatchNo as string | null) ?? null, createdAt: d(H.createdAt) ?? undefined } : {}),
                ...spec, heatNo, status: "WAITING",
              },
            });
          }
          const del = await tx.remnant.deleteMany({ where: { id: rem.id, status: "IN_STOCK", reservedFor: null, shipoutMarkedAt: null } });
          if (del.count !== 1) throw new MoveError("처리 중 여유원재 상태가 바뀌었습니다. 새로고침 후 다시 시도하세요.");
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          return NextResponse.json({ success: false, error: "같은 강재·판번호가 이미 프로젝트 목록에 있습니다. 확인 후 다시 시도하세요." }, { status: 409 });
        }
        throw e;
      }
      await syncDrawingListBySpecs([spec]);
      return NextResponse.json({ success: true, message: `${rem.remnantNo} 를 ${spec.vesselCode} 프로젝트 강재로 되돌렸습니다.` });
    }

    return NextResponse.json({ success: false, error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (e) {
    if (e instanceof MoveError) return NextResponse.json({ success: false, error: e.message }, { status: 409 });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ success: false, error: "잔재번호가 동시 처리로 충돌했습니다. 잠시 후 다시 시도하세요." }, { status: 409 });
    }
    console.error("[POST /api/steel-plan/to-surplus]", e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "처리 오류" }, { status: 500 });
  }
}
