import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { newPortalToken } from "@/lib/partner-portal";

export const dynamic = "force-dynamic";

/**
 * 협력업체 공유 링크 관리 — ERP 안에서만 쓴다(외부 화면은 app/partner).
 *
 * GET    /api/partner-admin                      링크·업체·최근 기록
 * POST   /api/partner-admin  { action }
 *   issue          링크 발급/재발급 (이전 링크는 죽는다)
 *   revoke         현재 링크 폐기
 *   vendorAdd      업체 추가        { name }
 *   vendorRename   업체 이름 변경    { id, name }
 *   vendorToggle   업체 사용/중지    { id, active }
 *   claimRelease   본사에서 선점 강제 해제 { claimId }
 */

export async function GET() {
  try {
    const [portal, vendors, claims] = await Promise.all([
      prisma.partnerPortal.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } }),
      prisma.partnerVendor.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.partnerClaim.findMany({
        orderBy: { reservedAt: "desc" },
        take: 100,
        include: {
          vendor: { select: { name: true } },
          remnant: { select: { remnantNo: true, material: true, thickness: true, width1: true, length1: true, weight: true, status: true } },
        },
      }),
    ]);
    return NextResponse.json({ success: true, data: { portal, vendors, claims } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "조회 오류" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const action = String(b?.action ?? "");

    if (action === "issue") {
      const token = newPortalToken();
      const created = await prisma.$transaction(async (tx) => {
        // 이전 링크를 죽인다 — 한 번에 하나만 살아 있다
        await tx.partnerPortal.updateMany({
          where: { active: true },
          data:  { active: false, revokedAt: new Date() },
        });
        return tx.partnerPortal.create({
          data: { token, memo: b.memo?.toString().trim() || null },
        });
      });
      return NextResponse.json({ success: true, data: created, message: "새 링크를 발급했습니다. 이전 링크는 더 이상 열리지 않습니다." });
    }

    if (action === "revoke") {
      const n = await prisma.partnerPortal.updateMany({
        where: { active: true },
        data:  { active: false, revokedAt: new Date() },
      });
      return NextResponse.json({ success: true, message: `링크 ${n.count}건을 폐기했습니다.` });
    }

    if (action === "vendorAdd") {
      const name = String(b.name ?? "").trim();
      if (!name) return NextResponse.json({ success: false, error: "업체명을 입력하세요." }, { status: 400 });
      const dup = await prisma.partnerVendor.findUnique({ where: { name } });
      if (dup) return NextResponse.json({ success: false, error: `'${name}' 은 이미 있습니다.` }, { status: 409 });
      const v = await prisma.partnerVendor.create({ data: { name, sortOrder: Number(b.sortOrder) || 0 } });
      return NextResponse.json({ success: true, data: v });
    }

    if (action === "vendorRename") {
      const name = String(b.name ?? "").trim();
      if (!name) return NextResponse.json({ success: false, error: "업체명을 입력하세요." }, { status: 400 });
      const v = await prisma.partnerVendor.update({ where: { id: String(b.id) }, data: { name } });
      return NextResponse.json({ success: true, data: v });
    }

    if (action === "vendorToggle") {
      const v = await prisma.partnerVendor.update({
        where: { id: String(b.id) },
        data:  { active: b.active === true },
      });
      return NextResponse.json({ success: true, data: v });
    }

    // 본사에서 선점을 강제로 푼다 — 업체가 잡아두고 안 쓰는 경우
    if (action === "claimRelease") {
      const claim = await prisma.partnerClaim.findUnique({
        where: { id: String(b.claimId) },
        select: { id: true, status: true, remnantId: true },
      });
      if (!claim) return NextResponse.json({ success: false, error: "기록을 찾을 수 없습니다." }, { status: 404 });
      if (claim.status !== "RESERVED") {
        return NextResponse.json({ success: false, error: "선점 상태가 아닙니다." }, { status: 409 });
      }
      await prisma.$transaction(async (tx) => {
        await tx.partnerClaim.update({ where: { id: claim.id }, data: { status: "RELEASED", releasedAt: new Date() } });
        await tx.remnant.updateMany({ where: { id: claim.remnantId, status: "IN_STOCK" }, data: { reservedFor: null } });
      });
      return NextResponse.json({ success: true, message: "선점을 해제했습니다." });
    }

    return NextResponse.json({ success: false, error: "알 수 없는 요청입니다." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "처리 오류" }, { status: 500 });
  }
}
