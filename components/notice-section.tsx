"use client";

import { useState, useCallback } from "react";
import { Plus, Pin, Pencil, Trash2, X, Save, ChevronDown, ChevronUp } from "lucide-react";

export interface Notice {
  id: string;
  category: "NOTICE" | "MANAGEMENT";
  title: string;
  content: string;
  author: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  category: "NOTICE" | "MANAGEMENT";
  initialNotices: Notice[];
  title: string;
  accentColor: string; // tailwind color class prefix e.g. "blue" | "purple"
}

const emptyForm = { title: "", content: "", author: "", isPinned: false };

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function NoticeSection({ category, initialNotices, title, accentColor }: Props) {
  const [notices, setNotices] = useState<Notice[]>(initialNotices);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const accent = {
    blue:   { border: "border-blue-500",   bg: "bg-blue-50",   text: "text-blue-700",   btn: "bg-blue-600 hover:bg-blue-700",   pin: "bg-blue-100 text-blue-700"   },
    purple: { border: "border-purple-500", bg: "bg-purple-50", text: "text-purple-700", btn: "bg-purple-600 hover:bg-purple-700", pin: "bg-purple-100 text-purple-700" },
  }[accentColor] ?? {
    border: "border-gray-400", bg: "bg-gray-50", text: "text-gray-700", btn: "bg-gray-600 hover:bg-gray-700", pin: "bg-gray-100 text-gray-600"
  };

  const openAdd = () => { setForm(emptyForm); setEditId(null); setShowForm(true); };
  const openEdit = (n: Notice) => {
    setForm({ title: n.title, content: n.content, author: n.author, isPinned: n.isPinned });
    setEditId(n.id);
    setShowForm(true);
    setExpandedId(null);
  };

  const handleSave = useCallback(async () => {
    if (!form.title.trim() || !form.author.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        const res = await fetch(`/api/notice/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form }),
        });
        const data = await res.json();
        if (data.success) {
          setNotices(prev => prev
            .map(n => n.id === editId ? { ...n, ...data.data, createdAt: n.createdAt } : n)
            .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          );
        }
      } else {
        const res = await fetch("/api/notice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, category }),
        });
        const data = await res.json();
        if (data.success) {
          setNotices(prev => {
            const next = [data.data, ...prev];
            return next.sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          });
        }
      }
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
    } finally {
      setSaving(false);
    }
  }, [form, editId, category]);

  const handleDelete = useCallback(async (id: string) => {
    await fetch(`/api/notice/${id}`, { method: "DELETE" });
    setNotices(prev => prev.filter(n => n.id !== id));
    setDeleteConfirmId(null);
    setExpandedId(null);
  }, []);

  const togglePin = useCallback(async (n: Notice) => {
    const res = await fetch(`/api/notice/${n.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPinned: !n.isPinned }),
    });
    const data = await res.json();
    if (data.success) {
      setNotices(prev =>
        prev
          .map(x => x.id === n.id ? { ...x, isPinned: !n.isPinned } : x)
          .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      );
    }
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      {/* 헤더 */}
      <div className={`px-5 py-4 border-b border-gray-100 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`w-1 h-5 rounded-full ${accent.border.replace("border-", "bg-")}`} />
          <h3 className="font-bold text-gray-900">{title}</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{notices.length}건</span>
        </div>
        <button
          onClick={showForm && !editId ? () => setShowForm(false) : openAdd}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-colors ${accent.btn}`}
        >
          {showForm && !editId ? <><X size={13} />닫기</> : <><Plus size={13} />글쓰기</>}
        </button>
      </div>

      {/* 작성/수정 폼 */}
      {showForm && (
        <div className={`px-5 py-4 border-b ${accent.bg} border-${accentColor}-100`}>
          <div className="space-y-3">
            <div className="flex gap-3">
              <input
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="제목"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              />
              <input
                className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="작성자"
                value={form.author}
                onChange={e => setForm(p => ({ ...p, author: e.target.value }))}
              />
            </div>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="내용"
              rows={3}
              value={form.content}
              onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.isPinned}
                  onChange={e => setForm(p => ({ ...p, isPinned: e.target.checked }))}
                  className="rounded"
                />
                <Pin size={13} /> 상단 고정
              </label>
              <div className="flex gap-2">
                <button onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); }} className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.title.trim() || !form.author.trim()}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 ${accent.btn}`}
                >
                  <Save size={13} />{saving ? "저장 중..." : editId ? "수정 완료" : "등록"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 목록 */}
      <div className="flex-1 divide-y divide-gray-50">
        {notices.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">등록된 내용이 없습니다.</div>
        ) : (
          notices.map(n => (
            <div key={n.id} className="group">
              {/* 제목 행 */}
              <div
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
              >
                {n.isPinned && (
                  <Pin size={12} className={`flex-shrink-0 ${accent.text}`} />
                )}
                <p className={`flex-1 text-sm font-medium truncate ${n.isPinned ? "text-gray-900" : "text-gray-700"}`}>
                  {n.isPinned && <span className={`mr-2 text-xs px-1.5 py-0.5 rounded font-bold ${accent.pin}`}>공지</span>}
                  {n.title}
                </p>
                <span className="text-xs text-gray-400 flex-shrink-0">{n.author}</span>
                <span className="text-xs text-gray-400 flex-shrink-0 font-mono">{formatDate(n.createdAt)}</span>
                {expandedId === n.id ? <ChevronUp size={14} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />}
              </div>

              {/* 펼침 내용 */}
              {expandedId === n.id && (
                <div className={`px-5 pb-4 ${accent.bg}`}>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed py-3 px-4 bg-white rounded-xl border border-gray-100">
                    {n.content || <span className="text-gray-400 italic">내용 없음</span>}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-gray-400">
                      작성: {n.author} · {formatDate(n.createdAt)}
                      {n.updatedAt !== n.createdAt && ` (수정됨)`}
                    </span>
                    <div className="flex items-center gap-2">
                      {/* 핀 토글 */}
                      <button
                        onClick={() => togglePin(n)}
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${
                          n.isPinned ? `${accent.pin} border-transparent` : "border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        <Pin size={11} />{n.isPinned ? "고정 해제" : "상단 고정"}
                      </button>
                      <button onClick={() => openEdit(n)} className="flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                        <Pencil size={11} />수정
                      </button>
                      {deleteConfirmId === n.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-red-600 font-medium">삭제할까요?</span>
                          <button onClick={() => handleDelete(n.id)} className="text-xs px-2 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700">확인</button>
                          <button onClick={() => setDeleteConfirmId(null)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">취소</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirmId(n.id)} className="flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-500 hover:text-red-600 hover:border-red-300">
                          <Trash2 size={11} />삭제
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
