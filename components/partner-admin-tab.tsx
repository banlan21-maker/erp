"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, RefreshCw, Copy, Plus, Check, X, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 협력업체 공유 링크 관리 — 잔재관리 안에 둔다.
 *
 * 링크 하나를 세 업체가 같이 쓴다(사용자 결정). 업체 구분은 선점할 때 고르는 자기 신고라,
 * 여기서 무엇을 누가 가져갔는지 기록을 본다. 잡아두고 안 쓰면 본사가 강제로 풀 수 있다.
 */

interface Portal { id: string; token: string; createdAt: string; memo: string | null }
interface Vendor { id: string; name: string; active: boolean }
interface Claim {
  id: string; status: "RESERVED" | "USED" | "RELEASED";
  vesselCode: string; block: string | null; actor: string | null; memo: string | null;
  reservedAt: string; usedAt: string | null; releasedAt: string | null;
  vendor: { name: string };
  remnant: { remnantNo: string; material: string; thickness: number; width1: number | null; length1: number | null; weight: number; status: string } | null;
}

const ST = {
  RESERVED: { label: "선점중",   cls: "bg-amber-100 text-amber-800" },
  USED:     { label: "사용완료", cls: "bg-emerald-100 text-emerald-700" },
  RELEASED: { label: "해제됨",   cls: "bg-gray-100 text-gray-500" },
} as const;

const d10 = (s: string | null) => (s ? s.slice(0, 10) : "-");

