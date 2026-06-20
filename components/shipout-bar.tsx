"use client";

/**
 * 외부 납품처 출고 — 하단 고정 카트바 + 출고장 만들기 마법사 (모달 1 → 모달 2)
 * + 엑셀 업로드 모달.
 *
 * 카트는 ShipoutCartProvider 안에서 사용.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PackageOpen, FileSpreadsheet, Trash2, X, Plus, Truck,
  ChevronRight, ChevronLeft, AlertTriangle, Save, Loader2, Upload, Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useShipoutCart, type ShipoutCartItem } from "./shipout-cart";

/** 외부출고리스트 양식 다운로드 */
function downloadShipoutListTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["호선", "재질", "두께", "폭", "길이", "판번호"],
    ["RS01", "AH36", 8, 1829, 6096, "HT240001"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "외부출고리스트");
  XLSX.writeFile(wb, "외부출고리스트_양식.xlsx");
}

const fmtKg = (n: number) => `${n.toLocaleString("ko-KR", { maximumFractionDigits: 1 })} kg`;

interface HeatOption {
  id:     string;
  heatNo: string;
  status: string;
}

// 모달 ① 의 행 — 카트 + 매칭/입력된 판번호
interface ModalRow extends ShipoutCartItem {
  heatNo:       string;
  heatId:       string | null; // 매칭된 SteelPlanHeat.id (직접입력이면 null)
  manualHeatNo: boolean;       // 직접입력 여부
  heatOptions:  HeatOption[];  // 같은 사양의 후보
  vehicleIdx:   number | null; // 어느 차분에 배정됐는지 (null=미배차)
  block:        string;        // 행별 블록 입력 (양식의 자동 + 수정 가능)
}

interface Vehicle {
  id:           string; // 임시 ID (uuid 흉내)
  sequence:     number;
  vehicleNo:    string;
  driverName:   string;
  driverPhone:  string;
  loadLimit:    string; // 사용자 입력 — number 변환
  supplierId:   string;
  deliveryId:   string;
}

interface DeliveryVendor {
  id:           string;
  vendorType:   "SUPPLIER" | "DELIVERY";
  bizNo:        string | null;
  name:         string;
  ceo:          string | null;
  address:      string | null;
  bizType:      string | null;
  bizItem:      string | null;
  phone:        string | null;
  fax:          string | null;
}

const randomId = () => Math.random().toString(36).slice(2);

