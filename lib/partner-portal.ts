import { prisma } from "@/lib/prisma";
import { randomBytes } from "node:crypto";

/**
 * 협력 설계업체 공유 링크 — 공용 로직.
 *
 * 여유원재를 설계업체 3곳과 우리가 같이 쓰는데 엑셀을 주고받다 보니
 * 없는 철판에 네스팅하거나 있는 철판을 안 쓰는 일이 생겼다.
 * 여유원재 목록만 있는 별도 화면(app/partner)을 토큰 링크 하나로 연다.
 *
 * ⚠ 로그인이 없다(사용자 결정, 2026-08-21). 링크를 아는 사람은 누구나 본다.
 *   그래서 토큰을 32바이트 난수로 만들고, 유출되면 재발급해 이전 링크를 죽인다.
 *   화면에는 ERP 로 가는 링크를 하나도 두지 않는다.
 */

/** 추측 불가능한 토큰 (base64url 43자) */
export function newPortalToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 토큰이 살아 있는지 — 화면·API 모두 여기를 지난다 */
export async function verifyToken(token: string) {
  if (!token || token.length < 20) return null;
  return prisma.partnerPortal.findFirst({
    where: { token, active: true },
    select: { id: true, token: true },
  });
}

/**
 * 외부 화면에 내려줄 여유원재 목록.
 *
 * 보여줄 것만 고른다 — 잔재번호·판번호·재질·치수·중량·위치. 원가나 발생처는 안 보낸다.
 * 남이 잡은 것도 보여야 "없는 철판에 네스팅" 이 사라지므로, 소진된 것 말고는 다 내린다.
 *
 * 상태 구분
 *   AVAILABLE 아무도 안 잡음 — 선점 가능
 *   RESERVED  설계업체가 선점 중 (누가·어느 호선/블록인지 함께)
 *   INHOUSE   우리 절단 파트가 확정했거나 외부출고로 선별함 — 업체는 못 건드린다
 *   USED      소진 완료
 */
export async function listPortalRemnants() {
  const rows = await prisma.remnant.findMany({
    where: { type: "SURPLUS" },
    orderBy: [{ thickness: "asc" }, { width1: "asc" }, { remnantNo: "asc" }],
    select: {
      id: true, remnantNo: true, heatNo: true, material: true, thickness: true,
      width1: true, length1: true, weight: true, location: true, status: true,
      reservedFor: true, shipoutMarkedAt: true,
      partnerClaims: {
        where: { status: "RESERVED" },
        orderBy: { reservedAt: "desc" },
        take: 1,
        select: {
          id: true, vesselCode: true, block: true, actor: true, reservedAt: true,
          vendor: { select: { id: true, name: true } },
        },
      },
    },
  });

  return rows.map(r => {
    const claim = r.partnerClaims[0] ?? null;
    // 우리 쪽이 잡은 것 — 절단 확정(reservedFor)이나 외부출고 선별.
    // 단 그 reservedFor 가 이 포털에서 찍은 것이면 업체 선점이다(형식: "업체/호선/블록").
    const inhouse =
      !claim && (!!r.shipoutMarkedAt || (!!r.reservedFor && r.status !== "EXHAUSTED"));

    const state: "AVAILABLE" | "RESERVED" | "INHOUSE" | "USED" =
      r.status === "EXHAUSTED" ? "USED"
      : claim ? "RESERVED"
      : inhouse ? "INHOUSE"
      : "AVAILABLE";

    return {
      id: r.id,
      remnantNo: r.remnantNo,
      heatNo: r.heatNo,
      material: r.material,
      thickness: r.thickness,
      width: r.width1,
      length: r.length1,
      weight: Math.round(r.weight),
      location: r.location,
      state,
      // 선점 정보 — 누가 어디에 쓰겠다고 했는지 서로 보인다
      claim: claim
        ? {
            id: claim.id,
            vendorId: claim.vendor.id,
            vendorName: claim.vendor.name,
            vesselCode: claim.vesselCode,
            block: claim.block,
            actor: claim.actor,
            reservedAt: claim.reservedAt.toISOString(),
          }
        : null,
      // 우리 쪽이 잡았으면 무엇으로 잡았는지만 (상세는 안 보낸다)
      inhouseNote: state === "INHOUSE" ? (r.shipoutMarkedAt ? "본사 출고선별" : "본사 사용확정") : null,
    };
  });
}

export type PortalRemnant = Awaited<ReturnType<typeof listPortalRemnants>>[number];

/** 잔재의 확정정보 문자열 — ERP 목록에서 이 표기로 보인다 */
export function reservedForLabel(vendorName: string, vesselCode: string, block?: string | null) {
  return [vendorName, vesselCode, block?.trim() || null].filter(Boolean).join("/");
}
