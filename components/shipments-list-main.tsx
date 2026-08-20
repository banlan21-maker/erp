"use client";

/**
 * 출고장 이력 목록
 *   /cutpart/shipments
 *
 * 행 단위는 '차량(송장)' 이다 — 출고장 1건에 차가 여러 대면 여러 행으로 편다.
 * (실측상 출고장 326건이 모두 차 1대라 대부분 1:1로 보인다)
 * 용차는 차량 단위로 쓰므로, 여기서 골라 용차사용대장에 일괄 등록한다.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Truck, RefreshCw, AlertCircle, CheckCircle2, Trash2, Loader2 } from "lucide-react";

interface ShipmentItem {
  id: string;
  weight: number;
  vesselCode: string;
  material: string;
}
interface ShipmentVehicle {
  id: string;
  sequence: number;
  vehicleNo: string;
  driverName: string | null;
  invoiceNo: string | null;
  totalWeight: number | null;
  supplierSnapshot: { name?: string | null } | null;
  deliverySnapshot: { name?: string | null } | null;
  items: ShipmentItem[];
  departure: string | null;      // '진교' 또는 공급자 상호
  vessels: string;               // 호선 (여러 개면 쉼표)
  isCharter: boolean;
  charterCost: number | null;
}
interface Shipment {
  id: string;
  shipmentNo: string;
  shippedAt: string;
  status: "ACTIVE" | "CANCELLED";
  memo: string | null;
  vehicles: ShipmentVehicle[];
}

/** 목록 한 줄 = 차량 1대 */
interface Row {
  key: string;
  s: Shipment;
  v: ShipmentVehicle;
  isFirstOfShipment: boolean;
}

const ymdSlash = (iso: string) => iso.slice(0, 10).replace(/-/g, ".");
/** 그 차에 실린 자재 중량 합계 (kg) */
const weightOf = (v: ShipmentVehicle) => Math.round(v.items.reduce((s, i) => s + (i.weight ?? 0), 0));
const won = (n: number | null) => (n == null ? "" : n.toLocaleString());

