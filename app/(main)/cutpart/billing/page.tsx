"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, Plus, Trash2, FileText, Building2, Pencil, X, UserCog } from "lucide-react";
import { fmtWon, UNIT_LABEL, RATE_MODE_LABEL } from "@/lib/billing";
import StatementEditor from "@/components/billing/statement-editor";

interface Client { id: string; name: string; bizNo?: string | null; ceo?: string | null; address?: string | null; bizType?: string | null; bizItem?: string | null; phone?: string | null; unit: string; rateMode: string; defaultRate?: number | null; addCutRate?: number | null; memo?: string | null; bomStartRow?: number; bomColHo?: string; bomColBlock?: string; bomColQty?: string; bomColWeight?: string; }
interface Stmt { id: string; ym: string; title?: string | null; status: string; total: number; supplyAmount: number; vat: number; client: { id: string; name: string }; _count: { items: number }; }

const thisYm = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
const prevYm = () => { const [y, m] = thisYm().split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

export default function BillingPage() {
  const [tab, setTab] = useState<"statements" | "clients">("statements");
  const [authorOpen, setAuthorOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><CreditCard size={22} className="text-blue-600" /> 기성관리</h2>
          <p className="text-sm text-gray-500 mt-1">원청별 월 기성청구서 작성·보관·출력 (거래명세표/출고증과는 별개)</p>
        </div>
        <button onClick={() => setAuthorOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 shrink-0"><UserCog size={15} /> 작성자 설정</button>
      </div>
      {authorOpen && <AuthorsModal onClose={() => setAuthorOpen(false)} />}
      <div className="flex gap-1 border-b border-gray-200">
        {([["statements", "기성청구"], ["clients", "원청 관리"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}>{label}</button>
        ))}
      </div>
      {tab === "statements" ? <StatementsTab /> : <ClientsTab />}
    </div>
  );
}

/* ── 기성청구 목록/작성 ─────────────────────────────────────── */
function StatementsTab() {
  const [clients, setClients] = useState<Client[]>([]);
  const [list, setList] = useState<Stmt[]>([]);
  const [fYm, setFYm] = useState("");
  const [fClient, setFClient] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [newClient, setNewClient] = useState("");
  const [newYm, setNewYm] = useState(prevYm());

  const loadClients = useCallback(async () => {
    const r = await fetch("/api/billing/clients").then(r => r.json()).catch(() => ({ success: false }));
    if (r.success) setClients(r.data);
  }, []);
  const loadList = useCallback(async () => {
    const qs = new URLSearchParams();
    if (fYm) qs.set("ym", fYm);
    if (fClient) qs.set("clientId", fClient);
    const r = await fetch(`/api/billing/statements?${qs}`).then(r => r.json()).catch(() => ({ success: false }));
    if (r.success) setList(r.data);
  }, [fYm, fClient]);
  useEffect(() => { loadClients(); }, [loadClients]);
  useEffect(() => { loadList(); }, [loadList]);

  const create = async () => {
    if (!newClient) { alert("원청을 선택하세요."); return; }
    const r = await fetch("/api/billing/statements", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: newClient, ym: newYm }),
    }).then(r => r.json());
    if (!r.success) { alert(r.error ?? "생성 실패"); return; }
    setEditId(r.data.id);
    loadList();
  };
  const remove = async (s: Stmt) => {
    if (!confirm(`${s.client.name} ${s.ym} 기성청구를 삭제하시겠습니까?`)) return;
    await fetch(`/api/billing/statements/${s.id}`, { method: "DELETE" });
    loadList();
  };

  return (
    <div className="space-y-4">
      {/* 새 기성청구 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-sm font-bold text-gray-700 mb-2">새 기성청구 작성</p>
        {clients.length === 0 ? (
          <p className="text-xs text-gray-400">먼저 [원청 관리]에서 원청을 등록하세요.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <select value={newClient} onChange={e => setNewClient(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
              <option value="">원청 선택</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="month" value={newYm} onChange={e => setNewYm(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            <button onClick={create} className="inline-flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"><Plus size={15} /> 생성</button>
          </div>
        )}
      </div>

      {/* 필터 + 목록 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-gray-700">기성청구 목록</span>
          <span className="ml-auto flex items-center gap-2">
            <input type="month" value={fYm} onChange={e => setFYm(e.target.value)} className="px-2 py-1 text-xs border border-gray-300 rounded" />
            <select value={fClient} onChange={e => setFClient(e.target.value)} className="px-2 py-1 text-xs border border-gray-300 rounded">
              <option value="">전체 원청</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {(fYm || fClient) && <button onClick={() => { setFYm(""); setFClient(""); }} className="text-xs text-gray-500 underline">초기화</button>}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-left">청구월</th>
                <th className="px-4 py-2 text-left">원청</th>
                <th className="px-4 py-2 text-left">제목</th>
                <th className="px-4 py-2 text-right">공급가액</th>
                <th className="px-4 py-2 text-right">부가세</th>
                <th className="px-4 py-2 text-right">합계</th>
                <th className="px-4 py-2 text-center">상태</th>
                <th className="px-4 py-2 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">기성청구가 없습니다.</td></tr>
              ) : list.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setEditId(s.id)}>
                  <td className="px-4 py-2 font-medium">{s.ym}</td>
                  <td className="px-4 py-2">{s.client.name}</td>
                  <td className="px-4 py-2 text-gray-600">{s.title || "기성청구서"} <span className="text-[11px] text-gray-400">({s._count.items}행)</span></td>
                  <td className="px-4 py-2 text-right font-mono">{fmtWon(s.supplyAmount)}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-500">{fmtWon(s.vat)}</td>
                  <td className="px-4 py-2 text-right font-mono font-bold">{fmtWon(s.total)}</td>
                  <td className="px-4 py-2 text-center"><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.status === "ISSUED" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{s.status === "ISSUED" ? "발행" : "작성중"}</span></td>
                  <td className="px-4 py-2 text-right" onClick={e => e.stopPropagation()}>
                    <span className="inline-flex items-center gap-2">
                      <button onClick={() => setEditId(s.id)} className="text-blue-600 hover:underline text-xs inline-flex items-center gap-1"><FileText size={13} /> 열기</button>
                      <button onClick={() => remove(s)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editId && <StatementEditor statementId={editId} onClose={() => setEditId(null)} onSaved={loadList} />}
    </div>
  );
}

/* ── 원청 관리 ─────────────────────────────────────────────── */
const EMPTY: Partial<Client> = { name: "", unit: "TON", rateMode: "BLOCK" };
function ClientsTab() {
  const [clients, setClients] = useState<Client[]>([]);
  const [editing, setEditing] = useState<Partial<Client> | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/billing/clients").then(r => r.json()).catch(() => ({ success: false }));
    if (r.success) setClients(r.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (c: Client) => {
    if (!confirm(`원청 '${c.name}' 을(를) 삭제하시겠습니까?`)) return;
    const r = await fetch(`/api/billing/clients/${c.id}`, { method: "DELETE" }).then(r => r.json());
    if (!r.success) { alert(r.error ?? "삭제 실패"); return; }
    load();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-700 flex items-center gap-1.5"><Building2 size={15} className="text-blue-500" /> 원청 목록 <span className="text-gray-400 font-normal">({clients.length})</span></span>
        <button onClick={() => setEditing({ ...EMPTY })} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"><Plus size={13} /> 원청 추가</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="px-4 py-2 text-left">상호</th>
              <th className="px-4 py-2 text-left">사업자번호</th>
              <th className="px-4 py-2 text-left">대표</th>
              <th className="px-4 py-2 text-center">단위</th>
              <th className="px-4 py-2 text-center">단가방식</th>
              <th className="px-4 py-2 text-right">추가절단(원/kg)</th>
              <th className="px-4 py-2 text-right">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clients.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">등록된 원청이 없습니다.</td></tr>
            ) : clients.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-800">{c.name}</td>
                <td className="px-4 py-2 text-gray-600 font-mono text-xs">{c.bizNo || "-"}</td>
                <td className="px-4 py-2 text-gray-600">{c.ceo || "-"}</td>
                <td className="px-4 py-2 text-center">{UNIT_LABEL[c.unit]}</td>
                <td className="px-4 py-2 text-center text-xs">{RATE_MODE_LABEL[c.rateMode]}</td>
                <td className="px-4 py-2 text-right font-mono">{c.addCutRate ? fmtWon(c.addCutRate) : "-"}</td>
                <td className="px-4 py-2 text-right">
                  <span className="inline-flex items-center gap-2">
                    <button onClick={() => setEditing(c)} className="text-blue-600 hover:underline text-xs inline-flex items-center gap-1"><Pencil size={13} /> 수정</button>
                    <button onClick={() => remove(c)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <ClientForm value={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function ClientForm({ value, onClose, onSaved }: { value: Partial<Client>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Client>>(value);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Client, v: unknown) => setF(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!f.name?.trim()) { alert("상호를 입력하세요."); return; }
    setBusy(true);
    try {
      const isNew = !f.id;
      const r = await fetch(isNew ? "/api/billing/clients" : `/api/billing/clients/${f.id}`, {
        method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
      }).then(r => r.json());
      if (!r.success) { alert(r.error ?? "저장 실패"); return; }
      onSaved();
    } finally { setBusy(false); }
  };

  const field = (k: keyof Client, label: string, ph = "") => (
    <label className="text-xs text-gray-500">{label}
      <input value={(f[k] as string) ?? ""} onChange={e => set(k, e.target.value)} placeholder={ph} className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{f.id ? "원청 수정" : "원청 추가"}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400"><X size={18} /></button>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">{field("name", "상호 *", "(주) 삼정테크")}</div>
          {field("bizNo", "사업자등록번호")}
          {field("ceo", "대표자")}
          <div className="col-span-2">{field("address", "사업장 소재지")}</div>
          {field("bizType", "업태")}
          {field("bizItem", "종목")}
          {field("phone", "연락처")}
          <label className="text-xs text-gray-500">청구 단위
            <select value={f.unit ?? "TON"} onChange={e => set("unit", e.target.value)} className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded">
              <option value="TON">TON (톤)</option><option value="KG">KG</option>
            </select>
          </label>
          <label className="text-xs text-gray-500">단가 방식
            <select value={f.rateMode ?? "BLOCK"} onChange={e => set("rateMode", e.target.value)} className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded">
              <option value="BLOCK">블록별 단가표</option><option value="FLAT">단일 요율</option>
            </select>
          </label>
          <label className="text-xs text-gray-500">기본 요율 (단일요율, 원/단위)
            <input value={(f.defaultRate as number) ?? ""} onChange={e => set("defaultRate", e.target.value)} inputMode="numeric" className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded text-right" />
          </label>
          <label className="text-xs text-gray-500">추가절단 단가 (원/kg)
            <input value={(f.addCutRate as number) ?? ""} onChange={e => set("addCutRate", e.target.value)} inputMode="numeric" className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded text-right" />
          </label>
          <div className="col-span-2 border-t border-gray-100 pt-3 mt-1">
            <p className="text-xs font-semibold text-gray-500 mb-2">BOM 업로드 열 매핑 <span className="text-gray-400 font-normal">(엑셀 첨부 시 읽을 위치 — 원청마다 다름)</span></p>
            <div className="grid grid-cols-5 gap-2">
              <label className="text-[11px] text-gray-500 text-center">시작 행<input value={(f.bomStartRow as number) ?? 3} onChange={e => set("bomStartRow", e.target.value)} inputMode="numeric" className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded text-center" /></label>
              <label className="text-[11px] text-gray-500 text-center">호선 열<input value={(f.bomColHo as string) ?? "A"} onChange={e => set("bomColHo", e.target.value.toUpperCase())} className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded text-center" /></label>
              <label className="text-[11px] text-gray-500 text-center">블록 열<input value={(f.bomColBlock as string) ?? "B"} onChange={e => set("bomColBlock", e.target.value.toUpperCase())} className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded text-center" /></label>
              <label className="text-[11px] text-gray-500 text-center">수량 열<input value={(f.bomColQty as string) ?? "H"} onChange={e => set("bomColQty", e.target.value.toUpperCase())} className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded text-center" /></label>
              <label className="text-[11px] text-gray-500 text-center">중량 열<input value={(f.bomColWeight as string) ?? "I"} onChange={e => set("bomColWeight", e.target.value.toUpperCase())} className="mt-0.5 w-full px-2 py-1.5 text-sm border border-gray-300 rounded text-center" /></label>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">마지막 합계 행은 자동으로 제외됩니다. (호선·블록이 빈 행 또는 &apos;합계&apos; 포함 행)</p>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">{busy ? "저장 중..." : "저장"}</button>
        </div>
      </div>
    </div>
  );
}

/* ── 작성자 설정 모달 ─────────────────────────────────────── */
function AuthorsModal({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<{ id: string; name: string; title: string | null }[]>([]);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/billing/authors").then(r => r.json()).catch(() => ({ success: false }));
    if (r.success) setList(r.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!name.trim()) { alert("이름을 입력하세요."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/billing/authors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, title }) }).then(r => r.json());
      if (!r.success) { alert(r.error ?? "추가 실패"); return; }
      setName(""); setTitle(""); load();
    } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!confirm("작성자를 삭제하시겠습니까?")) return;
    await fetch(`/api/billing/authors/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><UserCog size={18} className="text-blue-600" /> 작성자 설정</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-400"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-500">표지(기성요청서) 작성자에 표시됩니다. 기성청구 작성 시 선택.</p>
          <div className="flex gap-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="이름 (예: 김동언)" className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="직책 (예: 차장)" className="w-28 px-3 py-2 text-sm border border-gray-300 rounded-lg" />
            <button onClick={add} disabled={busy} className="px-3 py-2 text-sm bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"><Plus size={15} /></button>
          </div>
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
            {list.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-gray-400">등록된 작성자가 없습니다.</p>
            ) : list.map(a => (
              <div key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>{a.name}{a.title ? <span className="text-gray-500"> {a.title}</span> : null}</span>
                <button onClick={() => remove(a.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
