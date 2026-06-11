"use client";

import { useEffect, useState } from "react";
import { Plus, X, Pencil, Trash2, Check, UserPlus, Phone, Hash } from "lucide-react";

export type DriverType = "REGULAR" | "CHARTER";

export interface TransportDriver {
  id:        string;
  type:      DriverType;
  name:      string;
  vehicleNo: string | null;
  phoneNo:   string | null;
  memo:      string | null;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  open:    boolean;
  onClose: () => void;
}

interface DraftForm {
  name:      string;
  vehicleNo: string;
  phoneNo:   string;
  memo:      string;
}
const emptyDraft: DraftForm = { name: "", vehicleNo: "", phoneNo: "", memo: "" };

export default function TransportDriverModal({ open, onClose }: Props) {
  const [tab,     setTab]     = useState<DriverType>("REGULAR");
  const [drivers, setDrivers] = useState<TransportDriver[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  // 신규 등록 폼
  const [draft, setDraft] = useState<DraftForm>(emptyDraft);
  // 인라인 편집
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftForm>(emptyDraft);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/transport-drivers");
      const json = await res.json();
      if (json.success) setDrivers(json.data);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (open) {
      setError(""); setDraft(emptyDraft); setEditId(null);
      load();
    }
  }, [open]);

  if (!open) return null;

  const list = drivers.filter(d => d.type === tab);

  const handleCreate = async () => {
    setError("");
    if (!draft.name.trim()) { setError("운전자 이름을 입력해주세요."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/transport-drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: tab,
          name: draft.name,
          vehicleNo: tab === "CHARTER" ? draft.vehicleNo : "",
          phoneNo:   tab === "CHARTER" ? draft.phoneNo   : "",
          memo: draft.memo,
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "등록 실패"); return; }
      setDrivers(prev => [...prev, json.data]);
      setDraft(emptyDraft);
    } finally { setSaving(false); }
  };

  const startEdit = (d: TransportDriver) => {
    setEditId(d.id);
    setEditDraft({
      name:      d.name,
      vehicleNo: d.vehicleNo ?? "",
      phoneNo:   d.phoneNo   ?? "",
      memo:      d.memo      ?? "",
    });
    setError("");
  };
  const cancelEdit = () => { setEditId(null); setEditDraft(emptyDraft); };

  const handleEditSave = async (id: string) => {
    setError("");
    if (!editDraft.name.trim()) { setError("이름은 비울 수 없습니다."); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/transport-drivers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:      editDraft.name,
          vehicleNo: editDraft.vehicleNo,
          phoneNo:   editDraft.phoneNo,
          memo:      editDraft.memo,
        }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "수정 실패"); return; }
      setDrivers(prev => prev.map(d => d.id === id ? json.data : d));
      cancelEdit();
    } finally { setSaving(false); }
  };

  const handleDelete = async (d: TransportDriver) => {
    if (!confirm(`'${d.name}' 운전자를 삭제하시겠습니까?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/transport-drivers/${d.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) { setError(json.error || "삭제 실패"); return; }
      setDrivers(prev => prev.filter(x => x.id !== d.id));
    } finally { setSaving(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto backdrop-blur-sm"
      onClick={() => !saving && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-6" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
          <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
            <UserPlus size={18} className="text-emerald-600" /> 운전자 등록·관리
          </h3>
          <button onClick={onClose} disabled={saving} className="p-1 hover:bg-gray-100 rounded-full disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-gray-200 flex">
          {([
            { key: "REGULAR", label: "일반차량 운전자" },
            { key: "CHARTER", label: "용차차량 운전자" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setDraft(emptyDraft); setEditId(null); setError(""); }}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key ? "border-emerald-600 text-emerald-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label} <span className="ml-1 text-xs text-gray-400">({drivers.filter(d => d.type === key).length})</span>
            </button>
          ))}
        </div>

        <div className="p-6 space-y-6">
          {/* 신규 등록 폼 */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="text-xs font-semibold text-gray-600">신규 운전자 등록</div>
            <div className={`grid gap-3 ${tab === "CHARTER" ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1"}`}>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">이름 <span className="text-red-500">*</span></label>
                <input
                  value={draft.name}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="홍길동"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              {tab === "CHARTER" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><Hash size={11} /> 차량번호</label>
                    <input
                      value={draft.vehicleNo}
                      onChange={e => setDraft(d => ({ ...d, vehicleNo: e.target.value }))}
                      placeholder="12가 3456"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><Phone size={11} /> 전화번호</label>
                    <input
                      value={draft.phoneNo}
                      onChange={e => setDraft(d => ({ ...d, phoneNo: e.target.value }))}
                      placeholder="010-1234-5678"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </>
              )}
            </div>
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
            <div className="flex justify-end">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                <Plus size={14} /> {saving ? "저장 중…" : "등록"}
              </button>
            </div>
          </div>

          {/* 목록 */}
          <div>
            <div className="text-xs font-semibold text-gray-600 mb-2">등록된 운전자 {list.length}명</div>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">이름</th>
                    {tab === "CHARTER" && <>
                      <th className="px-3 py-2 text-left font-semibold">차량번호</th>
                      <th className="px-3 py-2 text-left font-semibold">전화번호</th>
                    </>}
                    <th className="px-3 py-2 text-left font-semibold">비고</th>
                    <th className="px-3 py-2 text-center font-semibold w-24">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={tab === "CHARTER" ? 5 : 3} className="py-8 text-center text-gray-400">불러오는 중…</td></tr>
                  ) : list.length === 0 ? (
                    <tr><td colSpan={tab === "CHARTER" ? 5 : 3} className="py-8 text-center text-gray-400">등록된 운전자가 없습니다</td></tr>
                  ) : (
                    list.map(d => editId === d.id ? (
                      <tr key={d.id} className="bg-amber-50">
                        <td className="px-3 py-2">
                          <input
                            value={editDraft.name}
                            onChange={e => setEditDraft(s => ({ ...s, name: e.target.value }))}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          />
                        </td>
                        {tab === "CHARTER" && <>
                          <td className="px-3 py-2">
                            <input
                              value={editDraft.vehicleNo}
                              onChange={e => setEditDraft(s => ({ ...s, vehicleNo: e.target.value }))}
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={editDraft.phoneNo}
                              onChange={e => setEditDraft(s => ({ ...s, phoneNo: e.target.value }))}
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                            />
                          </td>
                        </>}
                        <td className="px-3 py-2">
                          <input
                            value={editDraft.memo}
                            onChange={e => setEditDraft(s => ({ ...s, memo: e.target.value }))}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="inline-flex gap-1">
                            <button onClick={() => handleEditSave(d.id)} disabled={saving} className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50" title="저장"><Check size={14} /></button>
                            <button onClick={cancelEdit} disabled={saving} className="p-1 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50" title="취소"><X size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={d.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{d.name}</td>
                        {tab === "CHARTER" && <>
                          <td className="px-3 py-2 text-gray-600 font-mono text-xs">{d.vehicleNo ?? "-"}</td>
                          <td className="px-3 py-2 text-gray-600 font-mono text-xs">{d.phoneNo ?? "-"}</td>
                        </>}
                        <td className="px-3 py-2 text-gray-500 text-xs">{d.memo ?? ""}</td>
                        <td className="px-3 py-2 text-center">
                          <div className="inline-flex gap-1">
                            <button onClick={() => startEdit(d)} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="수정"><Pencil size={14} /></button>
                            <button onClick={() => handleDelete(d)} className="p-1 text-red-600 hover:bg-red-50 rounded" title="삭제"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