export default function ShipoutBar() {
  const router = useRouter();
  const cart = useShipoutCart();

  const [open, setOpen]               = useState(false);              // 마법사 모달
  const [step, setStep]               = useState<1 | 2>(1);
  const [excelOpen, setExcelOpen]     = useState(false);

  // 모달 ① 상태
  const [rowsM, setRowsM] = useState<ModalRow[]>([]);

  // 차분 상태
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // 모달 ② — 공급처/납품처 마스터
  const [suppliers,  setSuppliers]  = useState<DeliveryVendor[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryVendor[]>([]);

  // 출고일
  const todayYMD = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const [shippedAt, setShippedAt] = useState(todayYMD());
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState("");

  // 작성(출고)자 — localStorage 에서 기본값 복원
  const [writerName,    setWriterName]    = useState("");
  const [writerPhone,   setWriterPhone]   = useState("");
  const [writerDefault, setWriterDefault] = useState(false);

  // 공급처 (Step1 에서 선택) + 기본값 + 통일 옵션
  const [supplierId,        setSupplierId]        = useState<string>("");
  const [supplierDefault,   setSupplierDefault]   = useState(false);
  const [supplierUnify,     setSupplierUnify]     = useState(true);

  // 모달 열 때 작성자/공급처 기본값 복원
  useEffect(() => {
    if (!open) return;
    try {
      const isDefault = localStorage.getItem("shipout-writer-default") === "1";
      if (isDefault) {
        setWriterName(localStorage.getItem("shipout-writer-name")   ?? "");
        setWriterPhone(localStorage.getItem("shipout-writer-phone") ?? "");
        setWriterDefault(true);
      } else {
        setWriterName(""); setWriterPhone(""); setWriterDefault(false);
      }
      const supDef = localStorage.getItem("shipout-supplier-default") === "1";
      if (supDef) {
        setSupplierId(localStorage.getItem("shipout-supplier-id") ?? "");
        setSupplierDefault(true);
      } else {
        setSupplierId(""); setSupplierDefault(false);
      }
      setSupplierUnify(localStorage.getItem("shipout-supplier-unify") !== "0");
    } catch { /* 무시 */ }
  }, [open]);

  // 모달 열 때 카트 내용을 ModalRow 로 변환 + 판번호 후보 조회
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setError("");
    setVehicles([]);
    setShippedAt(todayYMD());

    (async () => {
      const init: ModalRow[] = cart.items.map(it => ({
        ...it,
        heatNo:       it.prefilledHeatNo ?? "",
        heatId:       null,
        manualHeatNo: !!it.prefilledHeatNo,
        heatOptions:  [],
        vehicleIdx:   null,
        block:        "",
      }));
      setRowsM(init);

      // 사양별 heat options 일괄 조회 — 같은 사양은 한 번만.
      // 잔재(remnant)는 판번호 매칭 대상이 아님(자체 heatNo만 스냅샷) → 제외.
      const specKey = (r: ModalRow) =>
        `${r.vesselCode}|${r.material}|${r.thickness}|${r.width}|${r.length}`;
      const groups = new Map<string, ModalRow[]>();
      for (const r of init) {
        if (r.kind === "remnant") continue;
        const k = specKey(r);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(r);
      }
      const optsByKey = new Map<string, HeatOption[]>();
      await Promise.all(Array.from(groups.entries()).map(async ([k, list]) => {
        const r = list[0];
        const params = new URLSearchParams({
          vesselCode: r.vesselCode, material: r.material,
          thickness:  String(r.thickness), width: String(r.width), length: String(r.length),
          status: "WAITING,CUT",
        });
        try {
          const res = await fetch(`/api/steel-plan/heat-match?${params}`);
          const json = await res.json();
          if (json.success) optsByKey.set(k, json.data);
        } catch { /* 무시 */ }
      }));

      setRowsM(init.map(r => {
        const opts = optsByKey.get(specKey(r)) ?? [];
        // prefilled heat 가 있으면 옵션과 매칭
        let heatId: string | null = null;
        if (r.heatNo) {
          const hit = opts.find(o => o.heatNo === r.heatNo);
          if (hit) {
            heatId = hit.id;
            return { ...r, heatId, manualHeatNo: false, heatOptions: opts };
          }
        }
        return { ...r, heatOptions: opts };
      }));
    })();
  }, [open, cart.items]);

  // 공급처/납품처 마스터 — 모달 열릴 때 즉시 (Step1 에서 공급처 선택용)
  useEffect(() => {
    if (!open) return;
    if (suppliers.length === 0 || deliveries.length === 0) {
      Promise.all([
        fetch("/api/delivery-vendors?type=SUPPLIER").then(r => r.json()),
        fetch("/api/delivery-vendors?type=DELIVERY").then(r => r.json()),
      ]).then(([s, d]) => {
        if (s.success) setSuppliers(s.data);
        if (d.success) setDeliveries(d.data);
      }).catch(() => {});
    }
  }, [open, suppliers.length, deliveries.length]);

  /* ─── 모달 ① 액션 ─── */
  const setRow = (steelPlanId: string, patch: Partial<ModalRow>) =>
    setRowsM(prev => prev.map(r => r.steelPlanId === steelPlanId ? { ...r, ...patch } : r));

  // 차분 만들기 — 체크된 (vehicleIdx=null 상태인) 행을 새 차분에 묶음
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggleCheck = (id: string) => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const unassignedRows = rowsM.filter(r => r.vehicleIdx === null);
  const checkedWeight  = useMemo(
    () => rowsM.filter(r => checked.has(r.steelPlanId)).reduce((s, r) => s + r.weight, 0),
    [rowsM, checked],
  );

  const addVehicle = () => {
    const ids = Array.from(checked);
    const selectedRows = rowsM.filter(r => checked.has(r.steelPlanId) && r.vehicleIdx === null);
    if (selectedRows.length === 0) {
      alert("자재를 선택해주세요.");
      return;
    }
    const seq = vehicles.length + 1;
    const newV: Vehicle = {
      id: randomId(), sequence: seq,
      vehicleNo: "", driverName: "", driverPhone: "", loadLimit: "",
      supplierId: "", deliveryId: "",
    };
    setVehicles(prev => [...prev, newV]);
    setRowsM(prev => prev.map(r => ids.includes(r.steelPlanId) ? { ...r, vehicleIdx: vehicles.length } : r));
    setChecked(new Set());
  };

  const removeVehicle = (idx: number) => {
    setVehicles(prev => prev.filter((_, i) => i !== idx).map((v, i) => ({ ...v, sequence: i + 1 })));
    setRowsM(prev => prev.map(r => {
      if (r.vehicleIdx === idx) return { ...r, vehicleIdx: null };
      if (r.vehicleIdx !== null && r.vehicleIdx > idx) return { ...r, vehicleIdx: r.vehicleIdx - 1 };
      return r;
    }));
  };

  const updateVehicle = (idx: number, patch: Partial<Vehicle>) =>
    setVehicles(prev => prev.map((v, i) => i === idx ? { ...v, ...patch } : v));

  /* ─── 검증 → 모달 ② 진입 ─── */
  const goToStep2 = () => {
    setError("");
    // 판번호 중복 입력 방지 — 같은 판번호(한 물리 철판)가 두 번 나가는 것 차단.
    // 잔재는 원판의 판번호를 공유할 수 있어(같은 모재 출처) 중복검사 제외 — 원판끼리만 검사.
    const heatNos = rowsM.filter(r => r.kind !== "remnant").map(r => r.heatNo.trim()).filter(Boolean);
    const dupHeat = heatNos.find((h, i) => heatNos.indexOf(h) !== i);
    if (dupHeat) {
      setError(`판번호 '${dupHeat}'가 중복 입력되었습니다. 같은 판번호는 한 번만 사용할 수 있습니다.`);
      return;
    }
    // 모든 자재가 배차됐는가
    const missing = rowsM.filter(r => r.vehicleIdx === null);
    if (missing.length > 0) {
      setError(`아직 배차되지 않은 자재 ${missing.length}건이 있습니다.`);
      return;
    }
    if (vehicles.length === 0) {
      setError("차분이 1대 이상 있어야 합니다.");
      return;
    }
    // 공급처 통일이 켜져있으면 Step1 에서 공급처 필수
    if (supplierUnify && !supplierId) {
      setError("공급처를 선택해주세요. (공급처 통일이 켜져있습니다)");
      return;
    }
    // 차량번호는 선택 입력 — 검증 안 함
    setStep(2);
  };

  /* ─── 출고 확정 ─── */
  const submit = async () => {
    setError("");
    // 공급처 통일이 켜져있으면 Step1 에서 선택한 supplierId 가 모든 차분에 강제 적용
    const effectiveVehicles = supplierUnify && supplierId
      ? vehicles.map(v => ({ ...v, supplierId }))
      : vehicles;
    // 모든 차분에 공급처/납품처 선택됐는가
    for (const v of effectiveVehicles) {
      if (!v.supplierId) { setError(`차분 ${v.sequence} — 공급처를 선택해주세요.`); return; }
      if (!v.deliveryId) { setError(`차분 ${v.sequence} — 납품처를 선택해주세요.`); return; }
    }
    setSubmitting(true);
    try {
      const supplierMap = new Map(suppliers.map(s => [s.id, s]));
      const deliveryMap = new Map(deliveries.map(d => [d.id, d]));

      // 작성자/공급처 기본값 — 체크박스 ON 이면 localStorage 갱신, OFF 면 제거
      try {
        if (writerDefault) {
          localStorage.setItem("shipout-writer-default", "1");
          localStorage.setItem("shipout-writer-name",  writerName.trim());
          localStorage.setItem("shipout-writer-phone", writerPhone.trim());
        } else {
          localStorage.removeItem("shipout-writer-default");
        }
        if (supplierDefault && supplierId) {
          localStorage.setItem("shipout-supplier-default", "1");
          localStorage.setItem("shipout-supplier-id", supplierId);
        } else {
          localStorage.removeItem("shipout-supplier-default");
        }
        localStorage.setItem("shipout-supplier-unify", supplierUnify ? "1" : "0");
      } catch { /* 무시 */ }

      const payload = {
        shippedAt,
        vehicles: effectiveVehicles.map((v, vi) => {
          const sup = supplierMap.get(v.supplierId);
          const del = deliveryMap.get(v.deliveryId);
          const snap = (x: DeliveryVendor | undefined) => x ? ({
            bizNo: x.bizNo, name: x.name, ceo: x.ceo, address: x.address,
            bizType: x.bizType, bizItem: x.bizItem, phone: x.phone, fax: x.fax,
          }) : null;
          return {
            sequence:        v.sequence,
            vehicleNo:       v.vehicleNo.trim(),
            driverName:      v.driverName.trim() || undefined,
            driverPhone:     v.driverPhone.trim() || undefined,
            loadLimit:       v.loadLimit ? Number(v.loadLimit) : null,
            supplierId:      v.supplierId, supplierSnapshot: snap(sup),
            deliveryId:      v.deliveryId, deliverySnapshot: snap(del),
            writerName:      writerName.trim()  || undefined,
            writerPhone:     writerPhone.trim() || undefined,
            items: rowsM.filter(r => r.vehicleIdx === vi).map(r => r.kind === "remnant" ? {
              // 잔재 출고 — steelPlanId/heatId 없이 remnantId 로. 판번호는 스냅샷 텍스트만.
              kind:            "remnant" as const,
              remnantId:       r.remnantId,
              vesselCode:      r.vesselCode,
              material:        r.material,
              thickness:       r.thickness,
              width:           r.width,
              length:          r.length,
              weight:          r.weight,
              block:           r.block.trim() || null,
              heatNo:          r.heatNo.trim() || null,
              manualHeatNo:    false,
            } : {
              kind:            "plate" as const,
              steelPlanId:     r.steelPlanId,
              steelPlanHeatId: r.heatId,
              vesselCode:      r.vesselCode,
              material:        r.material,
              thickness:       r.thickness,
              width:           r.width,
              length:          r.length,
              weight:          r.weight,
              block:           r.block.trim() || null,
              heatNo:          r.heatNo.trim() || null,
              manualHeatNo:    r.manualHeatNo,
            }),
          };
        }),
      };

      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error || "출고장 생성 실패"); return; }

      // 성공 — 카트 비우고 모달 닫고 이력 페이지로 (첫 차분 거래명세표 자동 열림)
      cart.clear();
      setOpen(false);
      const firstVehicleId = json.data.vehicles?.[0]?.id;
      if (firstVehicleId) {
        // 첫 차분 거래명세표 자동 열기 (새 탭)
        window.open(`/cutpart/shipments/${json.data.id}/vehicles/${firstVehicleId}`, "_blank");
      }
      router.push(`/cutpart/shipments/${json.data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally { setSubmitting(false); }
  };

  /* ─── 렌더링 ─── */
  if (cart.items.length === 0 && !open && !excelOpen) return null;

  return (
    <>
      {/* 하단 고정 바 */}
      {cart.items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-purple-900/95 text-white border-t-2 border-purple-700 shadow-2xl backdrop-blur-sm">
          <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <PackageOpen size={18} className="text-purple-300" />
              <span className="font-bold text-sm">출고 카트</span>
              <span className="text-sm">
                <strong>{cart.items.length}</strong> 건 / 합계 <strong>{fmtKg(cart.totalWeight)}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExcelOpen(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <FileSpreadsheet size={12} /> 엑셀로 일괄 추가
              </button>
              <button
                onClick={() => { if (confirm("카트를 모두 비우시겠습니까?")) cart.clear(); }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-white/30 hover:bg-white/10 rounded-lg"
              >
                <Trash2 size={12} /> 비우기
              </button>
              <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1 px-4 py-1.5 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-black rounded-lg"
              >
                <Truck size={13} /> 출고장 만들기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 엑셀 업로드 모달 */}
      {excelOpen && <ExcelUploadModal onClose={() => setExcelOpen(false)} cart={cart} />}

      {/* 출고장 만들기 마법사 — 모달 ① + ② */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[95vh] flex flex-col">
            <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                <Truck size={20} className="text-purple-600" /> 출고장 만들기
                <span className="ml-2 text-xs font-normal text-gray-500">
                  {step === 1 ? "① 판번호 매칭 + 차분 만들기" : "② 송장정보 입력 (공급처/납품처)"}
                </span>
              </h3>
              <div className="flex items-center gap-3">
                <div className="text-xs text-gray-500">출고일</div>
                <input type="date" value={shippedAt} onChange={e => setShippedAt(e.target.value)}
                  className="px-2 py-1 text-sm border border-gray-300 rounded" />
                <button onClick={() => setOpen(false)} disabled={submitting} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex items-center gap-2"><AlertTriangle size={14} /> {error}</div>}

              {/* 출고담당자 — 작성(출고)자 + 연락처 + 기본값 체크박스 */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-[11px] font-bold text-purple-700 mb-1">작성(출고)자</label>
                    <input value={writerName} onChange={e => setWriterName(e.target.value)}
                      placeholder="홍길동" className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded" />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-[11px] font-bold text-purple-700 mb-1">작성자 연락처</label>
                    <input value={writerPhone} onChange={e => setWriterPhone(e.target.value)}
                      placeholder="010-1234-5678" className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded font-mono" />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-purple-700 select-none cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={writerDefault} onChange={e => setWriterDefault(e.target.checked)} className="w-4 h-4" />
                    기본값으로 저장
                  </label>
                </div>

                <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-purple-200">
                  <div className="flex-1 min-w-[260px]">
                    <label className="block text-[11px] font-bold text-amber-700 mb-1">공급처</label>
                    <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
                      <option value="">— 선택 —</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.bizNo ?? "사업자번호 없음"})</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-amber-700 select-none cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={supplierDefault} onChange={e => setSupplierDefault(e.target.checked)} className="w-4 h-4" />
                    기본값으로 저장
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-amber-700 select-none cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={supplierUnify} onChange={e => setSupplierUnify(e.target.checked)} className="w-4 h-4" />
                    공급처 통일 (모든 차분 동일)
                  </label>
                </div>
              </div>

              {step === 1 ? (
                <Step1
                  rowsM={rowsM}
                  setRow={setRow}
                  vehicles={vehicles}
                  setVehicles={setVehicles}
                  updateVehicle={updateVehicle}
                  addVehicle={addVehicle}
                  removeVehicle={removeVehicle}
                  checked={checked}
                  toggleCheck={toggleCheck}
                  setCheckedAll={setChecked}
                  unassignedRows={unassignedRows}
                  checkedWeight={checkedWeight}
                />
              ) : (
                <Step2
                  vehicles={vehicles}
                  rowsM={rowsM}
                  suppliers={suppliers}
                  deliveries={deliveries}
                  updateVehicle={updateVehicle}
                  unifiedSupplierId={supplierId}
                  supplierUnify={supplierUnify}
                />
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between rounded-b-2xl">
              <div className="text-xs text-gray-500">
                총 {cart.items.length}건 · {fmtKg(cart.totalWeight)} · 차분 {vehicles.length}대
              </div>
              <div className="flex items-center gap-2">
                {step === 2 && (
                  <button onClick={() => setStep(1)} disabled={submitting} className="inline-flex items-center gap-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50">
                    <ChevronLeft size={14} /> 이전
                  </button>
                )}
                {step === 1 ? (
                  <button onClick={goToStep2} className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                    다음 (송장정보) <ChevronRight size={14} />
                  </button>
                ) : (
                  <button onClick={submit} disabled={submitting} className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-black rounded-lg disabled:opacity-50">
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {submitting ? "확정 중…" : "출고 확정 + 거래명세표 발행"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════ */
/* Step 1 — 판번호 매칭 + 차분 만들기                            */
/* ════════════════════════════════════════════════════════════ */
function Step1({
  rowsM, setRow, vehicles, addVehicle, removeVehicle,
  checked, toggleCheck, setCheckedAll, unassignedRows, checkedWeight,
}: {
  rowsM:  ModalRow[];
  setRow: (id: string, patch: Partial<ModalRow>) => void;
  vehicles: Vehicle[];
  setVehicles: (v: Vehicle[]) => void;
  updateVehicle: (idx: number, patch: Partial<Vehicle>) => void;
  addVehicle: () => void;
  removeVehicle: (idx: number) => void;
  checked: Set<string>;
  toggleCheck: (id: string) => void;
  setCheckedAll: (s: Set<string>) => void;
  unassignedRows: ModalRow[];
  checkedWeight: number;
}) {
  return (
    <div className="space-y-4">
      {/* 미배차 자재 테이블 */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center justify-between">
          <span>미배차 자재 {unassignedRows.length}건</span>
          {checked.size > 0 && <span className="text-amber-700">선택 {checked.size}건 / {fmtKg(checkedWeight)}</span>}
        </div>
        <div className="border border-gray-200 rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-gray-600">
                <th className="px-2 py-2 text-center w-8">
                  <input
                    type="checkbox"
                    checked={unassignedRows.length > 0 && unassignedRows.every(r => checked.has(r.steelPlanId))}
                    onChange={e => {
                      if (e.target.checked) {
                        // 미배차 전체 추가
                        const next = new Set(checked);
                        for (const r of unassignedRows) next.add(r.steelPlanId);
                        setCheckedAll(next);
                      } else {
                        // 미배차 자재만 선택 해제 (다른 차분에 든 것은 영향 없음)
                        const next = new Set(checked);
                        for (const r of unassignedRows) next.delete(r.steelPlanId);
                        setCheckedAll(next);
                      }
                    }}
                    title="미배차 자재 전체선택"
                  />
                </th>
                <th className="px-2 py-2 text-left">호선</th>
                <th className="px-2 py-2 text-left">재질</th>
                <th className="px-2 py-2 text-right">두께</th>
                <th className="px-2 py-2 text-right">폭</th>
                <th className="px-2 py-2 text-right">길이</th>
                <th className="px-2 py-2 text-right">중량(kg)</th>
                <th className="px-2 py-2 text-left">블록</th>
                <th className="px-2 py-2 text-left">판번호</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {unassignedRows.length === 0 ? (
                <tr><td colSpan={9} className="py-6 text-center text-gray-400">모든 자재가 배차되었습니다.</td></tr>
              ) : unassignedRows.map(r => {
                const isChecked = checked.has(r.steelPlanId);
                return (
                  <tr key={r.steelPlanId} className={isChecked ? "bg-amber-50" : "hover:bg-gray-50/60"}>
                    <td className="px-2 py-1 text-center">
                      <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(r.steelPlanId)} />
                    </td>
                    <td className="px-2 py-1 font-mono">
                      {r.kind === "remnant" && <span className="mr-1 px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700">잔재</span>}
                      {r.vesselCode}
                    </td>
                    <td className="px-2 py-1">{r.material}</td>
                    <td className="px-2 py-1 text-right">{r.thickness}</td>
                    <td className="px-2 py-1 text-right">{r.width}</td>
                    <td className="px-2 py-1 text-right">{r.length}</td>
                    <td className="px-2 py-1 text-right">{r.weight.toFixed(1)}</td>
                    <td className="px-2 py-1">
                      <input value={r.block} onChange={e => setRow(r.steelPlanId, { block: e.target.value })}
                        placeholder="블록" className="w-20 px-1.5 py-0.5 text-xs border border-gray-200 rounded" />
                    </td>
                    <td className="px-2 py-1">
                      <HeatPicker row={r} onChange={patch => setRow(r.steelPlanId, patch)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button onClick={addVehicle} disabled={checked.size === 0}
          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          <Truck size={14} /> 선택 자재로 차분 만들기 ({checked.size}건 · {fmtKg(checkedWeight)})
        </button>
      </div>

      {/* 차분 리스트 */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase mb-2">차분 (배차) {vehicles.length}대</div>
        {vehicles.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg py-8 text-center text-sm text-gray-400">
            아직 차분이 없습니다. 위에서 자재 선택 후 [차분 만들기] 를 누르세요.
          </div>
        ) : (
          <div className="space-y-3">
            {vehicles.map((v, idx) => {
              const myRows = rowsM.filter(r => r.vehicleIdx === idx);
              const totalW = myRows.reduce((s, r) => s + r.weight, 0);
              return (
                <div key={v.id} className="border-2 border-gray-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">차분 #{v.sequence}</span>
                      <span className="text-xs text-gray-600">{myRows.length}건 · {fmtKg(totalW)}</span>
                    </div>
                    <button onClick={() => removeVehicle(idx)} className="text-xs text-red-600 hover:underline">차분 해제</button>
                  </div>
                  {/* 차분별 실제 자재 리스트 (확인용). 차량번호·운전자 등은 거래명세표 출력 전에 입력 */}
                  <div className="border border-gray-100 rounded-lg overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="px-2 py-1 text-left">호선</th>
                          <th className="px-2 py-1 text-left">재질</th>
                          <th className="px-2 py-1 text-right">두께</th>
                          <th className="px-2 py-1 text-right">폭</th>
                          <th className="px-2 py-1 text-right">길이</th>
                          <th className="px-2 py-1 text-right">중량(kg)</th>
                          <th className="px-2 py-1 text-left">판번호</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {myRows.map(r => (
                          <tr key={r.steelPlanId}>
                            <td className="px-2 py-1 font-medium">
                              {r.kind === "remnant" && <span className="mr-1 px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700">잔재</span>}
                              {r.vesselCode}
                            </td>
                            <td className="px-2 py-1">{r.material}</td>
                            <td className="px-2 py-1 text-right font-mono">{r.thickness}</td>
                            <td className="px-2 py-1 text-right font-mono">{r.width}</td>
                            <td className="px-2 py-1 text-right font-mono">{r.length}</td>
                            <td className="px-2 py-1 text-right font-mono">{r.weight.toFixed(1)}</td>
                            <td className="px-2 py-1 font-mono">{r.heatNo || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function HeatPicker({ row, onChange }: { row: ModalRow; onChange: (p: Partial<ModalRow>) => void }) {
  // 잔재: 판번호 매칭 없음(자체 heatNo 텍스트만). 원판: 사양 후보 datalist + 신규 표시.
  if (row.kind === "remnant") {
    return (
      <input
        value={row.heatNo}
        onChange={e => onChange({ heatNo: e.target.value, heatId: null, manualHeatNo: false })}
        placeholder="판번호(선택)"
        className="w-32 px-1.5 py-0.5 text-xs border border-gray-300 rounded font-mono"
      />
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        list={`heat-${row.steelPlanId}`}
        value={row.heatNo}
        onChange={e => {
          const v = e.target.value;
          const hit = row.heatOptions.find(o => o.heatNo === v);
          onChange({
            heatNo: v,
            heatId: hit?.id ?? null,
            manualHeatNo: !hit && v.trim().length > 0,
          });
        }}
        placeholder="판번호"
        className="w-32 px-1.5 py-0.5 text-xs border border-gray-300 rounded font-mono"
      />
      {row.heatOptions.length > 0 && (
        <datalist id={`heat-${row.steelPlanId}`}>
          {row.heatOptions.map(o => <option key={o.id} value={o.heatNo} />)}
        </datalist>
      )}
      {row.manualHeatNo && row.heatNo && <span className="text-[10px] text-amber-700">신규</span>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/* Step 2 — 송장정보 (공급처/납품처)                              */
/* ════════════════════════════════════════════════════════════ */
function Step2({
  vehicles, rowsM, suppliers, deliveries, updateVehicle,
  unifiedSupplierId, supplierUnify,
}: {
  vehicles: Vehicle[];
  rowsM: ModalRow[];
  suppliers: DeliveryVendor[];
  deliveries: DeliveryVendor[];
  updateVehicle: (idx: number, patch: Partial<Vehicle>) => void;
  unifiedSupplierId: string;
  supplierUnify:     boolean;
}) {
  return (
    <div className="space-y-3">
      {vehicles.map((v, idx) => {
        const myRows = rowsM.filter(r => r.vehicleIdx === idx);
        // 통일이 켜져있으면 Step1 의 공급처 사용 (UI 표시용)
        const effectiveSupplierId = supplierUnify ? unifiedSupplierId : v.supplierId;
        const sup = suppliers.find(s => s.id === effectiveSupplierId);
        const del = deliveries.find(d => d.id === v.deliveryId);
        return (
          <div key={v.id} className="border-2 border-gray-200 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">차분 #{v.sequence}</span>
                <span className="text-xs text-gray-600">{v.vehicleNo} · {myRows.length}건</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-amber-200 bg-amber-50/30 rounded-lg p-3">
                <label className="text-xs font-bold text-amber-700 block mb-1">
                  공급처 * {supplierUnify && <span className="ml-1 text-[10px] font-normal text-amber-600">(Step1 통일 적용)</span>}
                </label>
                <select value={effectiveSupplierId}
                  onChange={e => updateVehicle(idx, { supplierId: e.target.value })}
                  disabled={supplierUnify}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white disabled:bg-gray-100 disabled:cursor-not-allowed">
                  <option value="">— 선택 —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.bizNo ?? "사업자번호 없음"})</option>)}
                </select>
                {sup && (
                  <div className="mt-2 text-[11px] text-gray-700 space-y-0.5">
                    <div>대표자: {sup.ceo ?? "-"}</div>
                    <div>주소: {sup.address ?? "-"}</div>
                    <div>전화: {sup.phone ?? "-"}</div>
                  </div>
                )}
              </div>
              <div className="border border-blue-200 bg-blue-50/30 rounded-lg p-3">
                <label className="text-xs font-bold text-blue-700 block mb-1">납품처 (공급받는자) *</label>
                <select value={v.deliveryId} onChange={e => updateVehicle(idx, { deliveryId: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded bg-white">
                  <option value="">— 선택 —</option>
                  {deliveries.map(d => <option key={d.id} value={d.id}>{d.name} ({d.bizNo ?? "사업자번호 없음"})</option>)}
                </select>
                {del && (
                  <div className="mt-2 text-[11px] text-gray-700 space-y-0.5">
                    <div>대표자: {del.ceo ?? "-"}</div>
                    <div>주소: {del.address ?? "-"}</div>
                    <div>전화: {del.phone ?? "-"}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
/* 엑셀 업로드 모달                                              */
/* ════════════════════════════════════════════════════════════ */
export function ExcelUploadModal({ onClose, cart, embedded = false }: { onClose: () => void; cart: ReturnType<typeof useShipoutCart>; embedded?: boolean }) {
  interface MatchResult {
    rowNo:        number;
    vesselCode:   string;
    material:     string;
    thickness:    number;
    width:        number;
    length:       number;
    weight:       number;
    heatNo?:      string;
    status:       "MATCHED" | "NOT_RECEIVED" | "NOT_FOUND" | "HEAT_NOT_FOUND";
    reason?:      string;
    steelPlanId?: string;
    steelPlanHeatId?: string;
  }
  interface Summary { total: number; matched: number; notReceived: number; notFound: number; heatNotFound: number }

  const [uploading, setUploading] = useState(false);
  const [results,   setResults]   = useState<MatchResult[] | null>(null);
  const [summary,   setSummary]   = useState<Summary | null>(null);
  const [error,     setError]     = useState("");

  const onSelect = async (file: File) => {
    setUploading(true); setError(""); setResults(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/shipments/excel-upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.success) { setError(json.error || "업로드 실패"); return; }
      setResults(json.results);
      setSummary(json.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally { setUploading(false); }
  };

  /** 미매칭(미입고·없는 자재) 행만 엑셀로 다운로드 — 추후 입고 후 그대로 다시 업로드 가능 */
  const handleDownloadUnmatched = () => {
    if (!results) return;
    const unmatched = results.filter(r => r.status !== "MATCHED");
    if (unmatched.length === 0) return;
    const data: (string | number)[][] = [
      ["호선", "재질", "두께", "폭", "길이", "판번호", "상태", "사유"],
      ...unmatched.map(r => [
        r.vesselCode ?? "",
        r.material,
        r.thickness,
        r.width,
        r.length,
        r.heatNo ?? "",
        r.status === "NOT_RECEIVED" ? "미입고" : "없는 자재",
        r.reason ?? "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "미매칭");
    const today = new Date().toISOString().slice(0,10).replace(/-/g, "");
    XLSX.writeFile(wb, `미매칭_외부출고_${today}.xlsx`);
  };

  const handleAddMatched = () => {
    if (!results) return;
    const matched = results.filter(r => r.status === "MATCHED" && r.steelPlanId);
    const result = cart.add(matched.map(r => ({
      steelPlanId: r.steelPlanId!,
      vesselCode:  r.vesselCode,
      material:    r.material,
      thickness:   r.thickness,
      width:       r.width,
      length:      r.length,
      weight:      r.weight,
      prefilledHeatNo: r.heatNo,
    })));
    alert(`${result.added}건이 카트에 담겼습니다.` + (result.duplicates > 0 ? `\n이미 카트에 있는 ${result.duplicates}건 제외.` : ""));
    onClose();
  };

  const bodyAndFooter = (
    <>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>}

          {!results ? (
            <>
              <div className="text-sm text-gray-700">
                양식: <strong>재질 · 두께 · 폭 · 길이</strong> 필수 + <strong>호선 · 판번호</strong> 선택 (헤더 1행).
                중량은 사양으로 자동 계산. 판번호가 있으면 자동매칭, 없으면 사양 매칭(FIFO).
              </div>
              <label className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer ${uploading ? "border-gray-300 bg-gray-50" : "border-emerald-300 hover:bg-emerald-50/50"}`}>
                <Upload size={24} className="mx-auto mb-2 text-emerald-500" />
                <div className="text-sm font-semibold text-gray-700">
                  {uploading ? "처리 중…" : "엑셀 파일 선택 또는 드래그"}
                </div>
                <input type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) onSelect(f); }} />
              </label>
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                <div className="text-xs text-gray-500">양식이 필요하신가요?</div>
                <button
                  onClick={downloadShipoutListTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50"
                >
                  <Download size={13} /> 외부출고리스트_양식.xlsx
                </button>
              </div>
            </>
          ) : (
            <>
              {summary && (
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-gray-100 rounded-lg py-2">
                    <div className="text-xl font-bold">{summary.total}</div>
                    <div className="text-xs text-gray-500">총</div>
                  </div>
                  <div className="bg-emerald-100 rounded-lg py-2">
                    <div className="text-xl font-bold text-emerald-700">{summary.matched}</div>
                    <div className="text-xs text-emerald-700">매칭</div>
                  </div>
                  <div className="bg-red-100 rounded-lg py-2">
                    <div className="text-xl font-bold text-red-700">{summary.notReceived}</div>
                    <div className="text-xs text-red-700">미입고</div>
                  </div>
                  <div className="bg-red-100 rounded-lg py-2">
                    <div className="text-xl font-bold text-red-700">{summary.notFound}</div>
                    <div className="text-xs text-red-700">없는 자재</div>
                  </div>
                </div>
              )}

              {summary && (summary.notReceived > 0 || summary.notFound > 0) && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 space-y-2">
                  <div className="flex items-start gap-2 text-sm text-amber-800">
                    <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>미매칭 자재 {summary.notReceived + summary.notFound}건</strong>
                      {summary.notReceived > 0 && ` (미입고 ${summary.notReceived})`}
                      {summary.notFound > 0    && ` (없는 자재 ${summary.notFound})`}
                      {` — 매칭된 ${summary.matched}건만 카트에 담을 수 있습니다.`}
                      <div className="mt-1 text-xs text-amber-700">
                        미매칭 자재를 엑셀로 따로 받아두면 입고 처리 후 그대로 다시 업로드할 수 있습니다.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="border border-gray-200 rounded-lg overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-gray-600">
                      <th className="px-2 py-1.5 text-center">행</th>
                      <th className="px-2 py-1.5 text-left">호선</th>
                      <th className="px-2 py-1.5 text-left">재질</th>
                      <th className="px-2 py-1.5 text-right">두께</th>
                      <th className="px-2 py-1.5 text-right">폭</th>
                      <th className="px-2 py-1.5 text-right">길이</th>
                      <th className="px-2 py-1.5 text-right">중량</th>
                      <th className="px-2 py-1.5 text-left">판번호</th>
                      <th className="px-2 py-1.5 text-center">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {results.map(r => (
                      <tr key={r.rowNo} className={
                        r.status === "MATCHED" ? "" :
                        "bg-red-50"
                      }>
                        <td className="px-2 py-1 text-center">{r.rowNo}</td>
                        <td className="px-2 py-1 font-mono">{r.vesselCode}</td>
                        <td className="px-2 py-1">{r.material}</td>
                        <td className="px-2 py-1 text-right">{r.thickness}</td>
                        <td className="px-2 py-1 text-right">{r.width}</td>
                        <td className="px-2 py-1 text-right">{r.length}</td>
                        <td className="px-2 py-1 text-right">{r.weight.toFixed(1)}</td>
                        <td className="px-2 py-1 font-mono">{r.heatNo ?? "-"}</td>
                        <td className="px-2 py-1 text-center">
                          {r.status === "MATCHED" ? <span className="text-emerald-600 font-bold">✓ 매칭</span> :
                            <span className="text-red-600 font-semibold" title={r.reason}>✗ {r.status === "NOT_RECEIVED" ? "미입고" : "없음"}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2 rounded-b-2xl">
          {results && summary && (summary.notReceived + summary.notFound) > 0 && (
            <button onClick={handleDownloadUnmatched}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border border-amber-400 text-amber-700 rounded-lg hover:bg-amber-50">
              <Download size={14} /> 미매칭 {summary.notReceived + summary.notFound}건 엑셀 다운로드
            </button>
          )}
          {results && (
            <button onClick={handleAddMatched}
              disabled={!summary || summary.matched === 0}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              <Plus size={14} /> 매칭된 {summary?.matched ?? 0}건 카트에 담기
            </button>
          )}
        </div>
    </>
  );

  if (embedded) return <div className="flex flex-col max-h-[70vh]">{bodyAndFooter}</div>;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-emerald-600" /> 엑셀로 출고자재 일괄 추가
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} /></button>
        </div>
        {bodyAndFooter}
      </div>
    </div>
  );
}
