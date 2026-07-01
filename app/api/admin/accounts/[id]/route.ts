export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, hashPassword, PERMISSION_KEYS } from "@/lib/admin-auth";

// PATCH /api/admin/accounts/[id]  { name?, password?, permissions? } — 계정 수정 (관리자만)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser(req);
  if (!me) return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ success: false, error: "관리자 권한이 필요합니다." }, { status: 403 });

  try {
    const { id } = await params;
    const target = await prisma.appUser.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ success: false, error: "계정을 찾을 수 없습니다." }, { status: 404 });

    const body = await req.json();
    const data: { name?: string | null; passwordHash?: string; permissions?: string[] } = {};
    if (body?.name !== undefined) data.name = String(body.name).trim() || null;
    if (body?.password) {
      if (String(body.password).length < 4) return NextResponse.json({ success: false, error: "비밀번호는 4자 이상이어야 합니다." }, { status: 400 });
      data.passwordHash = hashPassword(String(body.password));
    }
    if (Array.isArray(body?.permissions)) {
      data.permissions = PERMISSION_KEYS.filter(k => body.permissions.includes(k));
    }
    const updated = await prisma.appUser.update({
      where: { id }, data,
      select: { id: true, username: true, name: true, isAdmin: true, permissions: true, createdAt: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// DELETE /api/admin/accounts/[id] — 계정 삭제 (관리자만, 기본관리자/본인 제외)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser(req);
  if (!me) return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ success: false, error: "관리자 권한이 필요합니다." }, { status: 403 });

  try {
    const { id } = await params;
    const target = await prisma.appUser.findUnique({ where: { id }, select: { id: true, username: true } });
    if (!target) return NextResponse.json({ success: true }); // 이미 없음
    if (target.username === "admin") return NextResponse.json({ success: false, error: "기본 관리자(admin) 계정은 삭제할 수 없습니다." }, { status: 400 });
    if (target.id === me.id) return NextResponse.json({ success: false, error: "현재 로그인한 본인 계정은 삭제할 수 없습니다." }, { status: 400 });
    await prisma.appUser.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
