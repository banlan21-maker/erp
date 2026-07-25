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
  adHocFromField?: boolean;
  originShipoutLabel?: string | null;
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
  const [cancelModal, setCancelModal] = useState(false);

  const doCancel = async (keepSelection: boolean) => {
    const reason = prompt("출고 취소 사유를 입력하세요. (선택)");
    if (reason === null) return; // cancel
    const msg = keepSelection
      ? "출고를 취소하고 자재를 선별목록에 그대로 둡니다.\n(바로 다시 출고장을 만들 수 있습니다 · 선별목록에 '출고취소' 표시)"
      : "출고를 취소하고 선별까지 해제합니다.\n자재가 강재전체목록 입고 재고로 완전히 돌아갑니다.\n(다시 출고하려면 강재매칭/출고등록부터 선별해야 합니다)";
    if (!confirm(`${msg}\n\n진행할까요?`)) return;
    setCancelModal(false);
    setCancelling(true);
    try {
      const res = await fetch(`/api/shipments/${s.id}/cancel`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ reason, keepSelection }),
      });
      const json = await res.json();
      if (!json.success) { alert(json.error || "취소 실패"); return; }
      router.refresh();
      // 단순 상태 갱신
      setS(prev => ({ ...prev, status: "CANCELLED", cancelledAt: new Date().toISOString(), cancelReason: reason || null }));
      const after = keepSelection
        ? "출고가 취소되었습니다.\n자재는 선별목록에 그대로 있습니다 — 바로 다시 출고장을 만들 수 있습니다."
        : "출고가 취소되었습니다.\n자재는 강재전체목록 입고 재고로 복귀했습니다(선별 해제).";
      if (json.warnings?.length) {
        alert(after + "\n\n경고:\n" + json.warnings.join("\n"));
      } else {
        alert(after);
      }
    } finally { setCancelling(false); }
  };
  const handleCancel = () => setCancelModal(true);

  const totalItems  = s.vehicles.reduce((sum, v) => sum + v.items.length, 0);
  const totalWeight = s.vehicles.reduce((sum, v) => sum + (v.totalWeight ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/cutpart/external-shipout?tab=shipments" className="text-sm text-purple-600 hover:underline inline-flex items-center gap-1"><ArrowLeft size={14} /> 외부출고관리</Link>
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
                      <td className="px-2 py-1 font-mono">
                        {it.vesselCode}
                        {it.adHocFromField && (
                          <span
                            className="ml-1 text-[9px] px-1 py-0.5 rounded bg-cyan-100 text-cyan-700 font-sans"
                            title={it.originShipoutLabel
                              ? `현장직접출고 — 원래 사무실 선별: ${it.originShipoutLabel}`
                              : "현장직접출고 — 사무실 선별 없이 현장에서 즉시 담긴 자재"}
                          >
                            현장직접{it.originShipoutLabel ? ` (원선별: ${it.originShipoutLabel})` : ""}
                          </span>
                        )}
                      </td>
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

      {/* 출고취소 — 선별 처리 방식 선택 */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="px-5 py-3 border-b border-gray-200">
              <h3 className="text-base font-bold text-gray-900">출고 취소</h3>
              <p className="text-xs text-gray-500 mt-0.5">취소 후 자재를 어떻게 처리할지 선택하세요.</p>
            </div>
            <div className="p-5 space-y-3">
              <button onClick={() => doCancel(true)} disabled={cancelling}
                className="w-full text-left border-2 border-purple-300 bg-purple-50 rounded-xl p-4 hover:border-purple-500 disabled:opacity-50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-purple-800">선별목록에 그대로 두기</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-600 text-white font-semibold">권장</span>
                </div>
                <p className="text-xs text-gray-600 mt-1.5">일정 변경·차량 문제 등으로 다시 출고할 자재. <b>선별목록에 남아 바로 출고장을 다시 만들 수 있습니다.</b> (선별목록에 주황 &apos;출고취소&apos; 표시 — 원판만)</p>
              </button>
              <button onClick={() => doCancel(false)} disabled={cancelling}
                className="w-full text-left border-2 border-gray-200 rounded-xl p-4 hover:border-gray-400 disabled:opacity-50">
                <span className="text-sm font-bold text-gray-800">선별도 해제하고 재고로</span>
                <p className="text-xs text-gray-600 mt-1.5">자재를 잘못 골랐을 때. 강재전체목록 <b>입고 재고로 완전 복귀</b>합니다. (다시 출고하려면 강재매칭/출고등록부터 선별)</p>
              </button>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
              <button onClick={() => setCancelModal(false)} disabled={cancelling}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
