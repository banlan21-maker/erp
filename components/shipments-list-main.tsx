"use client";

/**
 * 출고장 이력 목록
 *   /cutpart/shipments
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Truck, RefreshCw, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";

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
}
interface Shipment {
  id: string;
  shipmentNo: string;
  shippedAt: string;
  status: "ACTIVE" | "CANCELLED";
  memo: string | null;
  vehicles: ShipmentVehicle[];
}

const ymdSlash = (iso: string) => iso.slice(0, 10).replace(/-/g, ".");

export default function ShipmentsListMain() {
  const today = new Date();
  const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [from,   setFrom]   = useState(ym(firstOfMonth));
  const [to,     setTo]     = useState(ym(today));
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "CANCELLED">("ACTIVE");
  const [list,   setList]   = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ from, to });
      if (status !== "ALL") p.set("status", status);
      const res = await fetch(`/api/shipments?${p}`);
      const json = await res.json();
      if (json.success) setList(json.data);
    } finally { setLoading(false); }
  }, [from, to, status]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Truck size={22} className="text-purple-600" /> 출고장 이력
        </h2>
        <p className="text-sm text-gray-500 mt-1">강재 외부 출고 이력 · 거래명세표 · 출고취소</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-end gap-3">
        <label className="text-xs">
          <div className="text-gray-500 mb-1">시작일</div>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 px-2 border border-gray-200 rounded text-sm" />
        </label>
        <label className="text-xs">
          <div className="text-gray-500 mb-1">종료일</div>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 px-2 border border-gray-200 rounded text-sm" />
        </label>
        <label className="text-xs">
          <div className="text-gray-500 mb-1">상태</div>
          <select value={status} onChange={e => setStatus(e.target.value as "ALL"|"ACTIVE"|"CANCELLED")}
            className="h-9 px-2 border border-gray-200 rounded text-sm bg-white">
            <option value="ACTIVE">활성</option>
            <option value="CANCELLED">취소됨</option>
            <option value="ALL">전체</option>
          </select>
        </label>
        <button onClick={load} className="h-9 px-4 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 inline-flex items-center gap-1">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 조회
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2.5 text-left">출고일</th>
              <th className="px-3 py-2.5 text-left">출고장 번호</th>
              <th className="px-3 py-2.5 text-center">상태</th>
              <th className="px-3 py-2.5 text-right">차분 / 총 자재</th>
              <th className="px-3 py-2.5 text-left">송장 / 납품처</th>
              <th className="px-3 py-2.5 text-left">비고</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400">불러오는 중…</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400">해당 기간 출고 이력이 없습니다.</td></tr>
            ) : list.map(s => {
              const totalItems = s.vehicles.reduce((sum, v) => sum + v.items.length, 0);
              return (
                <tr key={s.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2 font-mono">{ymdSlash(s.shippedAt)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/cutpart/shipments/${s.id}`} className="font-mono font-bold text-purple-700 hover:underline">{s.shipmentNo}</Link>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {s.status === "ACTIVE"
                      ? <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full"><CheckCircle2 size={11} /> 활성</span>
                      : <span className="inline-flex items-center gap-1 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full"><AlertCircle size={11} /> 취소</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-gray-600">{s.vehicles.length}대 / {totalItems}건</td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {s.vehicles.map(v => (
                      <div key={v.id}>
                        <span className="font-mono text-purple-600">{v.invoiceNo}</span>
                        <span className="text-gray-400 mx-1">→</span>
                        {v.deliverySnapshot?.name ?? "-"}
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[200px]">{s.memo ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
