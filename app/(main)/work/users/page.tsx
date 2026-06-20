"use client";

import { useState } from "react";
import { UserPlus, Trash2, Check, X, Pencil } from "lucide-react";
import { useWorkUser, type WorkUser } from "@/components/work-user-context";

const COLORS = ["#6366f1", "#2563eb", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#7c3aed", "#475569"];

export default function WorkUsersPage() {
  const { users, reloadUsers, currentUserId, setCurrentUserId } = useWorkUser();
  const [name, setName] = useState("");
  const [dept, setDept] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDept, setEditDept] = useState("");

  const add = async () => {
    if (!name.trim()) { alert("이름을 입력하세요."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/work/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), dept: dept.trim() || null, color }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error ?? "등록 실패"); return; }
      setName(""); setDept("");
      await reloadUsers();
    } finally { setBusy(false); }
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/work/users/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!d.success) { alert(d.error ?? "수정 실패"); return false; }
    await reloadUsers();
    return true;
  };

  const saveEdit = async () => {
    if (!editId) return;
    if (await patch(editId, { name: editName.trim(), dept: editDept.trim() || null })) setEditId(null);
  };

  const remove = async (u: WorkUser) => {
    if (!confirm(`'${u.name}' 사용자를 삭제하시겠습니까?\n이 사용자의 업무일지·작성글·멘션이 함께 삭제됩니다.`)) return;
    const r = await fetch(`/api/work/users/${u.id}`, { method: "DELETE" });
    const d = await r.json();
    if (!d.success) { alert(d.error ?? "삭제 실패"); return; }
    if (currentUserId === u.id) setCurrentUserId(null);
    await reloadUsers();
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-gray-800">사용자 등록</h2>
        <p className="text-sm text-gray-500 mt-0.5">업무관리에서 업무일지를 작성하고 @멘션으로 소환할 수 있는 사용자를 등록합니다.</p>
      </div>

      {/* 등록 폼 */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">이름 *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 김남훈"
              onKeyDown={e => { if (e.key === "Enter") add(); }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg w-40 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">부서/팀</label>
            <input value={dept} onChange={e => setDept(e.target.value)} placeholder="예: 절단파트"
              onKeyDown={e => { if (e.key === "Enter") add(); }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg w-40 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">색상</label>
            <div className="flex items-center gap-1">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} title={c}
                  className={`w-6 h-6 rounded-full border-2 ${color === c ? "border-gray-800 scale-110" : "border-white"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <button onClick={add} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            <UserPlus size={15} /> 등록
          </button>
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600">
            <tr>
              <th className="px-4 py-2 text-left font-medium">이름</th>
              <th className="px-4 py-2 text-left font-medium">부서/팀</th>
              <th className="px-4 py-2 text-center font-medium">상태</th>
              <th className="px-4 py-2 text-center font-medium w-40">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.length === 0 ? (
              <tr><td colSpan={4} className="py-10 text-center text-gray-400">등록된 사용자가 없습니다.</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  {editId === u.id ? (
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      className="px-2 py-1 text-sm border border-gray-300 rounded w-32" autoFocus />
                  ) : (
                    <span className="inline-flex items-center gap-2 font-medium">
                      <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: u.color || "#6366f1" }} />
                      {u.name}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {editId === u.id ? (
                    <input value={editDept} onChange={e => setEditDept(e.target.value)}
                      className="px-2 py-1 text-sm border border-gray-300 rounded w-32" />
                  ) : (u.dept || "-")}
                </td>
                <td className="px-4 py-2 text-center">
                  <button onClick={() => patch(u.id, { active: !u.active })}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${u.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
                    {u.active ? "활성" : "비활성"}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-center gap-1">
                    {editId === u.id ? (
                      <>
                        <button onClick={saveEdit} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="저장"><Check size={15} /></button>
                        <button onClick={() => setEditId(null)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="취소"><X size={15} /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditId(u.id); setEditName(u.name); setEditDept(u.dept ?? ""); }}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="수정"><Pencil size={14} /></button>
                        <button onClick={() => remove(u)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="삭제"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
