"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Trash2, CheckCircle2, AlertCircle, Truck } from "lucide-react";

interface ShipmentItem {
  id: string;
  vesselCode: string;
  material: string;
  thickness: number;
  width: number;
  length: number;
  weight: number;
  block: string | null;
  heatNo: string | null;
}
interface ShipmentVehicle {
  id: string;
  sequence: number;
  vehicleNo: string;
  driverName: string | null;
  driverPhone: string | null;
  invoiceNo: string | null;
  totalWeight: number | null;
  loadLimit: number | null;
  supplierSnapshot: { name?: string | null; bizNo?: string | null } | null;
  deliverySnapshot: { name?: string | null; bizNo?: string | null } | null;
  items: ShipmentItem[];
}
interface Shipment {
  id: string;
  shipmentNo: string;
  shippedAt: string;
  status: "ACTIVE" | "CANCELLED";
  cancelledAt: string | null;
  cancelReason: string | null;
  memo: string | null;
  vehicles: ShipmentVehicle[];
}

const ymd = (iso: string) => iso.slice(0, 10).replace(/-/g, ".");

export default function ShipmentDetailMain({ initial }: { initial: Shipment }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    const reason = prompt("출고 취소 사유를 입력하세요. (선택)");
    if (reason === null) return; // cancel
    if (!confirm("정말로 이 출고장을 취소하시겠습니까?\n자재는 RECEIVED 로 복원되고 새로 생성된 판번호는 삭제됩니다.")) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/shipments/${s.id}/cancel`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!json.success) { alert(json.error || "취소 실패"); return; }
      router.refresh();
      // 단순 상태 갱신
      setS(prev => ({ ...prev, status: "CANCELLED", cancelledAt: new Date().toISOString(), cancelReason: reason || null }));
      if (json.warnings?.length) {
        alert("취소 처리되었으나 경고:\n" + json.warnings.join("\n"));
      } else {
        alert("출고가 취소되었습니다.");
      }
    } finally { setCancelling(false); }
  };

  const totalItems  = s.vehicles.reduce((sum, v) => sum + v.items.length, 0);
  const totalWeight = s.vehicles.reduce((sum, v) => sum + (v.totalWeight ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/cutpart/shipments" className="text-sm text-purple-600 hover:underline inline-flex items-center gap-1"><ArrowLeft size={14} /> 출고장 이력</Link>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mt-1">
            <Truck size={22} className="text-purple-600" /> {s.shipmentNo}
            {s.status === "ACTIVE"
              ? <span className="inline-flex items-center gap-1 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full"><CheckCircle2 size={11} /> 활성</span>
              : <span className="inline-flex items-center gap-1 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full"><AlertCircle size={11} /> 취소</span>}
          </h2>
          <div className="text-sm text-gray-500 mt-0.5">
            출고일 {ymd(s.shippedAt)} · 차분 {s.vehicles.length}대 · 총 {totalItems}건 / {totalWeight.toFixed(1)}kg
          </div>
        </div>
        {s.status === "ACTIVE" && (
          <button onClick={handleCancel} disabled={cancelling}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">
            <Trash2 size={14} /> {cancelling ? "취소 중…" : "출고 취소"}
          </button>
        )}
      </div>

      {s.status === "CANCELLED" && s.cancelReason && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-sm text-amber-800">
          <strong>취소 사유:</strong> {s.cancelReason}
          {s.cancelledAt && <span className="ml-2 text-xs text-amber-600">(취소일 {ymd(s.cancelledAt)})</span>}
        </div>
      )}

      {/* 차분별 카드 */}
      <div className="space-y-3">
        {s.vehicles.map(v => (
          <div key={v.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">차분 #{v.sequence}</span>
                <span className="font-mono font-bold">{v.vehicleNo}</span>
                {v.driverName && <span className="text-xs text-gray-500">{v.driverName} {v.driverPhone}</span>}
                <span className="text-xs text-gray-500">{v.items.length}건 / {(v.totalWeight ?? 0).toFixed(1)}kg{v.loadLimit ? ` / 한도 ${v.loadLimit}kg` : ""}</span>
              </div>
              <Link href={`/cutpart/shipments/${s.id}/vehicles/${v.id}`}
                className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <FileText size={12} /> 거래명세표 {v.invoiceNo ?? ""}
              </Link>
            </div>
            <div className="px-4 py-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500">공급처: </span>
                <strong>{v.supplierSnapshot?.name ?? "-"}</strong>
                {v.supplierSnapshot?.bizNo && <span className="text-gray-500 ml-1">({v.supplierSnapshot.bizNo})</span>}
              </div>
              <div>
                <span className="text-gray-500">납품처: </span>
                <strong>{v.deliverySnapshot?.name ?? "-"}</strong>
                {v.deliverySnapshot?.bizNo && <span className="text-gray-500 ml-1">({v.deliverySnapshot.bizNo})</span>}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left">호선</th>
                    <th className="px-2 py-1.5 text-left">블록</th>
                    <th className="px-2 py-1.5 text-left">판번호</th>
                    <th className="px-2 py-1.5 text-left">재질</th>
                    <th className="px-2 py-1.5 text-right">T</th>
                    <th className="px-2 py-1.5 text-right">W</th>
                    <th className="px-2 py-1.5 text-right">L</th>
                    <th className="px-2 py-1.5 text-right">중량(kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {v.items.map(it => (
                    <tr key={it.id}>
                      <td className="px-2 py-1 font-mono">{it.vesselCode}</td>
                      <td className="px-2 py-1">{it.block ?? "-"}</td>
                      <td className="px-2 py-1 font-mono">{it.heatNo ?? "-"}</td>
                      <td className="px-2 py-1">{it.material}</td>
                      <td className="px-2 py-1 text-right">{it.thickness}</td>
                      <td className="px-2 py-1 text-right">{it.width}</td>
                      <td className="px-2 py-1 text-right">{it.length}</td>
                      <td className="px-2 py-1 text-right">{it.weight.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