export default function PartnerAdminTab() {
  const [portal, setPortal] = useState<Portal | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [newVendor, setNewVendor] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/partner-admin");
      const j = await r.json();
      if (j.success) { setPortal(j.data.portal); setVendors(j.data.vendors); setClaims(j.data.claims); }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const post = async (body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    const r = await fetch("/api/partner-admin", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.success) { alert(j.error ?? "처리 실패"); return; }
    if (j.message) setMsg(j.message);
    load();
  };

  const url = portal ? `${typeof window !== "undefined" ? window.location.origin : ""}/partner/${portal.token}` : "";

  return (
    <div className="space-y-4">
      {msg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2">
          <Check size={15} /> {msg}
          <button onClick={() => setMsg(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* 링크 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
          <Link2 size={14} className="text-blue-600" /> 공유 링크
          <span className="text-xs font-normal text-gray-400">— 설계업체에 이 주소를 전달합니다</span>
        </h3>

        {loading ? (
          <p className="text-sm text-gray-400">불러오는 중…</p>
        ) : portal ? (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="flex-1 min-w-[280px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono break-all">{url}</code>
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(url); setMsg("링크를 복사했습니다."); }}>
                <Copy size={13} className="mr-1" /> 복사
              </Button>
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 h-8 px-3 text-xs border border-gray-300 rounded-md hover:bg-gray-50">
                <ExternalLink size={13} /> 열어보기
              </a>
            </div>
            <p className="text-[11px] text-gray-400">발급일 {d10(portal.createdAt)}</p>
          </>
        ) : (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            아직 링크가 없습니다. [링크 발급]을 눌러 만드세요.
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={() => post({ action: "issue" },
            portal ? "새 링크를 발급하면 지금 링크는 즉시 열리지 않습니다.\n업체에 새 주소를 다시 보내야 합니다.\n\n계속할까요?" : undefined)}>
            <RefreshCw size={13} className="mr-1" /> {portal ? "링크 재발급" : "링크 발급"}
          </Button>
          {portal && (
            <Button variant="outline" size="sm"
              onClick={() => post({ action: "revoke" }, "링크를 폐기하면 업체가 더 이상 접속할 수 없습니다.\n계속할까요?")}>
              폐기
            </Button>
          )}
        </div>

        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>
            이 링크는 <b>로그인이 없습니다</b> — 주소를 아는 사람은 누구나 여유원재 목록을 보고 선점할 수 있습니다.
            외부로 새어 나갔다고 판단되면 <b>재발급</b>해 이전 주소를 죽이세요.
          </span>
        </div>
      </div>

      {/* 업체 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-gray-800">설계업체</h3>
        <div className="flex flex-wrap gap-2">
          {vendors.map(v => (
            <span key={v.id}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${
                v.active ? "bg-white border-gray-300 text-gray-700" : "bg-gray-100 border-gray-200 text-gray-400 line-through"}`}>
              {v.name}
              <button onClick={() => post({ action: "vendorToggle", id: v.id, active: !v.active })}
                title={v.active ? "사용 중지" : "다시 사용"} className="text-gray-400 hover:text-gray-700">
                {v.active ? <X size={11} /> : <Check size={11} />}
              </button>
            </span>
          ))}
          {vendors.length === 0 && <span className="text-xs text-gray-400">등록된 업체가 없습니다.</span>}
        </div>
        <div className="flex items-center gap-2 max-w-sm">
          <Input value={newVendor} onChange={e => setNewVendor(e.target.value)} placeholder="업체명" className="h-8 text-xs" />
          <Button size="sm" className="h-8 text-xs"
            onClick={async () => { if (!newVendor.trim()) return; await post({ action: "vendorAdd", name: newVendor }); setNewVendor(""); }}>
            <Plus size={12} className="mr-1" /> 추가
          </Button>
        </div>
        <p className="text-[11px] text-gray-400">
          업체는 선점할 때 화면에서 고릅니다. 링크가 하나라 구분은 자기 신고이며, 아래 기록으로 되짚을 수 있습니다.
        </p>
      </div>

      {/* 기록 */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <span className="text-sm font-bold text-gray-800">선점·사용 기록</span>
          <span className="text-xs text-gray-400">최근 100건</span>
          <button onClick={load} className="ml-auto text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1">
            <RefreshCw size={12} /> 새로고침
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">상태</th>
                <th className="px-3 py-2 text-left">업체</th>
                <th className="px-3 py-2 text-left">잔재번호</th>
                <th className="px-3 py-2 text-left">사양</th>
                <th className="px-3 py-2 text-right">중량</th>
                <th className="px-3 py-2 text-left">호선/블록</th>
                <th className="px-3 py-2 text-left">담당자</th>
                <th className="px-3 py-2 text-left">선점일</th>
                <th className="px-3 py-2 text-left">사용일</th>
                <th className="px-3 py-2 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {claims.length === 0 ? (
                <tr><td colSpan={10} className="py-10 text-center text-gray-400">아직 기록이 없습니다.</td></tr>
              ) : claims.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ST[c.status].cls}`}>{ST[c.status].label}</span>
                  </td>
                  <td className="px-3 py-1.5 font-semibold text-gray-800">{c.vendor.name}</td>
                  <td className="px-3 py-1.5 font-mono text-blue-700">{c.remnant?.remnantNo ?? "-"}</td>
                  <td className="px-3 py-1.5 text-gray-600">
                    {c.remnant ? `${c.remnant.material} ${c.remnant.thickness}t ${c.remnant.width1 ?? "-"}×${c.remnant.length1 ?? "-"}` : "-"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{c.remnant ? Math.round(c.remnant.weight).toLocaleString() : "-"}</td>
                  <td className="px-3 py-1.5">{c.vesselCode}{c.block ? `/${c.block}` : ""}</td>
                  <td className="px-3 py-1.5 text-gray-600">{c.actor ?? "-"}</td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-500">{d10(c.reservedAt)}</td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-500">{d10(c.usedAt)}</td>
                  <td className="px-3 py-1.5 text-center">
                    {c.status === "RESERVED" && (
                      <button
                        onClick={() => post({ action: "claimRelease", claimId: c.id },
                          `${c.vendor.name} 의 ${c.remnant?.remnantNo} 선점을 강제로 해제할까요?\n업체 화면에서 다시 선점 가능해집니다.`)}
                        className="px-1.5 py-0.5 rounded border border-gray-200 text-[11px] text-gray-500 hover:bg-red-50 hover:text-red-600">
                        선점해제
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
