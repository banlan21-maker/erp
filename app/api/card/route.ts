import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/card — 등록된 법인카드 목록
export async function GET() {
  try {
    const data = await prisma.corporateCard.findMany({ orderBy: { cardNo: "asc" } });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GET /api/card]", error);
    return NextResponse.json({ success: false, error: "조회 오류" }, { status: 500 });
  }
}

const VALID_OWNERS = ["진교", "진동"] as const;
type Owner = (typeof VALID_OWNERS)[number];
const validateOwner = (label: unknown): Owner | null => {
  if (typeof label !== "string") return null;
  const v = label.trim();
  return (VALID_OWNERS as readonly string[]).includes(v) ? (v as Owner) : null;
};

// POST /api/card — 카드 추가  body: { cardNo, label(관리주체: 진교|진동) }
export async function POST(request: NextRequest) {
  try {
    const { cardNo, label } = await request.json();
    const no = String(cardNo ?? "").trim();
    if (!/^\d{4}$/.test(no)) {
      return NextResponse.json({ success: false, error: "카드번호는 4자리 숫자로 입력하세요." }, { status: 400 });
    }
    const owner = validateOwner(label);
    if (!owner) {
      return NextResponse.json({ success: false, error: "관리주체(진교/진동)를 선택하세요." }, { status: 400 });
    }
    const exists = await prisma.corporateCard.findUnique({ where: { cardNo: no } });
    if (exists) return NextResponse.json({ success: false, error: `카드 '${no}'는 이미 등록되어 있습니다.` }, { status: 409 });
    const card = await prisma.corporateCard.create({ data: { cardNo: no, label: owner } });
    return NextResponse.json({ success: true, data: card });
  } catch (error) {
    console.error("[POST /api/card]", error);
    return NextResponse.json({ success: false, error: "저장 오류" }, { status: 500 });
  }
}

// PATCH /api/card — 기존 카드 관리주체 수정  body: { cardNo, label }
export async function PATCH(request: NextRequest) {
  try {
    const { cardNo, label } = await request.json();
    const no = String(cardNo ?? "").trim();
    if (!/^\d{4}$/.test(no)) {
      return NextResponse.json({ success: false, error: "카드번호가 올바르지 않습니다." }, { status: 400 });
    }
    const owner = validateOwner(label);
    if (!owner) {
      return NextResponse.json({ success: false, error: "관리주체(진교/진동)를 선택하세요." }, { status: 400 });
    }
    const card = await prisma.corporateCard.update({ where: { cardNo: no }, data: { label: owner } });
    return NextResponse.json({ success: true, data: card });
  } catch (error) {
    console.error("[PATCH /api/card]", error);
    return NextResponse.json({ success: false, error: "수정 오류" }, { status: 500 });
  }
}

// DELETE /api/card?cardNo=8219
export async function DELETE(request: NextRequest) {
  try {
    const cardNo = new URL(request.url).searchParams.get("cardNo");
    if (!cardNo) return NextResponse.json({ success: false, error: "cardNo 필요" }, { status: 400 });
    await prisma.corporateCard.deleteMany({ where: { cardNo } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/card]", error);
    return NextResponse.json({ success: false, error: "삭제 오류" }, { status: 500 });
  }
}
