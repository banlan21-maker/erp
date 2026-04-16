"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Upload, Plus, Trash2, RefreshCw, Download, Search, X,
  CheckSquare, Square, ClipboardList, PackageOpen, Hash, PackageCheck, Printer, Filter,
} from "lucide-react";
import ColumnFilterDropdown, { type FilterValue } from "./column-filter-dropdown";

/* ── 타입 ─────────────────────────────────────────────────────────────────── */
interface SteelPlanRow {
  id: string;
  vesselCode: string;
  material: string;
  thickness: number;
  width: number;
  length: number;
  status: "REGISTERED" | "RECEIVED" | "COMPLETED";
  receivedAt:       string | null;
  actualHeatNo:     string | null;
  actualVesselCode: string | null;
  actualDrawingNo:  string | null;
  memo:             string | null;
  storageLocation:  string | null;
  sourceFile: string | null;
  reservedFor:      string | null;
  createdAt: string;
}

interface SteelPlanHeatRow {
  id: string;
  vesselCode: string;
  material: string;
  thickness: number;
  width: number;
  length: number;
  heatNo: string;
  status: "WAITING" | "CUT";
  sourceFile: string | null;
  createdAt: string;
}

/* ── 상태 라벨 ─────────────────────────────────────────────────────────────── */
const PLAN_STATUS: Record<string, { label: string; cls: string }> = {
  REGISTERED: { label: "등록",     cls: "bg-gray-100 text-gray-700" },
  RECEIVED:   { label: "입고완료", cls: "bg-green-100 text-green-700" },
  COMPLETED:  { label: "절단완료", cls: "bg-blue-100  text-blue-700" },
};

// 강재 중량 계산 (단위: kg, 밀도 7.85 g/cm³)
const calcWeight = (t: number, w: number, l: number) =>
  Math.round(t * w * l * 7.85 / 1_000_000 * 100) / 100;

const HEAT_STATUS: Record<string, { label: string; cls: string }> = {
  WAITING: { label: "대기", cls: "bg-yellow-100 text-yellow-700" },
  CUT:     { label: "절단", cls: "bg-blue-100  text-blue-700" },
};

