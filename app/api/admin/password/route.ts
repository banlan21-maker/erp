export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, verifyPassword, hashPassword } from "@/lib/admin-auth";

// POST /api/admin/password  { currentPassword, newPassword } — 로그인 사용자 본인 비밀번호 변경
export async function POST(req: NextRequest) {
  try {
    const me = await getSessionUser(req);
    if (!me) return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });

    const body = await req.json();
    const currentPassword = String(body?.currentPassword ?? "");
    const newPassword = String(body?.newPassword ?? "");

    if (!verifyPassword(currentPassword, me.passwordHash)) {
      return NextResponse.json({ success: false, error: "현재 비밀번호가 올바르지 않습니다." }, { status: 400 });
    }
    if (newPassword.length < 4) {
      return NextResponse.json({ success: false, error: "새 비밀번호는 4자 이상이어야 합니다." }, { status: 400 });
    }
    await prisma.appUser.update({ where: { id: me.id }, data: { passwordHash: hashPassword(newPassword) } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
