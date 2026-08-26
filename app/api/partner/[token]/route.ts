import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken, listPortalRemnants, reservedForLabel } from "@/lib/partner-portal";

export const dynamic = "force-dynamic";

/**
 * 협력 설계업체 공유 화면의 API — 토큰 하나로 모든 업체가 쓴다.
 *
 * GET    /api/partner/[token]                        목록 + 업체 선택지
 * POST   /api/partner/[token]  { action, ... }       선점 / 해제 / 사용확정
 *
 * 업체 구분은 자기 신고다(링크가 하나뿐이라 — 사용자 결정). 대신 무엇을 했는지 전부 기록한다.
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await verifyToken(token);
  if (!portal) return NextResponse.json({ success: false, error: "링크가 유효하지 않습니다." }, { status: 404 });

  const [remnants, vendors] = await Promise.all([
    listPortalRemnants(),
    prisma.partnerVendor.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  return NextResponse.json({ success: true, data: { remnants, vendors } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const portal = await verifyToken(token);
    if (!portal) return NextResponse.json({ success: false, error: "링크가 유효하지 않습니다." }, { status: 404 });

    const b = await req.json();
    const action: string = String(b?.action ?? "");

    // ── 선점 ────────────────────────────────────────────────────────────
    if (action === "reserve") {
      const remnantId = String(b.remnantId ?? "");
      const vendorId  = String(b.vendorId ?? "");
      const vessel    = String(b.vesselCode ?? "").trim();
      const block     = String(b.block ?? "").trim() || null;
      const actor     = String(b.actor ?? "").trim() || null;
      const memo      = String(b.memo ?? "").trim() || null;

      if (!remnantId || !vendorId) return NextResponse.json({ success: false, error: "업체와 자재를 선택하세요." }, { status: 400 });
      if (!vessel) return NextResponse.json({ success: false, error: "호선을 입력하세요." }, { status: 400 });

      const vendor = await prisma.partnerVendor.findFirst({ where: { id: vendorId, active: true } });
      if (!vendor) return NextResponse.json({ success: false, error: "업체를 찾을 수 없습니다." }, { status: 404 });

      const label = reservedForLabel(vendor.name, vessel, block);

      const result = await prisma.$transaction(async (tx) => {
        // 아직 아무도 안 잡았을 때만 잡는다 — 두 업체가 동시에 눌러도 한쪽만 성공한다.
        //   (읽고 나서 따로 쓰면 둘 다 통과한다. 자재 파트에서 같은 문제를 겪었다)
        const taken = await tx.remnant.updateMany({
          where: { id: remnantId, type: "SURPLUS", status: "IN_STOCK", reservedFor: null, shipoutMarkedAt: null },
          data:  { reservedFor: label },
        });
        if (taken.count !== 1) {
          const cur = await tx.remnant.findUnique({
            where: { id: remnantId },
            select: { remnantNo: true, status: true, reservedFor: true, shipoutMarkedAt: true },
          });
          const why = !cur ? "없어진 자재입니다"
            : cur.status === "EXHAUSTED" ? "이미 사용 완료된 자재입니다"
            : cur.shipoutMarkedAt ? "본사가 외부출고로 선별한 자재입니다"
            : cur.reservedFor ? `이미 선점되었습니다 (${cur.reservedFor})`
            : "지금은 선점할 수 없습니다";
          throw new Error(`${cur?.remnantNo ?? ""} ${why}. 목록을 새로고침해 주세요.`);
        }
        return tx.partnerClaim.create({
          data: { remnantId, vendorId, vesselCode: vessel, block, actor, memo, status: "RESERVED" },
          select: { id: true },
        });
      }, { maxWait: 5000, timeout: 15000 });

      return NextResponse.json({ success: true, data: result, message: `${label} 로 선점했습니다.` });
    }

    // ── 선점 해제 ───────────────────────────────────────────────────────
    if (action === "release") {
      const claimId = String(b.claimId ?? "");
      const claim = await prisma.partnerClaim.findUnique({
        where: { id: claimId },
        select: { id: true, status: true, remnantId: true, vendor: { select: { name: true } } },
      });
      if (!claim) return NextResponse.json({ success: false, error: "선점 기록을 찾을 수 없습니다." }, { status: 404 });
      if (claim.status !== "RESERVED") {
        return NextResponse.json({ success: false, error: "이미 사용확정되었거나 해제된 건입니다." }, { status: 409 });
      }

      await prisma.$transaction(async (tx) => {
        await tx.partnerClaim.update({
          where: { id: claimId },
          data:  { status: "RELEASED", releasedAt: new Date() },
        });
        // 선점 표시만 푼다 — 재고 상태는 건드리지 않는다
        await tx.remnant.updateMany({
          where: { id: claim.remnantId, status: "IN_STOCK" },
          data:  { reservedFor: null },
        });
      }, { maxWait: 5000, timeout: 15000 });

      return NextResponse.json({ success: true, message: "선점을 해제했습니다." });
    }

    // ── 사용확정 ────────────────────────────────────────────────────────
    if (action === "use") {
      const claimId = String(b.claimId ?? "");
      const memo    = String(b.memo ?? "").trim() || null;

      const claim = await prisma.partnerClaim.findUnique({
        where: { id: claimId },
        select: {
          id: true, status: true, remnantId: true, vesselCode: true, block: true,
          vendor: { select: { name: true } },
        },
      });
      if (!claim) return NextResponse.json({ success: false, error: "선점 기록을 찾을 수 없습니다." }, { status: 404 });
      if (claim.status !== "RESERVED") {
        return NextResponse.json({ success: false, error: "이미 사용확정되었거나 해제된 건입니다." }, { status: 409 });
      }

      const label = reservedForLabel(claim.vendor.name, claim.vesselCode, claim.block);
      const stamp = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());

      await prisma.$transaction(async (tx) => {
        // 재고일 때만 소진 처리 — 그 사이 본사가 썼으면 여기서 멈춘다
        const done = await tx.remnant.updateMany({
          where: { id: claim.remnantId, status: "IN_STOCK" },
          data: {
            status: "EXHAUSTED",
            reservedFor: label,
            // 어디에 썼는지는 메모에 남긴다 — ERP 잔재관리에서 그대로 보인다
            memo: `[설계업체] ${stamp} ${label} 사용확정${memo ? " · " + memo : ""}`,
          },
        });
        if (done.count !== 1) throw new Error("이미 처리된 자재입니다. 목록을 새로고침해 주세요.");

        await tx.partnerClaim.update({
          where: { id: claimId },
          data:  { status: "USED", usedAt: new Date(), ...(memo ? { memo } : {}) },
        });
      }, { maxWait: 5000, timeout: 15000 });

      return NextResponse.json({ success: true, message: `${label} 사용확정 처리했습니다.` });
    }

    return NextResponse.json({ success: false, error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "처리 중 오류가 발생했습니다.";
    return NextResponse.json({ success: false, error: msg }, { status: 409 });
  }
}