/* ── 엑셀 양식 다운로드 ────────────────────────────────────────────────────── */
function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["호선", "재질", "두께", "폭", "길이", "판번호"],
    ["RS01", "AH36", 8, 1829, 6096, "HT240001"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "강재입고");
  XLSX.writeFile(wb, "강재입고_양식.xlsx");
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function SteelPlanMain() {
  const [tab, setTab] = useState<"plan" | "heatno">("plan");

  /* ── 강재 전체목록 상태 ── */
  const [rows, setRows]         = useState<SteelPlanRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page,       setPage]       = useState(1);
  const [total,      setTotal]      = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  /* ── 컬럼 필터 (Excel 스타일) ── */
  const [colFilters,     setColFilters]     = useState<Record<string, string[]>>({});
  const [openFilter,     setOpenFilter]     = useState<string | null>(null);
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null);
  const [distinctValues, setDistinctValues] = useState<Record<string, FilterValue[]>>({});

  /* ── 선택입고 날짜 모달 ── */
  const [receivedDateModal, setReceivedDateModal] = useState<{ targetIds: string[] } | null>(null);
  const [receivedDateInput, setReceivedDateInput] = useState("");

  /* ── 메모 모달 ── */
  type MemoModalMode = "input" | "view" | "edit";
  const [memoModal, setMemoModal] = useState<{ id: string; memo: string; mode: MemoModalMode } | null>(null);
  const [memoInput, setMemoInput] = useState("");
  const [memoSaving, setMemoSaving] = useState(false);

  /* ── 위치 설정 모달 ── */
  const [locationModal, setLocationModal] = useState<{ ids: string[]; initialValue: string } | null>(null);
  const [locationInput, setLocationInput] = useState("");
  const [locationSaving, setLocationSaving] = useState(false);

  /* ── 판번호 리스트 상태 ── */
  const [heatRows, setHeatRows]         = useState<SteelPlanHeatRow[]>([]);
  const [heatLoading, setHeatLoading]   = useState(false);
  const [heatSearch, setHeatSearch]     = useState("");
  const [heatPage,       setHeatPage]       = useState(1);
  const [heatTotal,      setHeatTotal]      = useState(0);
  const [heatTotalPages, setHeatTotalPages] = useState(1);
  const [heatColFilters,     setHeatColFilters]     = useState<Record<string, string[]>>({});
  const [heatOpenFilter,     setHeatOpenFilter]     = useState<string | null>(null);
  const [heatFilterAnchorEl, setHeatFilterAnchorEl] = useState<HTMLElement | null>(null);
  const [heatDistinctValues, setHeatDistinctValues] = useState<Record<string, FilterValue[]>>({});

  /* ── 호선강재 삭제 모달 ── */
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteVessel, setDeleteVessel]       = useState("");
  const [deleting, setDeleting]               = useState(false);

  /* ── 엑셀 업로드 ── */
  const fileRef   = useRef<HTMLInputElement>(null);
  const [uploading, setUploading]   = useState(false);

  /* ── 직접 등록 폼 ── */
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    vesselCode: "", material: "", thickness: "", width: "", length: "", heatNo: "", memo: "",
  });
  const [formSaving, setFormSaving] = useState(false);

  /* ── 데이터 로드 ─────────────────────────────────────────────────────── */
  /* ── 고유값 로드 (컬럼 필터 목록) ── */
  const loadDistinct = useCallback(async () => {
    const res = await fetch("/api/steel-plan/distinct");
    if (res.ok) setDistinctValues(await res.json());
  }, []);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    p.set("page", String(page));
    const cf = colFilters;
    if (cf.vesselCode?.length)       p.set("vesselCodes",      cf.vesselCode.join(","));
    if (cf.material?.length)         p.set("materials",         cf.material.join(","));
    if (cf.thickness?.length)        p.set("thicknesses",       cf.thickness.join(","));
    if (cf.width?.length)            p.set("widths",            cf.width.join(","));
    if (cf.length?.length)           p.set("lengths",           cf.length.join(","));
    if (cf.status?.length)           p.set("statuses",          cf.status.join(","));
    if (cf.receivedAt?.length)       p.set("receivedDates",     cf.receivedAt.join(","));
    if (cf.storageLocation?.length)  p.set("storageLocations",  cf.storageLocation.join(","));
    if (cf.reservedFor?.length)      p.set("reservedFors",      cf.reservedFor.join(","));
    const res = await fetch(`/api/steel-plan?${p}`);
    if (res.ok) {
      const json = await res.json();
      setRows(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    }
    setLoading(false);
  }, [search, page, colFilters]);

  const loadHeatDistinct = useCallback(async () => {
    const res = await fetch("/api/steel-plan/heat/distinct");
    if (res.ok) setHeatDistinctValues(await res.json());
  }, []);

  const loadHeat = useCallback(async () => {
    setHeatLoading(true);
    const p = new URLSearchParams();
    if (heatSearch) p.set("search", heatSearch);
    p.set("page", String(heatPage));
    const cf = heatColFilters;
    if (cf.vesselCode?.length) p.set("vesselCodes", cf.vesselCode.join(","));
    if (cf.material?.length)   p.set("materials",   cf.material.join(","));
    if (cf.thickness?.length)  p.set("thicknesses", cf.thickness.join(","));
    if (cf.width?.length)      p.set("widths",      cf.width.join(","));
    if (cf.length?.length)     p.set("lengths",     cf.length.join(","));
    if (cf.heatNo?.length)     p.set("heatNos",     cf.heatNo.join(","));
    if (cf.status?.length)     p.set("statuses",    cf.status.join(","));
    const res = await fetch(`/api/steel-plan/heat?${p}`);
    if (res.ok) {
      const json = await res.json();
      setHeatRows(json.data);
      setHeatTotal(json.total);
      setHeatTotalPages(json.totalPages);
    }
    setHeatLoading(false);
  }, [heatSearch, heatPage, heatColFilters]);

  useEffect(() => { loadDistinct(); }, [loadDistinct]);
  useEffect(() => { loadPlan(); }, [loadPlan]);
  useEffect(() => { if (tab === "heatno") { loadHeatDistinct(); loadHeat(); } }, [tab, loadHeatDistinct, loadHeat]);

  /* ── 선별지시서 출력 ── */
  const [printing, setPrinting] = useState(false);
  const handlePrint = async () => {
    setPrinting(true);
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    const cf = colFilters;
    if (cf.vesselCode?.length)       p.set("vesselCodes",      cf.vesselCode.join(","));
    if (cf.material?.length)         p.set("materials",         cf.material.join(","));
    if (cf.thickness?.length)        p.set("thicknesses",       cf.thickness.join(","));
    if (cf.width?.length)            p.set("widths",            cf.width.join(","));
    if (cf.length?.length)           p.set("lengths",           cf.length.join(","));
    if (cf.status?.length)           p.set("statuses",          cf.status.join(","));
    if (cf.receivedAt?.length)       p.set("receivedDates",     cf.receivedAt.join(","));
    if (cf.storageLocation?.length)  p.set("storageLocations",  cf.storageLocation.join(","));
    if (cf.reservedFor?.length)      p.set("reservedFors",      cf.reservedFor.join(","));
    p.set("all", "true");

    const res  = await fetch(`/api/steel-plan?${p}`);
    const json = await res.json();
    const data: SteelPlanRow[] = json.data;
    setPrinting(false);

    const PLAN_LABEL: Record<string, string> = {
      REGISTERED: "등록", RECEIVED: "입고완료", COMPLETED: "절단완료",
    };
    const fmt = (iso: string | null) =>
      iso ? new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }) : "-";
    const wt  = (t: number, w: number, l: number) =>
      Math.round(t * w * l * 7.85 / 1_000_000 * 100) / 100;

    const filterDesc = [
      cf.vesselCode?.length       ? `호선: ${cf.vesselCode.join(", ")}`       : "",
      cf.material?.length         ? `재질: ${cf.material.join(", ")}`         : "",
      cf.thickness?.length        ? `두께: ${cf.thickness.join(", ")}`        : "",
      cf.width?.length            ? `폭: ${cf.width.join(", ")}`              : "",
      cf.length?.length           ? `길이: ${cf.length.join(", ")}`           : "",
      cf.status?.length           ? `상태: ${cf.status.map((s) => PLAN_LABEL[s] ?? s).join(", ")}` : "",
      cf.receivedAt?.length       ? `입고일: ${cf.receivedAt.join(", ")}`     : "",
      cf.storageLocation?.length  ? `보관위치: ${cf.storageLocation.join(", ")}` : "",
      cf.reservedFor?.length      ? `확정블록: ${cf.reservedFor.join(", ")}`  : "",
      search                      ? `검색: ${search}`                         : "",
    ].filter(Boolean).join(" / ");

    const rows_html = data.map((r, i) => `
      <tr class="${i % 2 === 0 ? "even" : ""}">
        <td>${r.vesselCode}</td>
        <td>${r.material}</td>
        <td class="num">${r.thickness}</td>
        <td class="num">${r.width}</td>
        <td class="num">${r.length}</td>
        <td class="num">${wt(r.thickness, r.width, r.length).toLocaleString()}</td>
        <td>${fmt(r.receivedAt)}</td>
        <td>${r.storageLocation ?? "-"}</td>
        <td>${PLAN_LABEL[r.status] ?? r.status}</td>
        <td>${r.status === "RECEIVED" && r.reservedFor ? r.reservedFor : "-"}</td>
        <td class="memo">${r.memo ?? ""}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<title>선별지시서</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Malgun Gothic", sans-serif; font-size: 11px; color: #111; padding: 16px; }
  h1 { font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 4px; }
  .meta { text-align: center; font-size: 10px; color: #555; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1e3a5f; color: #fff; padding: 5px 4px; font-size: 10px; text-align: center; border: 1px solid #ccc; }
  td { padding: 4px; border: 1px solid #ddd; text-align: center; vertical-align: middle; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.memo { text-align: left; font-size: 10px; color: #444; }
  tr.even { background: #f5f8fc; }
  .summary { margin-top: 8px; font-size: 10px; color: #555; text-align: right; }
  @media print {
    body { padding: 8px; }
    @page { margin: 10mm; size: A4 landscape; }
  }
</style>
</head>
<body>
<h1>선별지시서</h1>
<p class="meta">출력일시: ${new Date().toLocaleString("ko-KR")}${filterDesc ? " | 필터: " + filterDesc : ""}</p>
<table>
  <thead>
    <tr>
      <th>호선</th><th>재질</th><th>두께</th><th>폭</th><th>길이</th>
      <th>중량(kg)</th><th>입고일</th><th>보관위치</th><th>상태</th><th>확정블록</th><th>메모</th>
    </tr>
  </thead>
  <tbody>${rows_html}</tbody>
</table>
<p class="summary">총 ${data.length}건</p>
<script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=1100,height=750");
    if (win) { win.document.write(html); win.document.close(); }
  };

  /* ── 체크박스 전체 선택 (현재 페이지 기준) ── */

  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const toggleAll  = () => setSelectedIds(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne  = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  /* ── rows 로컬 업데이트 헬퍼 ── */
  const updateRowsLocally = (ids: string[], patch: Partial<SteelPlanRow>) => {
    setRows((prev) => prev.map((r) => ids.includes(r.id) ? { ...r, ...patch } : r));
  };

  /* ── 입고 처리 (행별 버튼) — Optimistic Update ── */
  const markReceived = async (id: string) => {
    const now = new Date().toISOString();
    // 즉시 로컬 반영 (깜빡임 없음)
    updateRowsLocally([id], { status: "RECEIVED", receivedAt: now });
    // 백그라운드 API
    const res = await fetch(`/api/steel-plan/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "RECEIVED", receivedAt: now }),
    });
    // 실패 시에만 서버 데이터로 복구
    if (!res.ok) loadPlan();
  };

  /* ── 입고 되돌리기 (RECEIVED → REGISTERED) — Optimistic Update ── */
  const revertReceived = async (id: string) => {
    if (!confirm("입고 처리를 되돌리시겠습니까? 입고일이 초기화됩니다.")) return;
    // 즉시 로컬 반영 (reservedFor도 초기화)
    updateRowsLocally([id], { status: "REGISTERED", receivedAt: null, reservedFor: null });
    const res = await fetch(`/api/steel-plan/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REGISTERED", receivedAt: null }),
    });
    if (!res.ok) loadPlan();
  };

  /* ── 절단완료 되돌리기 (COMPLETED → RECEIVED) — 작업일보 삭제 후 미복원 시 수동 복원 ── */
  const revertCut = async (id: string) => {
    if (!confirm("절단완료 상태를 입고완료로 되돌립니다.\n작업일보 삭제 후 상태가 복원되지 않은 경우에 사용하세요.")) return;
    // 즉시 로컬 반영
    updateRowsLocally([id], {
      status: "RECEIVED",
      actualHeatNo:     null,
      actualVesselCode: null,
      actualDrawingNo:  null,
    });
    const res = await fetch(`/api/steel-plan/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status:           "RECEIVED",
        actualHeatNo:     null,
        actualVesselCode: null,
        actualDrawingNo:  null,
      }),
    });
    if (!res.ok) loadPlan();
  };

  /* ── 다중 선택 입고 — 날짜 모달 오픈 ── */
  const markSelectedReceived = () => {
    const targets = Array.from(selectedIds).filter(
      (id) => rows.find((r) => r.id === id)?.status === "REGISTERED"
    );
    if (targets.length === 0) { alert("입고 처리할 수 있는 항목(등록 상태)이 없습니다."); return; }
    // 오늘 날짜를 기본값으로 설정
    setReceivedDateInput(new Date().toISOString().split("T")[0]);
    setReceivedDateModal({ targetIds: targets });
  };

  /* ── 선택입고 확정 (날짜 모달에서 확인 클릭) ── */
  const confirmSelectedReceived = async () => {
    if (!receivedDateModal) return;
    const { targetIds } = receivedDateModal;
    const iso = new Date(receivedDateInput + "T00:00:00").toISOString();
    setReceivedDateModal(null);
    // 즉시 로컬 반영
    updateRowsLocally(targetIds, { status: "RECEIVED", receivedAt: iso });
    setSelectedIds(new Set());
    // 백그라운드 API
    const results = await Promise.all(
      targetIds.map((id) =>
        fetch(`/api/steel-plan/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "RECEIVED", receivedAt: iso }),
        })
      )
    );
    if (results.some((r) => !r.ok)) loadPlan();
  };

  /* ── 호선 단위 삭제 (SteelPlan + SteelPlanHeat 동시) ── */
  const handleVesselDelete = async () => {
    if (!deleteVessel) return;
    if (!confirm(`[${deleteVessel}] 호선의 강재 전체목록 및 판번호 리스트를 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    await fetch("/api/steel-plan", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vesselCode: deleteVessel }),
    });
    setDeleting(false);
    setShowDeleteModal(false);
    setDeleteVessel("");
    loadPlan();
    loadHeat();
  };

  /* ── 위치 저장 ── */
  const saveLocation = async () => {
    if (!locationModal) return;
    setLocationSaving(true);
    const value = locationInput.trim() || null;
    // Optimistic
    updateRowsLocally(locationModal.ids, { storageLocation: value });
    setLocationModal(null);
    await Promise.all(
      locationModal.ids.map((id) =>
        fetch(`/api/steel-plan/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storageLocation: value }),
        })
      )
    );
    setLocationSaving(false);
    setSelectedIds(new Set());
  };

  /* ── 메모 저장/삭제 ── */
  const saveMemo = async () => {
    if (!memoModal) return;
    setMemoSaving(true);
    await fetch(`/api/steel-plan/${memoModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memo: memoInput.trim() || null }),
    });
    setMemoSaving(false);
    setMemoModal(null);
    loadPlan();
  };

  const deleteMemo = async () => {
    if (!memoModal) return;
    setMemoSaving(true);
    await fetch(`/api/steel-plan/${memoModal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memo: null }),
    });
    setMemoSaving(false);
    setMemoModal(null);
    loadPlan();
  };

  /* ── 직접 등록 ── */
  const handleAddRow = async () => {
    if (!form.vesselCode || !form.material || !form.thickness || !form.width || !form.length || !form.heatNo) {
      alert("호선, 재질, 두께, 폭, 길이, 판번호는 필수입니다.");
      return;
    }
    setFormSaving(true);
    await fetch("/api/steel-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{
        vesselCode: form.vesselCode.trim(),
        material:   form.material.trim(),
        thickness:  Number(form.thickness),
        width:      Number(form.width),
        length:     Number(form.length),
        heatNo:     form.heatNo.trim() || null,
        memo:       form.memo.trim() || null,
      }]),
    });
    setForm({ vesselCode: "", material: "", thickness: "", width: "", length: "", heatNo: "", memo: "" });
    setShowForm(false);
    setFormSaving(false);
    loadPlan();
    if (tab === "heatno") loadHeat();
  };

  /* ── 엑셀 업로드 ── */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf);
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const raw = (XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown) as unknown[][];

    // 헤더 행 자동 탐지
    let headerRow = 0;
    for (let i = 0; i < Math.min(10, raw.length); i++) {
      const joined = (raw[i] as string[]).join(" ");
      if (/재질|두께|폭|길이|material|thickness/i.test(joined)) { headerRow = i; break; }
    }

    const headers = (raw[headerRow] as string[]).map((h) => String(h).trim().toLowerCase());
    const colIdx  = (keys: string[]) => headers.findIndex((h) => keys.some((k) => h.includes(k)));

    const iVessel    = colIdx(["호선", "vessel"]);
    const iMaterial  = colIdx(["재질", "material"]);
    const iThickness = colIdx(["두께", "thickness", "t."]);
    const iWidth     = colIdx(["폭", "width", "w."]);
    const iLength    = colIdx(["길이", "length", "l."]);
    const iHeat      = colIdx(["판번호", "히트", "heat", "heatno"]);
    const iMemo      = colIdx(["메모", "비고", "memo", "remark"]);

    const items: object[] = [];
    for (let i = headerRow + 1; i < raw.length; i++) {
      const r         = raw[i] as (string | number)[];
      const material  = iMaterial  >= 0 ? String(r[iMaterial]  ?? "").trim() : "";
      const thickness = iThickness >= 0 ? Number(r[iThickness])              : 0;
      const width     = iWidth     >= 0 ? Number(r[iWidth])                  : 0;
      const length    = iLength    >= 0 ? Number(r[iLength])                 : 0;
      if (!material || !thickness || !width || !length) continue;

      const vesselCode = iVessel >= 0 ? String(r[iVessel] ?? "").trim() : "";
      if (!vesselCode) continue;

      items.push({
        vesselCode,
        material,
        thickness,
        width,
        length,
        heatNo:    iHeat >= 0 ? String(r[iHeat] ?? "").trim() || null : null,
        memo:      iMemo >= 0 ? String(r[iMemo] ?? "").trim() || null : null,
        sourceFile: file.name,
      });
    }

    if (items.length === 0) {
      alert("인식된 데이터가 없습니다.\n헤더(재질/두께/폭/길이)가 포함된 엑셀인지 확인하세요.");
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    const res = await fetch("/api/steel-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    });
    const { count } = await res.json();
    alert(`${count}건 등록 완료`);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    loadPlan();
    loadHeat();
  };

  const inputCls = "border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400";

  /* ══ 렌더 ══════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <PackageOpen size={24} className="text-blue-600" />
            강재 계획 · 입고관리
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">전체 강재 계획 등록 및 강재 입고처리</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setDeleteVessel(""); setShowDeleteModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
          >
            <Trash2 size={14} /> 호선강재 삭제
          </button>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
          >
            <Download size={14} /> 양식 다운로드
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Upload size={14} /> {uploading ? "업로드 중..." : "엑셀 업로드"}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Plus size={14} /> 직접 등록
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        {[
          { key: "plan",   icon: <ClipboardList size={14} />, label: "강재 전체목록" },
          { key: "heatno", icon: <Hash size={14} />,          label: "판번호 리스트" },
        ].map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key as "plan" | "heatno")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ── 강재 전체목록 탭 ── */}
      {tab === "plan" && (
        <>
          {/* 직접 등록 폼 */}
          {showForm && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-blue-700">새 항목 직접 등록</p>
              <div className="grid grid-cols-7 gap-2">
                {[
                  { label: "호선 *",    key: "vesselCode", placeholder: "RS01" },
                  { label: "재질 *",    key: "material",   placeholder: "AH36" },
                  { label: "두께(mm) *", key: "thickness",  placeholder: "8" },
                  { label: "폭(mm) *",  key: "width",      placeholder: "1829" },
                  { label: "길이(mm) *", key: "length",     placeholder: "6096" },
                  { label: "판번호 *",  key: "heatNo",     placeholder: "HT240001" },
                  { label: "메모",      key: "memo",       placeholder: "" },
                ].map(({ label, key, placeholder }) => (
                  <div key={key}>
                    <label className="text-xs text-gray-500">{label}</label>
                    <input
                      className={inputCls}
                      value={form[key as keyof typeof form]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      placeholder={placeholder}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowForm(false); setForm({ vesselCode: "", material: "", thickness: "", width: "", length: "", heatNo: "", memo: "" }); }} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
                <button onClick={handleAddRow} disabled={formSaving} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {formSaving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          )}

          {/* 상단 바: 텍스트 검색 + 액션 */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="호선·재질 검색"
                className="pl-8 pr-7 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 w-40"
              />
              {search && (
                <button onClick={() => { setSearch(""); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13} /></button>
              )}
            </div>
            {Object.values(colFilters).some((v) => v.length > 0) && (
              <button
                onClick={() => { setColFilters({}); setPage(1); }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50"
              >
                <X size={12} /> 필터 전체 초기화
              </button>
            )}
            <button onClick={() => { loadDistinct(); loadPlan(); }} className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-500"><RefreshCw size={14} /></button>
            <span className="text-sm text-gray-500 ml-auto">총 {total}건</span>
            <button
              onClick={handlePrint}
              disabled={printing || total === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Printer size={14} /> {printing ? "준비 중..." : "선별지시서 출력"}
            </button>
          </div>

          {/* 선택 액션 바 */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <span className="text-sm font-medium text-green-700">{selectedIds.size}건 선택됨</span>
              <button onClick={markSelectedReceived} className="flex items-center gap-1.5 px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                <PackageCheck size={13} /> 선택 입고
              </button>
              <button
                onClick={() => {
                  const ids = Array.from(selectedIds);
                  const first = rows.find((r) => ids[0] === r.id);
                  setLocationInput(ids.length === 1 && first?.storageLocation ? first.storageLocation : "");
                  setLocationModal({ ids, initialValue: ids.length === 1 && first?.storageLocation ? first.storageLocation : "" });
                }}
                className="flex items-center gap-1.5 px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                위치 설정
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-sm text-green-600 hover:underline">선택 해제</button>
            </div>
          )}

          {/* 강재 전체목록 테이블 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" style={{ tableLayout: "auto", fontSize: "12px" }}>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="w-7 px-1 py-1 text-center">
                      <button onClick={toggleAll}>
                        {allChecked ? <CheckSquare size={13} className="text-blue-600" /> : <Square size={13} className="text-gray-400" />}
                      </button>
                    </th>
                    {(["vesselCode","material","thickness","width","length"] as const).map((col, i) => {
                      const labels = ["호선","재질","두께","폭","길이"];
                      const active = (colFilters[col]?.length ?? 0) > 0;
                      return (
                        <th key={col} className="px-2 py-1 text-center font-medium text-gray-600 text-[11px]">
                          <div className="flex items-center justify-center gap-0.5">
                            <span>{labels[i]}</span>
                            <button onClick={(e) => { setOpenFilter(col); setFilterAnchorEl(e.currentTarget); }} className={`rounded hover:bg-gray-200 p-0.5 ${active ? "text-blue-500" : "text-gray-400"}`}>
                              <Filter size={10} fill={active ? "currentColor" : "none"} />
                            </button>
                          </div>
                        </th>
                      );
                    })}
                    <th className="px-2 py-1 text-center font-medium text-gray-600 text-[11px]">중량(kg)</th>
                    {(["receivedAt","storageLocation","status","reservedFor"] as const).map((col, i) => {
                      const labels = ["입고일","보관위치","상태","확정블록"];
                      const active = (colFilters[col]?.length ?? 0) > 0;
                      return (
                        <th key={col} className="px-2 py-1 text-center font-medium text-gray-600 text-[11px]">
                          <div className="flex items-center justify-center gap-0.5">
                            <span>{labels[i]}</span>
                            <button onClick={(e) => { setOpenFilter(col); setFilterAnchorEl(e.currentTarget); }} className={`rounded hover:bg-gray-200 p-0.5 ${active ? "text-blue-500" : "text-gray-400"}`}>
                              <Filter size={10} fill={active ? "currentColor" : "none"} />
                            </button>
                          </div>
                        </th>
                      );
                    })}
                    <th className="px-2 py-1 text-center font-medium text-gray-600 text-[11px]">실사용판번호</th>
                    <th className="px-2 py-1 text-center font-medium text-gray-600 text-[11px]">실사용호선</th>
                    <th className="px-2 py-1 text-center font-medium text-gray-600 text-[11px]">실사용도면번호</th>
                    <th className="px-2 py-1 text-center font-medium text-gray-600 text-[11px]">메모</th>
                    <th className="w-16 px-2 py-1 text-center font-medium text-gray-600 text-[11px]">입고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={16} className="py-12 text-center text-gray-400">불러오는 중...</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={16} className="py-12 text-center text-gray-400">등록된 강재 계획이 없습니다</td></tr>
                  ) : (
                    rows.map((row) => {
                      const st = PLAN_STATUS[row.status];
                      return (
                        <tr key={row.id} className={`hover:bg-gray-50 ${selectedIds.has(row.id) ? "bg-blue-50" : ""}`}>
                          <td className="px-1 py-1 text-center">
                            <button onClick={() => toggleOne(row.id)}>
                              {selectedIds.has(row.id) ? <CheckSquare size={13} className="text-blue-600" /> : <Square size={13} className="text-gray-400" />}
                            </button>
                          </td>
                          <td className="px-2 py-1 text-center font-medium">{row.vesselCode}</td>
                          <td className="px-2 py-1 text-center">{row.material}</td>
                          <td className="px-2 py-1 text-center">{row.thickness}</td>
                          <td className="px-2 py-1 text-center">{row.width}</td>
                          <td className="px-2 py-1 text-center">{row.length}</td>
                          <td className="px-2 py-1 text-center font-medium text-gray-700">
                            {calcWeight(row.thickness, row.width, row.length).toLocaleString()}
                          </td>
                          <td className="px-2 py-1 text-center text-gray-500 font-mono">
                            {row.receivedAt ? new Date(row.receivedAt).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }) : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-2 py-1 text-center">
                            {row.storageLocation ? (
                              <button
                                onClick={() => { setLocationInput(row.storageLocation!); setLocationModal({ ids: [row.id], initialValue: row.storageLocation! }); }}
                                className="px-1.5 py-0 text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100 font-medium max-w-[90px] truncate"
                                title={row.storageLocation}
                              >
                                {row.storageLocation}
                              </button>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-center">
                            <span className={`px-1.5 py-0 rounded-full text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                          </td>
                          <td className="px-2 py-1 text-center">
                            {row.status === "RECEIVED" && row.reservedFor ? (
                              <span className="px-1.5 py-0 rounded text-[11px] font-semibold bg-purple-100 text-purple-700">
                                {row.reservedFor} 확정
                              </span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-2 py-1 text-center font-mono text-blue-700">{row.actualHeatNo ?? "-"}</td>
                          <td className="px-2 py-1 text-center text-gray-600">{row.actualVesselCode ?? "-"}</td>
                          <td className="px-2 py-1 text-center text-gray-600">{row.actualDrawingNo ?? "-"}</td>
                          {/* 메모 버튼 */}
                          <td className="px-2 py-1 text-center">
                            {row.memo ? (
                              <button
                                onClick={() => { setMemoModal({ id: row.id, memo: row.memo!, mode: "view" }); setMemoInput(row.memo!); }}
                                className="px-1.5 py-0 text-[11px] border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
                              >
                                확인
                              </button>
                            ) : (
                              <button
                                onClick={() => { setMemoModal({ id: row.id, memo: "", mode: "input" }); setMemoInput(""); }}
                                className="px-1.5 py-0 text-[11px] border border-blue-300 rounded text-blue-600 hover:bg-blue-50"
                              >
                                입력
                              </button>
                            )}
                          </td>
                          {/* 입고/되돌리기 버튼 */}
                          <td className="px-2 py-1 text-center">
                            {row.status === "REGISTERED" ? (
                              <button
                                onClick={() => markReceived(row.id)}
                                className="px-2 py-0.5 text-[11px] bg-green-600 text-white rounded hover:bg-green-700 font-medium"
                              >
                                입고
                              </button>
                            ) : row.status === "RECEIVED" ? (
                              <button
                                onClick={() => revertReceived(row.id)}
                                className="px-2 py-0.5 text-[11px] border border-orange-300 text-orange-600 rounded hover:bg-orange-50 font-medium"
                              >
                                되돌리기
                              </button>
                            ) : row.status === "COMPLETED" ? (
                              <button
                                onClick={() => revertCut(row.id)}
                                className="px-2 py-0.5 text-[11px] border border-gray-300 text-gray-500 rounded hover:bg-gray-50 font-medium"
                                title="작업일보 삭제 후 상태 미복원 시 수동 복원"
                              >
                                복원
                              </button>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 컬럼 필터 드롭다운 */}
          {openFilter && filterAnchorEl && (
            <ColumnFilterDropdown
              anchorEl={filterAnchorEl}
              values={distinctValues[openFilter] ?? []}
              selected={colFilters[openFilter] ?? []}
              onApply={(vals) => {
                setColFilters((prev) => ({ ...prev, [openFilter]: vals }));
                setPage(1);
                setOpenFilter(null);
                setFilterAnchorEl(null);
              }}
              onClose={() => { setOpenFilter(null); setFilterAnchorEl(null); }}
            />
          )}

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                이전
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | "...")[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "..." ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`px-3 py-1.5 text-sm border rounded-lg ${page === p ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 hover:bg-gray-50"}`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                다음
              </button>
              <span className="text-xs text-gray-400 ml-2">{page} / {totalPages} 페이지</span>
            </div>
          )}
        </>
      )}

      {/* ── 판번호 리스트 탭 ── */}
      {tab === "heatno" && (
        <>
          {/* 상단 바 */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={heatSearch}
                onChange={(e) => { setHeatSearch(e.target.value); setHeatPage(1); }}
                placeholder="호선·재질·판번호 검색"
                className="pl-8 pr-7 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 w-44"
              />
              {heatSearch && (
                <button onClick={() => { setHeatSearch(""); setHeatPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13} /></button>
              )}
            </div>
            {Object.values(heatColFilters).some((v) => v.length > 0) && (
              <button
                onClick={() => { setHeatColFilters({}); setHeatPage(1); }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50"
              >
                <X size={12} /> 필터 전체 초기화
              </button>
            )}
            <button onClick={() => { loadHeatDistinct(); loadHeat(); }} className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-500"><RefreshCw size={14} /></button>
            <span className="text-sm text-gray-500 ml-auto">총 {heatTotal}건</span>
          </div>

          {/* 판번호 리스트 테이블 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: "12px" }}>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {(["vesselCode","material","thickness","width","length","heatNo","status"] as const).map((col, i) => {
                      const labels = ["호선","재질","두께","폭","길이","판번호","상태"];
                      const active = (heatColFilters[col]?.length ?? 0) > 0;
                      return (
                        <th key={col} className="px-2 py-1 text-center font-medium text-gray-600 text-[11px]">
                          <div className="flex items-center justify-center gap-0.5">
                            <span>{labels[i]}</span>
                            <button onClick={(e) => { setHeatOpenFilter(col); setHeatFilterAnchorEl(e.currentTarget); }} className={`rounded hover:bg-gray-200 p-0.5 ${active ? "text-blue-500" : "text-gray-400"}`}>
                              <Filter size={10} fill={active ? "currentColor" : "none"} />
                            </button>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {heatLoading ? (
                    <tr><td colSpan={7} className="py-8 text-center text-gray-400">불러오는 중...</td></tr>
                  ) : heatRows.length === 0 ? (
                    <tr><td colSpan={7} className="py-8 text-center text-gray-400">등록된 판번호가 없습니다</td></tr>
                  ) : (
                    heatRows.map((row) => {
                      const st = HEAT_STATUS[row.status];
                      return (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-2 py-1 text-center font-medium">{row.vesselCode}</td>
                          <td className="px-2 py-1 text-center">{row.material}</td>
                          <td className="px-2 py-1 text-center">{row.thickness}</td>
                          <td className="px-2 py-1 text-center">{row.width}</td>
                          <td className="px-2 py-1 text-center">{row.length}</td>
                          <td className="px-2 py-1 text-center font-mono text-blue-700 font-medium">{row.heatNo}</td>
                          <td className="px-2 py-1 text-center">
                            <span className={`px-1.5 py-0 rounded-full text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 판번호 컬럼 필터 드롭다운 */}
          {heatOpenFilter && heatFilterAnchorEl && (
            <ColumnFilterDropdown
              anchorEl={heatFilterAnchorEl}
              values={heatDistinctValues[heatOpenFilter] ?? []}
              selected={heatColFilters[heatOpenFilter] ?? []}
              onApply={(vals) => {
                setHeatColFilters((prev) => ({ ...prev, [heatOpenFilter]: vals }));
                setHeatPage(1);
                setHeatOpenFilter(null);
                setHeatFilterAnchorEl(null);
              }}
              onClose={() => { setHeatOpenFilter(null); setHeatFilterAnchorEl(null); }}
            />
          )}

          {/* 판번호 페이지네이션 */}
          {heatTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-3">
              <button
                onClick={() => setHeatPage((p) => Math.max(1, p - 1))}
                disabled={heatPage === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                이전
              </button>
              {Array.from({ length: heatTotalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === heatTotalPages || Math.abs(p - heatPage) <= 2)
                .reduce<(number | "...")[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "..." ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setHeatPage(p as number)}
                      className={`px-3 py-1.5 text-sm border rounded-lg ${heatPage === p ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 hover:bg-gray-50"}`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setHeatPage((p) => Math.min(heatTotalPages, p + 1))}
                disabled={heatPage === heatTotalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                다음
              </button>
              <span className="text-xs text-gray-400 ml-2">{heatPage} / {heatTotalPages} 페이지</span>
            </div>
          )}
        </>
      )}

      {/* ── 위치 설정 모달 ── */}
      {locationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">보관위치 설정</h3>
              <button onClick={() => setLocationModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            {locationModal.ids.length > 1 && (
              <p className="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2">{locationModal.ids.length}건에 동일하게 적용됩니다.</p>
            )}
            <input
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              placeholder="예: A-3 랙, 1창고 2번 구역"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") saveLocation(); }}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setLocationModal(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={saveLocation}
                disabled={locationSaving}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
              >
                {locationSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 메모 모달 ── */}
      {memoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">
                {memoModal.mode === "view" ? "메모 확인" : "메모 입력"}
              </h3>
              <button onClick={() => setMemoModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            {/* 보기 모드 */}
            {memoModal.mode === "view" && (
              <>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-4 py-3 min-h-[60px] whitespace-pre-wrap">
                  {memoModal.memo}
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={deleteMemo}
                    disabled={memoSaving}
                    className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40"
                  >
                    삭제
                  </button>
                  <button
                    onClick={() => setMemoModal({ ...memoModal, mode: "edit" })}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    수정
                  </button>
                </div>
              </>
            )}

            {/* 입력/수정 모드 */}
            {(memoModal.mode === "input" || memoModal.mode === "edit") && (
              <>
                <textarea
                  value={memoInput}
                  onChange={(e) => setMemoInput(e.target.value)}
                  placeholder="메모를 입력하세요"
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setMemoModal(null)}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    취소
                  </button>
                  <button
                    onClick={saveMemo}
                    disabled={memoSaving || !memoInput.trim()}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
                  >
                    {memoSaving ? "저장 중..." : "저장"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 선택입고 날짜 모달 ── */}
      {receivedDateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xs p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">입고일 선택</h3>
            <p className="text-sm text-gray-500">
              {receivedDateModal.targetIds.length}건을 입고 처리합니다.<br />
              입고일을 선택하세요.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">입고일</label>
              <input
                type="date"
                value={receivedDateInput}
                onChange={(e) => setReceivedDateInput(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setReceivedDateModal(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={confirmSelectedReceived}
                disabled={!receivedDateInput}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 font-medium"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 호선강재 삭제 모달 ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Trash2 size={16} className="text-red-500" /> 호선강재 삭제
              </h3>
              <button onClick={() => setShowDeleteModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <p className="text-sm text-gray-500">
              삭제할 호선을 선택하세요.<br />
              <span className="text-red-600 font-medium">강재 전체목록 + 판번호 리스트가 모두 삭제됩니다.</span>
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600">호선 선택</label>
              <select
                value={deleteVessel}
                onChange={(e) => setDeleteVessel(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                <option value="">-- 호선을 선택하세요 --</option>
                {(distinctValues.vesselCode ?? []).map(({ value }) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleVesselDelete}
                disabled={!deleteVessel || deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 font-medium"
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