export default function ShipmentsListMain({ hideHeader = false }: { hideHeader?: boolean } = {}) {
  const today = new Date();
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [from,   setFrom]   = useState(ym(firstOfMonth));
  const [to,     setTo]     = useState(ym(today));
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "CANCELLED">("ACTIVE");
  const [list,   setList]   = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(false);

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ from, to, status });
      const res = await fetch(`/api/shipments?${p}`);
      const json = await res.json();
      if (json.success) setList(json.data);
      setChecked(new Set());
    } finally {
      setLoading(false);
    }
  }, [from, to, status]);

  useEffect(() => { load(); }, [load]);

  const rows: Row[] = useMemo(() =>
    list.flatMap(s => s.vehicles.map((v, i) => ({
      key: v.id, s, v, isFirstOfShipment: i === 0,
    }))), [list]);

  // 용차 등록 가능 = 활성 출고장 + 진교 출발 + 아직 용차 아님
  const canRegister = (r: Row) => r.s.status === "ACTIVE" && r.v.departure === "진교" && !r.v.isCharter;
  const registerable = rows.filter(canRegister);
  const checkedRows = rows.filter(r => checked.has(r.key));
  const checkedNew = checkedRows.filter(canRegister);
  const checkedCharter = checkedRows.filter(r => r.v.isCharter);

  const toggle = (k: string) =>
    setChecked(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleAll = () =>
    setChecked(p => (p.size === registerable.length && registerable.length > 0
      ? new Set()
      : new Set(registerable.map(r => r.key))));

  const handleDelete = async (s: Shipment) => {
    if (s.status !== "CANCELLED") return;
    if (!confirm(`취소된 출고장 ${s.shipmentNo} 을(를) 영구 삭제할까요?\n차분/자재 기록도 함께 사라집니다.`)) return;
    const res = await fetch(`/api/shipments/${s.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!json.success) { alert(json.error ?? "삭제 실패"); return; }
    load();
  };

  const registerCharter = async () => {
    if (checkedNew.length === 0) return;
    if (!confirm(`선택한 ${checkedNew.length}건을 용차사용대장에 등록할까요?\n\n금액은 납품처 단가표와 실은 철판 최대 폭으로 자동 계산되며,\n등록 후 대장에서 수정할 수 있습니다.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/charter-usage/from-shipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleIds: checkedNew.map(r => r.v.id) }),
      });
      const json = await res.json();
      if (!json.success) { alert(json.error ?? "등록 실패"); return; }
      const lines = [json.message];
      if (json.skipped?.length) {
        lines.push("");
        for (const sk of json.skipped.slice(0, 8)) lines.push(`· ${sk.no}: ${sk.why}`);
        if (json.skipped.length > 8) lines.push(`외 ${json.skipped.length - 8}건`);
      }
      alert(lines.join("\n"));
      load();
    } catch { alert("서버 오류"); } finally { setBusy(false); }
  };

  const unregisterCharter = async () => {
    if (checkedCharter.length === 0) return;
    if (!confirm(`선택한 ${checkedCharter.length}건의 용차 지정을 해제할까요?\n\n용차사용대장에서 해당 행이 삭제됩니다.\n대장에서 금액이나 비고를 고쳐 두었다면 그것도 함께 사라집니다.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/charter-usage/from-shipment", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleIds: checkedCharter.map(r => r.v.id) }),
      });
      const json = await res.json();
      if (!json.success) { alert(json.error ?? "해제 실패"); return; }
      alert(json.message);
      load();
    } catch { alert("서버 오류"); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="flex items-center gap-2">
          <Truck size={20} className="text-purple-600" />
          <h2 className="text-xl font-bold text-gray-900">출고장 이력</h2>
        </div>
      )}

      {/* 조회 조건 */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-end gap-3 flex-wrap text-sm">
        <div>
          <div className="text-gray-500 mb-1 text-xs">시작일</div>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="h-9 px-2 border border-gray-300 rounded-lg" />
        </div>
        <div>
          <div className="text-gray-500 mb-1 text-xs">종료일</div>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="h-9 px-2 border border-gray-300 rounded-lg" />
        </div>
        <div>
          <div className="text-gray-500 mb-1 text-xs">상태</div>
          <select value={status} onChange={e => setStatus(e.target.value as typeof status)}
            className="h-9 px-2 border border-gray-300 rounded-lg bg-white">
            <option value="ACTIVE">활성</option>
            <option value="CANCELLED">취소</option>
            <option value="ALL">전체</option>
          </select>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 h-9 px-3 border border-gray-300 rounded-lg hover:bg-gray-50">
          <RefreshCw size={14} /> 조회
        </button>

        <div className="ml-auto flex items-center gap-2">
          {checkedCharter.length > 0 && (
            <button onClick={unregisterCharter} disabled={busy}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              용차 해제 {checkedCharter.length}
            </button>
          )}
          <button onClick={registerCharter} disabled={busy || checkedNew.length === 0}
            className="inline-flex items-center gap-1.5 h-9 px-4 text-sm font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
            용차 등록 {checkedNew.length > 0 ? checkedNew.length : ""}
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        진교 출발분만 용차로 등록할 수 있습니다. 금액은 납품처 단가와 실은 철판 최대 폭으로 자동 계산되며, 용차사용대장에서 수정할 수 있습니다.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm table-fixed min-w-[1100px]">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-2 py-2 w-10 text-center">
                <input type="checkbox" onChange={toggleAll}
                  checked={registerable.length > 0 && checked.size === registerable.length}
                  title="등록 가능한 건 전체 선택" />
              </th>
              <th className="px-3 py-2 text-left   w-24">출고일</th>
              <th className="px-3 py-2 text-left   w-36">출고장 번호</th>
              <th className="px-3 py-2 text-center w-20">상태</th>
              <th className="px-3 py-2 text-left   w-32">차량번호</th>
              <th className="px-3 py-2 text-left   w-40">호선</th>
              <th className="px-3 py-2 text-right  w-16">수량</th>
              <th className="px-3 py-2 text-right  w-24">중량(kg)</th>
              <th className="px-3 py-2 text-left   w-56">송장 / 납품처</th>
              <th className="px-3 py-2 text-center w-16">용차</th>
              <th className="px-3 py-2 text-left">비고</th>
              <th className="px-2 py-2 text-center w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={12} className="py-12 text-center text-gray-400">불러오는 중…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={12} className="py-12 text-center text-gray-400">해당 기간 출고 이력이 없습니다.</td></tr>
            ) : rows.map(({ key, s, v, isFirstOfShipment }) => {
              const selectable = canRegister({ key, s, v, isFirstOfShipment }) || v.isCharter;
              const jingyo = v.departure === "진교";
              return (
                <tr key={key} className={`hover:bg-gray-50/60 ${v.isCharter ? "bg-purple-50/40" : ""}`}>
                  <td className="px-2 py-2 text-center">
                    {selectable ? (
                      <input type="checkbox" checked={checked.has(key)} onChange={() => toggle(key)} />
                    ) : !jingyo && s.status === "ACTIVE" ? (
                      // 진교 출발이 아니면 용차 자동등록 대상이 아니다 — 왜 못 고르는지 알 수 있게 표시
                      <span className="text-[10px] text-amber-600" title={`출발지 ${v.departure ?? "미상"} — 진교 출발분만 용차 등록`}>✕</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{isFirstOfShipment ? ymdSlash(s.shippedAt) : ""}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {isFirstOfShipment && (
                      <Link href={`/cutpart/shipments/${s.id}`} className="font-mono text-xs font-bold text-purple-700 hover:underline">{s.shipmentNo}</Link>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {isFirstOfShipment && (s.status === "ACTIVE"
                      ? <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full"><CheckCircle2 size={11} /> 활성</span>
                      : <span className="inline-flex items-center gap-1 text-[11px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full"><AlertCircle size={11} /> 취소</span>)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{v.vehicleNo || "-"}</td>
                  <td className="px-3 py-2 text-xs text-gray-700 truncate" title={v.vessels}>{v.vessels || "-"}</td>
                  <td className="px-3 py-2 text-right text-xs text-gray-600 tabular-nums">{v.items.length}</td>
                  <td className="px-3 py-2 text-right text-xs text-gray-600 tabular-nums">{weightOf(v).toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 truncate" title={`${v.invoiceNo ?? ""} → ${v.deliverySnapshot?.name ?? ""}`}>
                    <span className="font-mono text-purple-600">{v.invoiceNo}</span>
                    <span className="text-gray-400 mx-1">→</span>
                    {v.deliverySnapshot?.name ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {v.isCharter && (
                      <span className="inline-block text-[10px] font-bold bg-purple-600 text-white px-1.5 py-0.5 rounded"
                            title={v.charterCost != null ? `${won(v.charterCost)}원` : "금액 미정 — 대장에서 입력"}>
                        용차
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 truncate" title={s.memo ?? ""}>{isFirstOfShipment ? (s.memo ?? "") : ""}</td>
                  <td className="px-2 py-1 text-center">
                    {isFirstOfShipment && s.status === "CANCELLED" && (
                      <button onClick={() => handleDelete(s)} title="취소된 출고장 영구삭제"
                        className="inline-flex items-center justify-center p-1 text-red-600 hover:bg-red-100 rounded">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
