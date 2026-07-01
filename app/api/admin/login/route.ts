export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureAdminSeed, verifyPassword, newToken, ADMIN_COOKIE } from "@/lib/admin-auth";

// POST /api/admin/login  { username, password }
export async function POST(req: NextRequest) {
  try {
    await ensureAdminSeed();
    const body = await req.json();
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");
    if (!username || !password) {
      return NextResponse.json({ success: false, error: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
    }
    const user = await prisma.appUser.findUnique({ where: { username } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ success: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }
    const token = newToken();
    await prisma.appUser.update({ where: { id: user.id }, data: { sessionToken: token } });

    const res = NextResponse.json({
      success: true,
      user: { username: user.username, name: user.name, isAdmin: user.isAdmin },
    });
    res.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12, // 12h
    });
    return res;
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
