export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, hashPassword, PERMISSION_KEYS } from "@/lib/admin-auth";

// GET /api/admin/accounts — 계정 목록 (관리자만)
export async function GET(req: NextRequest) {
  const me = await getSessionUser(req);
  if (!me) return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ success: false, error: "관리자 권한이 필요합니다." }, { status: 403 });

  const users = await prisma.appUser.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, name: true, isAdmin: true, permissions: true, createdAt: true },
  });
  return NextResponse.json({ success: true, data: users });
}

// POST /api/admin/accounts  { username, password, name, permissions } — 계정 생성 (관리자만)
export async function POST(req: NextRequest) {
  const me = await getSessionUser(req);
  if (!me) return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ success: false, error: "관리자 권한이 필요합니다." }, { status: 403 });

  try {
    const body = await req.json();
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "");
    const name = String(body?.name ?? "").trim() || null;
    const perms = Array.isArray(body?.permissions) ? body.permissions : [];
    const permissions = PERMISSION_KEYS.filter(k => perms.includes(k)); // 화이트리스트

    if (!/^[A-Za-z0-9_.-]{3,20}$/.test(username)) {
      return NextResponse.json({ success: false, error: "아이디는 영문/숫자 3~20자로 입력하세요." }, { status: 400 });
    }
    if (password.length < 4) {
      return NextResponse.json({ success: false, error: "비밀번호는 4자 이상이어야 합니다." }, { status: 400 });
    }
    const dup = await prisma.appUser.findUnique({ where: { username }, select: { id: true } });
    if (dup) return NextResponse.json({ success: false, error: "이미 존재하는 아이디입니다." }, { status: 409 });

    const created = await prisma.appUser.create({
      data: { username, passwordHash: hashPassword(password), name, isAdmin: false, permissions },
      select: { id: true, username: true, name: true, isAdmin: true, permissions: true, createdAt: true },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
