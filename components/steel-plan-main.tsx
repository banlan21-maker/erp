"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Upload, Plus, Trash2, RefreshCw, Download, Search, X,
  CheckSquare, Square, ClipboardList, PackageOpen, Hash, PackageCheck, Printer, Filter,
  ArrowUp, ArrowDown, FileSpreadsheet, Truck,
} from "lucide-react";
import ColumnFilterDropdown, { type FilterValue } from "./column-filter-dropdown";
import { serializeColFilters } from "@/lib/client-cascading";
import { useShipoutCart } from "./shipout-cart";
import ShipoutBar, { ExcelUploadModal as ShipoutExcelUploadModal } from "./shipout-bar";
import SteelMatchTab from "./steel-match-tab";

/* ── 컬럼 key → 쿼리스트링 param 이름 (distinct API 와 일치) ── */
const STEEL_PLAN_QS_KEY: Record<string, string> = {
  vesselCode:         "vesselCodes",
  material:           "materials",
  thickness:          "thicknesses",
  width:              "widths",
  length:             "lengths",
  status:             "statuses",
  storageLocation:    "storageLocations",
  reservedFor:        "reservedFors",
  receivedAt:         "receivedDates",
  uploadBatchNo:      "uploadBatchNos",
  selectionPrintedAt: "selectionPrintedDates",
  issuedAt:           "issuedDates",
  actualHeatNo:       "actualHeatNos",
  actualVesselCode:   "actualVesselCodes",
  actualDrawingNo:    "actualDrawingNos",
};

const STEEL_PLAN_HEAT_QS_KEY: Record<string, string> = {
  vesselCode:    "vesselCodes",
  material:      "materials",
  thickness:     "thicknesses",
  width:         "widths",
  length:        "lengths",
  heatNo:        "heatNos",
  status:        "statuses",
  uploadBatchNo: "uploadBatchNos",
};

/* ── 헬퍼 ─────────────────────────────────────────────────────────────────── */
// 부동소수점 오차 제거: 두께는 소수점 1자리, 폭/길이는 정수
const fmtT = (v: number) => parseFloat(v.toFixed(1));   // 7.10000000005 → 7.1
const fmtL = (v: number) => Math.round(v);               // 2140.00000001 → 2140

/* ── 타입 ─────────────────────────────────────────────────────────────────── */
interface SteelPlanRow {
  id: string;
  vesselCode: string;
  material: string;
  thickness: number;
  width: number;
  length: number;
  status: "REGISTERED" | "RECEIVED" | "ISSUED" | "COMPLETED" | "SHIPPED_OUT";
  receivedAt:         string | null;
  selectionPrintedAt: string | null;
  issuedAt:           string | null;
  memo:               string | null;
  storageLocation: string | null;
  sourceFile:      string | null;
  uploadBatchNo:   string | null;
  reservedFor:     string | null;
  shipoutMarkedAt: string | null;
  shipoutHeatNo:   string | null;
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
  status: "WAITING" | "CUT" | "SHIPPED";
  cutAt:         string | null;
  shippedAt:     string | null;
  sourceFile:    string | null;
  uploadBatchNo: string | null;
  createdAt: string;
}

/* ── 일괄 입고 행 타입 ─────────────────────────────────────────────────────── */
type BulkRow = { vesselCode: string; material: string; thickness: string; width: string; length: string; qty: string; storageLocation: string };

/* ── 상태 라벨 ─────────────────────────────────────────────────────────────── */
const PLAN_STATUS: Record<string, { label: string; cls: string }> = {
  REGISTERED:  { label: "대기", cls: "bg-gray-100 text-gray-700" },
  RECEIVED:    { label: "입고", cls: "bg-green-100 text-green-700" },
  ISSUED:      { label: "투입", cls: "bg-cyan-100  text-cyan-700" },
  COMPLETED:   { label: "절단", cls: "bg-blue-100  text-blue-700" },
  SHIPPED_OUT: { label: "외부", cls: "bg-purple-100 text-purple-700" },
};

// 강재 중량 계산 (단위: kg, 밀도 7.85 g/cm³)
const calcWeight = (t: number, w: number, l: number) =>
  Math.round(t * w * l * 7.85 / 1_000_000 * 10) / 10;

// ISO 날짜 → "YY.MM.DD" (공백 없이)
const fmtYMDcompact = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}`;
};

/* 엑셀 컬럼 폭 자동 계산 — 헤더/셀 내용 길이에 맞춰 wch 산정 (한글·전각은 폭 2로) */
function autoColWidths(rows: Record<string, unknown>[], headers?: string[]): { wch: number }[] {
  const keys = headers ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
  if (keys.length === 0) return [];
  const dispLen = (v: unknown) => {
    const s = String(v ?? "");
    let len = 0;
    for (const ch of s) len += ch.charCodeAt(0) > 0x2e7f ? 2 : 1;   // 한글/한자/전각 → 2
    return len;
  };
  return keys.map((k) => {
    let max = dispLen(k);
    for (const r of rows) max = Math.max(max, dispLen(r[k]));
    return { wch: Math.min(Math.max(max + 2, 6), 60) };   // 여유 +2, 최소 6, 최대 60
  });
}

const HEAT_STATUS: Record<string, { label: string; cls: string }> = {
  WAITING: { label: "대기", cls: "bg-yellow-100 text-yellow-700" },
  CUT:     { label: "절단", cls: "bg-blue-100  text-blue-700" },
  SHIPPED: { label: "외부", cls: "bg-purple-100 text-purple-700" },
};

/* ── 강재등록 엑셀 양식 다운로드 ─────────────────────────────────────────── */
function downloadRegisterTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["호선", "재질", "두께", "폭", "길이", "판번호"],
    ["RS01", "AH36", 8, 1829, 6096, "HT240001"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "강재등록");
  XLSX.writeFile(wb, "강재등록_양식.xlsx");
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function SteelPlanMain() {
  const shipoutCart = useShipoutCart();
  const [shipoutExcelOpen,  setShipoutExcelOpen]  = useState(false);
  const [registerExcelOpen, setRegisterExcelOpen] = useState(false);
  const [tab, setTab] = useState<"plan" | "heatno" | "match">("plan");

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

  /* ── 메모 필터 ("" 전체 / "has" 있음만 / "none" 없음만) — 서버 처리 ── */
  const [memoMode, setMemoMode] = useState<"" | "has" | "none">("");

  /* ── 정렬 (단일 컬럼 — 엑셀스타일 통합 드롭다운) ── */
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const handleSortFor = (col: string, dir: "asc" | "desc" | null) => {
    if (dir === null) { setSortKey(null); setSortDir("asc"); }
    else { setSortKey(col); setSortDir(dir); }
    setPage(1);
  };

  /* ── 선택입고 날짜 모달 ── */
  const [receivedDateModal, setReceivedDateModal] = useState<{ targetIds: string[] } | null>(null);
  const [receivedDateInput, setReceivedDateInput] = useState("");

  /* ── 선택출고 날짜 모달 ── */
  const [issuedDateModal, setIssuedDateModal] = useState<{ targetIds: string[] } | null>(null);
  const [issuedDateInput, setIssuedDateInput] = useState("");

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
  const [selectedHeatIds, setSelectedHeatIds] = useState<Set<string>>(new Set());
  const [editingHeat, setEditingHeat]   = useState<{ id: string; heatNo: string } | null>(null);
  const [editHeatNo,  setEditHeatNo]    = useState("");
  const [heatSearch, setHeatSearch]     = useState("");
  const [heatPage,       setHeatPage]       = useState(1);
  const [heatTotal,      setHeatTotal]      = useState(0);
  const [heatTotalPages, setHeatTotalPages] = useState(1);
  const [heatColFilters,     setHeatColFilters]     = useState<Record<string, string[]>>({});
  const [heatOpenFilter,     setHeatOpenFilter]     = useState<string | null>(null);
  const [heatFilterAnchorEl, setHeatFilterAnchorEl] = useState<HTMLElement | null>(null);
  const [heatDistinctValues, setHeatDistinctValues] = useState<Record<string, FilterValue[]>>({});

  /* ── 일괄 입고 모달 ── */
  const emptyBulkRow = (): BulkRow => ({ vesselCode: "", material: "", thickness: "", width: "", length: "", qty: "1", storageLocation: "" });
  const [showBulkReceive, setShowBulkReceive]   = useState(false);
  const [bulkRows,        setBulkRows]          = useState<BulkRow[]>([emptyBulkRow()]);
  const [showShipoutRegister, setShowShipoutRegister] = useState(false);
  const [bulkSubmitting,  setBulkSubmitting]    = useState(false);
  const [bulkResults,     setBulkResults]       = useState<{ vesselCode: string; material: string; thickness: number; width: number; length: number; qty: number; matched: number; notFound: boolean; error?: string }[] | null>(null);
  const [bulkReceiveDate, setBulkReceiveDate]   = useState(() => new Date().toISOString().slice(0, 10));
  const [bulkLocationAll, setBulkLocationAll]   = useState("");

  /* ── 삭제 모달 (호선/배치) ── */
  const [showDeleteModal, setShowDeleteModal]   = useState(false);
  const [deleteVessel, setDeleteVessel]         = useState("");
  const [deleteBatchNo, setDeleteBatchNo]       = useState("");
  const [deleteTab, setDeleteTab]               = useState<"vessel" | "batch">("vessel");
  const [deleting, setDeleting]                 = useState(false);

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
  /* ── 고유값 로드 (컬럼 필터 목록) — colFilters/search 변경 시 cascading 재계산 ── */
  const loadDistinct = useCallback(async () => {
    const qs = serializeColFilters(colFilters, STEEL_PLAN_QS_KEY);
    // search 도 함께 전달 — 본 데이터와 distinct 일관성 보장 (검색어 활성 시 호선 옵션 0건 호선 노출 방지)
    const sp = new URLSearchParams(qs);
    if (search) sp.set("search", search);
    const qsAll = sp.toString();
    const res = await fetch(`/api/steel-plan/distinct${qsAll ? `?${qsAll}` : ""}`);
    if (res.ok) setDistinctValues(await res.json());
  }, [colFilters, search]);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    p.set("page", String(page));
    if (sortKey) { p.set("sortBy", sortKey); p.set("sortDir", sortDir); }
    const cf = colFilters;
    if (cf.vesselCode?.length)          p.set("vesselCodes",          cf.vesselCode.join(","));
    if (cf.material?.length)            p.set("materials",             cf.material.join(","));
    if (cf.thickness?.length)           p.set("thicknesses",           cf.thickness.join(","));
    if (cf.width?.length)               p.set("widths",                cf.width.join(","));
    if (cf.length?.length)              p.set("lengths",               cf.length.join(","));
    if (cf.status?.length)              p.set("statuses",              cf.status.join(","));
    if (cf.receivedAt?.length)          p.set("receivedDates",         cf.receivedAt.join(","));
    if (cf.storageLocation?.length)     p.set("storageLocations",      cf.storageLocation.join(","));
    if (cf.reservedFor?.length)         p.set("reservedFors",          cf.reservedFor.join(","));
    if (cf.actualHeatNo?.length)        p.set("actualHeatNos",         cf.actualHeatNo.join(","));
    if (cf.actualVesselCode?.length)    p.set("actualVesselCodes",     cf.actualVesselCode.join(","));
    if (cf.actualDrawingNo?.length)     p.set("actualDrawingNos",      cf.actualDrawingNo.join(","));
    if (cf.uploadBatchNo?.length)       p.set("uploadBatchNos",        cf.uploadBatchNo.join(","));
    if (cf.selectionPrintedAt?.length)  p.set("selectionPrintedDates", cf.selectionPrintedAt.join(","));
    if (cf.issuedAt?.length)            p.set("issuedDates",           cf.issuedAt.join(","));
    if (memoMode) p.set("memoMode", memoMode);
    const res = await fetch(`/api/steel-plan?${p}`);
    if (res.ok) {
      const json = await res.json();
      setRows(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    }
    setLoading(false);
  }, [search, page, colFilters, sortKey, sortDir, memoMode]);

  const loadHeatDistinct = useCallback(async () => {
    const qs = serializeColFilters(heatColFilters, STEEL_PLAN_HEAT_QS_KEY);
    const sp = new URLSearchParams(qs);
    if (heatSearch) sp.set("search", heatSearch);
    const qsAll = sp.toString();
    const res = await fetch(`/api/steel-plan/heat/distinct${qsAll ? `?${qsAll}` : ""}`);
    if (res.ok) setHeatDistinctValues(await res.json());
  }, [heatColFilters, heatSearch]);

  const loadHeat = useCallback(async () => {
    setHeatLoading(true);
    const p = new URLSearchParams();
    if (heatSearch) p.set("search", heatSearch);
    p.set("page", String(heatPage));
    const cf = heatColFilters;
    if (cf.vesselCode?.length)    p.set("vesselCodes",    cf.vesselCode.join(","));
    if (cf.material?.length)      p.set("materials",      cf.material.join(","));
    if (cf.thickness?.length)     p.set("thicknesses",    cf.thickness.join(","));
    if (cf.width?.length)         p.set("widths",         cf.width.join(","));
    if (cf.length?.length)        p.set("lengths",        cf.length.join(","));
    if (cf.heatNo?.length)        p.set("heatNos",        cf.heatNo.join(","));
    if (cf.status?.length)        p.set("statuses",       cf.status.join(","));
    if (cf.uploadBatchNo?.length) p.set("uploadBatchNos", cf.uploadBatchNo.join(","));
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

  /* ── 엑셀 다운로드 ── */
  const [excelLoading, setExcelLoading] = useState<"none" | "plan-all" | "plan-current" | "heat-all" | "heat-current">("none");

  const buildPlanFilterParams = (forAll: boolean, useSelected: boolean) => {
    const p = new URLSearchParams();
    p.set("all", "true");
    if (useSelected) {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return null;
      p.set("ids", ids.join(","));
      return p;
    }
    if (forAll) return p;
    if (search) p.set("search", search);
    const cf = colFilters;
    if (cf.vesselCode?.length)          p.set("vesselCodes",          cf.vesselCode.join(","));
    if (cf.material?.length)            p.set("materials",            cf.material.join(","));
    if (cf.thickness?.length)           p.set("thicknesses",          cf.thickness.join(","));
    if (cf.width?.length)               p.set("widths",               cf.width.join(","));
    if (cf.length?.length)              p.set("lengths",              cf.length.join(","));
    if (cf.status?.length)              p.set("statuses",             cf.status.join(","));
    if (cf.receivedAt?.length)          p.set("receivedDates",        cf.receivedAt.join(","));
    if (cf.storageLocation?.length)     p.set("storageLocations",     cf.storageLocation.join(","));
    if (cf.reservedFor?.length)         p.set("reservedFors",         cf.reservedFor.join(","));
    if (cf.uploadBatchNo?.length)       p.set("uploadBatchNos",       cf.uploadBatchNo.join(","));
    if (cf.selectionPrintedAt?.length)  p.set("selectionPrintedDates",cf.selectionPrintedAt.join(","));
    if (cf.issuedAt?.length)            p.set("issuedDates",          cf.issuedAt.join(","));
    return p;
  };

  const downloadPlanExcel = async (mode: "all" | "current") => {
    const useSelected = mode === "current" && selectedIds.size > 0;
    const params = buildPlanFilterParams(mode === "all", useSelected);
    if (!params) return;
    setExcelLoading(mode === "all" ? "plan-all" : "plan-current");
    try {
      const res = await fetch(`/api/steel-plan?${params}`);
      const json = await res.json();
      const data: SteelPlanRow[] = json.data ?? [];
      if (data.length === 0) { alert("다운로드할 데이터가 없습니다."); return; }

      const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
      const rows_ws = data.map((r) => ({
        "업로드번호": r.uploadBatchNo ?? "",
        "호선":       r.vesselCode,
        "재질":       r.material,
        "두께":       fmtT(r.thickness),
        "폭":         fmtL(r.width),
        "길이":       fmtL(r.length),
        "중량(kg)":   calcWeight(r.thickness, r.width, r.length),
        "상태":       PLAN_STATUS[r.status]?.label ?? r.status,
        "확정정보": r.reservedFor ?? "",
        "보관위치":   r.storageLocation ?? "",
        "입고일":     fmt(r.receivedAt),
        "선별지시일": fmt(r.selectionPrintedAt),
        "출고일":     fmt(r.issuedAt),
        "메모":       r.memo ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows_ws);
      ws["!cols"] = [{ wch: 14 },{ wch: 8 },{ wch: 8 },{ wch: 6 },{ wch: 7 },{ wch: 7 },{ wch: 9 },{ wch: 9 },{ wch: 16 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 30 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "강재전체목록");
      const today = new Date().toISOString().split("T")[0];
      const tag = useSelected ? "선택" : (mode === "all" ? "전체" : "필터");
      XLSX.writeFile(wb, `강재전체목록_${tag}_${today}.xlsx`);
    } finally {
      setExcelLoading("none");
    }
  };

  const buildHeatFilterParams = (forAll: boolean) => {
    const p = new URLSearchParams();
    p.set("all", "true");
    if (forAll) return p;
    if (heatSearch) p.set("search", heatSearch);
    const cf = heatColFilters;
    if (cf.vesselCode?.length)    p.set("vesselCodes",    cf.vesselCode.join(","));
    if (cf.material?.length)      p.set("materials",      cf.material.join(","));
    if (cf.thickness?.length)     p.set("thicknesses",    cf.thickness.join(","));
    if (cf.width?.length)         p.set("widths",         cf.width.join(","));
    if (cf.length?.length)        p.set("lengths",        cf.length.join(","));
    if (cf.heatNo?.length)        p.set("heatNos",        cf.heatNo.join(","));
    if (cf.status?.length)        p.set("statuses",       cf.status.join(","));
    if (cf.uploadBatchNo?.length) p.set("uploadBatchNos", cf.uploadBatchNo.join(","));
    return p;
  };

  const downloadHeatExcel = async (mode: "all" | "current") => {
    setExcelLoading(mode === "all" ? "heat-all" : "heat-current");
    try {
      const params = buildHeatFilterParams(mode === "all");
      const res = await fetch(`/api/steel-plan/heat?${params}`);
      const json = await res.json();
      const data: SteelPlanHeatRow[] = json.data ?? [];
      if (data.length === 0) { alert("다운로드할 데이터가 없습니다."); return; }

      const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
      const rows_ws = data.map((r) => ({
        "업로드번호": r.uploadBatchNo ?? "",
        "호선":       r.vesselCode,
        "재질":       r.material,
        "두께":       fmtT(r.thickness),
        "폭":         fmtL(r.width),
        "길이":       fmtL(r.length),
        "판번호":     r.heatNo,
        "상태":       HEAT_STATUS[r.status]?.label ?? r.status,
        "사용/출고일": r.status === "SHIPPED" ? fmt(r.shippedAt) : fmt(r.cutAt),
      }));
      const ws = XLSX.utils.json_to_sheet(rows_ws);
      ws["!cols"] = [{ wch: 14 },{ wch: 8 },{ wch: 8 },{ wch: 6 },{ wch: 7 },{ wch: 7 },{ wch: 14 },{ wch: 8 },{ wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "판번호리스트");
      const today = new Date().toISOString().split("T")[0];
      const tag = mode === "all" ? "전체" : "필터";
      XLSX.writeFile(wb, `판번호리스트_${tag}_${today}.xlsx`);
    } finally {
      setExcelLoading("none");
    }
  };

  /* ── 선별지시서 출력 (매칭) 모달 ── */
  const [matchOpen, setMatchOpen] = useState(false);

  /* ── 선별지시서 출력 — loadPlan 과 동일한 필터를 전송해 화면과 결과 일치 ── */
  const [printing, setPrinting] = useState(false);

  /* 선별지시서 데이터 조회 (출력·엑셀 공통) — 화면과 동일한 필터 전송 */
  const fetchSelectionRows = async (): Promise<{ data: SteelPlanRow[]; filterDesc: string }> => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    const cf = colFilters;
    if (cf.vesselCode?.length)          p.set("vesselCodes",          cf.vesselCode.join(","));
    if (cf.material?.length)            p.set("materials",             cf.material.join(","));
    if (cf.thickness?.length)           p.set("thicknesses",           cf.thickness.join(","));
    if (cf.width?.length)               p.set("widths",                cf.width.join(","));
    if (cf.length?.length)              p.set("lengths",               cf.length.join(","));
    if (cf.status?.length)              p.set("statuses",              cf.status.join(","));
    if (cf.receivedAt?.length)          p.set("receivedDates",         cf.receivedAt.join(","));
    if (cf.storageLocation?.length)     p.set("storageLocations",      cf.storageLocation.join(","));
    if (cf.reservedFor?.length)         p.set("reservedFors",          cf.reservedFor.join(","));
    if (cf.actualHeatNo?.length)        p.set("actualHeatNos",         cf.actualHeatNo.join(","));
    if (cf.actualVesselCode?.length)    p.set("actualVesselCodes",     cf.actualVesselCode.join(","));
    if (cf.actualDrawingNo?.length)     p.set("actualDrawingNos",      cf.actualDrawingNo.join(","));
    if (cf.uploadBatchNo?.length)       p.set("uploadBatchNos",        cf.uploadBatchNo.join(","));
    if (cf.selectionPrintedAt?.length)  p.set("selectionPrintedDates", cf.selectionPrintedAt.join(","));
    if (cf.issuedAt?.length)            p.set("issuedDates",           cf.issuedAt.join(","));
    if (memoMode)                       p.set("memoMode",              memoMode);
    if (sortKey) { p.set("sortBy", sortKey); p.set("sortDir", sortDir); }
    p.set("all", "true");   // 페이지네이션만 우회 — 필터는 그대로 적용됨

    const res  = await fetch(`/api/steel-plan?${p}`);
    const json = await res.json();
    const data: SteelPlanRow[] = json.data ?? [];

    const labelOf = (s: string) => PLAN_STATUS[s]?.label ?? s;
    const filterDesc = [
      cf.vesselCode?.length       ? `호선: ${cf.vesselCode.join(", ")}`       : "",
      cf.material?.length         ? `재질: ${cf.material.join(", ")}`         : "",
      cf.thickness?.length        ? `두께: ${cf.thickness.join(", ")}`        : "",
      cf.width?.length            ? `폭: ${cf.width.join(", ")}`              : "",
      cf.length?.length           ? `길이: ${cf.length.join(", ")}`           : "",
      cf.status?.length           ? `상태: ${cf.status.map(labelOf).join(", ")}` : "",
      cf.receivedAt?.length       ? `입고일: ${cf.receivedAt.join(", ")}`     : "",
      cf.storageLocation?.length  ? `위치: ${cf.storageLocation.join(", ")}`  : "",
      cf.reservedFor?.length      ? `확정정보: ${cf.reservedFor.join(", ")}`       : "",
      search                      ? `검색: ${search}`                         : "",
    ].filter(Boolean).join(" / ");

    return { data, filterDesc };
  };

  /* 선별지시 행에 선별지시일 기록 (출력·엑셀 공통) */
  const markSelectionPrinted = (ids: string[]) => {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    updateRowsLocally(ids, { selectionPrintedAt: now });
    fetch("/api/steel-plan/mark-printed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  };

  /* 선별지시서 출력 (인쇄) */
  const handlePrint = async () => {
    setPrinting(true);
    const { data, filterDesc } = await fetchSelectionRows();
    setPrinting(false);
    if (data.length === 0) { alert("출력할 데이터가 없습니다."); return; }

    const labelOf = (s: string) => PLAN_STATUS[s]?.label ?? s;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const fmt = (iso: string | null) => fmtYMDcompact(iso) || "-";   // YY.MM.DD
    const wt  = (t: number, w: number, l: number) =>
      (Math.round(t * w * l * 7.85 / 1_000_000 * 10) / 10).toFixed(1);

    const rows_html = data.map((r, i) => `
      <tr class="${i % 2 === 0 ? "even" : ""}">
        <td>${esc(r.vesselCode)}</td>
        <td>${esc(r.material)}</td>
        <td class="num">${fmtT(r.thickness)}</td>
        <td class="num">${fmtL(r.width)}</td>
        <td class="num">${fmtL(r.length)}</td>
        <td class="num">${wt(r.thickness, r.width, r.length)}</td>
        <td>${fmt(r.receivedAt)}</td>
        <td>${esc(r.storageLocation ?? "-")}</td>
        <td>${labelOf(r.status)}</td>
        <td>${esc(r.reservedFor ?? "")}</td>
        <td class="memo">${esc(r.memo ?? "")}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<title>선별지시서</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Malgun Gothic", sans-serif; font-size: 16pt; color: #111; padding: 4mm; }
  h1 { font-size: 20pt; font-weight: bold; text-align: center; margin-bottom: 2mm; letter-spacing: 1px; }
  .meta { text-align: center; font-size: 10pt; color: #555; margin-bottom: 2mm; }
  /* auto layout — 모든 컬럼이 내용 길이에 따라 자동으로 폭 결정 */
  table { width: 100%; border-collapse: collapse; table-layout: auto; }
  th { background: #1e3a5f; color: #fff; padding: 1px 2px; font-size: 13pt; text-align: center; border: 1px solid #888; line-height: 1.1; white-space: nowrap; }
  td { padding: 1px 2px; border: 1px solid #aaa; text-align: center; vertical-align: middle; font-size: 16pt; line-height: 1.1; white-space: nowrap; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.memo { text-align: left; font-size: 13pt; color: #222; white-space: normal; }
  tr.even { background: #f5f8fc; }
  .summary { margin-top: 2mm; font-size: 10pt; color: #555; text-align: right; }
  @media print {
    body { padding: 3mm; }
    @page { margin: 6mm; size: A4 landscape; }
  }
</style>
</head>
<body>
<h1>선별지시서</h1>
<p class="meta">출력일시: ${new Date().toLocaleString("ko-KR")} | 총수량: ${data.length}장 | 총중량: ${data.reduce((s, r) => s + r.thickness * r.width * r.length * 7.85 / 1_000_000, 0).toFixed(1)}kg${filterDesc ? " | 필터: " + filterDesc : ""}</p>
<table>
  <thead>
    <tr>
      <th>호선</th><th>재질</th><th>두께</th><th>폭</th><th>길이</th>
      <th>중량(kg)</th><th>입고일</th><th>위치</th><th>상태</th><th>확정정보</th><th>메모</th>
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

    // 출력된 행에 선별지시일 기록 + 로컬 즉시 반영
    markSelectionPrinted(data.map((r) => r.id));
  };

  /* ── 체크박스 전체 선택 (현재 페이지 기준) ── */

  const allChecked = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const toggleAll  = () => setSelectedIds(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne  = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  /* ── 판번호 리스트 체크박스 ── */
  const allHeatChecked = heatRows.length > 0 && heatRows.every((r) => selectedHeatIds.has(r.id));
  const toggleAllHeat  = () => setSelectedHeatIds(allHeatChecked ? new Set() : new Set(heatRows.map((r) => r.id)));
  const toggleOneHeat  = (id: string) => {
    setSelectedHeatIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  /* ── 선택 삭제 확인 모달 ── */
  const [deleteModal, setDeleteModal] = useState<{ scope: "plan" | "heat"; ids: string[] } | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const openDeleteModal = (scope: "plan" | "heat") => {
    const ids = scope === "plan" ? Array.from(selectedIds) : Array.from(selectedHeatIds);
    if (ids.length === 0) return;
    setDeleteConfirmInput("");
    setDeleteModal({ scope, ids });
  };

  const submitDelete = async () => {
    if (!deleteModal) return;
    if (deleteConfirmInput.trim() !== "삭제") return;
    setDeleteSubmitting(true);
    try {
      const url = deleteModal.scope === "plan" ? "/api/steel-plan" : "/api/steel-plan/heat";
      const res = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: deleteModal.ids }),
      });
      if (!res.ok) { alert("삭제 실패"); return; }
      if (deleteModal.scope === "plan") {
        setSelectedIds(new Set());
        await Promise.all([loadPlan(), loadDistinct()]);
      } else {
        setSelectedHeatIds(new Set());
        await Promise.all([loadHeat(), loadHeatDistinct()]);
      }
      setDeleteModal(null);
    } catch { alert("서버 오류"); }
    finally { setDeleteSubmitting(false); }
  };

  /* ── rows 로컬 업데이트 헬퍼 ── */
  const updateRowsLocally = (ids: string[], patch: Partial<SteelPlanRow>) => {
    setRows((prev) => prev.map((r) => ids.includes(r.id) ? { ...r, ...patch } : r));
  };

  /* ── 출고 확정 취소 (확정정보 "출고" 빨간 배지 클릭) ── */
  const unmarkShipout = async (row: SteelPlanRow) => {
    if (!confirm(`'${row.vesselCode}' 출고 확정을 취소하시겠습니까?${row.shipoutHeatNo ? `\n(판번호: ${row.shipoutHeatNo})` : ""}`)) return;
    updateRowsLocally([row.id], { shipoutMarkedAt: null, shipoutHeatNo: null });
    await fetch("/api/steel-plan/shipout-mark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unmark", ids: [row.id] }),
    }).catch(() => {});
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
    if (!confirm("입고를 취소하시겠습니까? 입고일이 초기화됩니다.")) return;
    updateRowsLocally([id], { status: "REGISTERED", receivedAt: null, reservedFor: null });
    const res = await fetch(`/api/steel-plan/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "REGISTERED", receivedAt: null }),
    });
    if (!res.ok) loadPlan();
  };

  /* ── 출고 처리 (RECEIVED → ISSUED) — Optimistic Update ── */
  const markIssued = async (id: string) => {
    const now = new Date().toISOString();
    updateRowsLocally([id], { status: "ISSUED", issuedAt: now });
    const res = await fetch(`/api/steel-plan/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ISSUED" }),
    });
    if (!res.ok) loadPlan();
  };

  /* ── 출고 되돌리기 (ISSUED → RECEIVED) — Optimistic Update ── */
  const revertIssued = async (id: string) => {
    if (!confirm("출고를 취소하시겠습니까? 강재가 적치장으로 복귀됩니다.")) return;
    updateRowsLocally([id], { status: "RECEIVED", issuedAt: null });
    const res = await fetch(`/api/steel-plan/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "RECEIVED", cancelIssue: true }),
    });
    if (!res.ok) loadPlan();
  };

  /* ── 새로고침: 작업일보 기준 강재 상태 자동 동기화 ── */
  const syncAndRefresh = async () => {
    setLoading(true);
    // 작업일보(CuttingLog)와 불일치하는 강재·판번호 상태를 자동 복원
    await fetch("/api/steel-plan/sync", { method: "POST" });
    // 동기화 후 최신 데이터 로드
    await Promise.all([loadDistinct(), loadPlan(), loadHeatDistinct(), loadHeat()]);
    setLoading(false);
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

  /* ── 다중 선택 입고취소 (RECEIVED → REGISTERED) ── */
  const markSelectedReceiveCancelled = async () => {
    const targets = Array.from(selectedIds).filter(
      (id) => rows.find((r) => r.id === id)?.status === "RECEIVED"
    );
    if (targets.length === 0) { alert("입고취소할 수 있는 항목(입고완료 상태)이 없습니다."); return; }
    const now = new Date().toISOString();
    updateRowsLocally(targets, { status: "REGISTERED", receivedAt: null });
    setSelectedIds(new Set());
    const results = await Promise.all(
      targets.map((id) =>
        fetch(`/api/steel-plan/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "REGISTERED" }),
        })
      )
    );
    if (results.some((r) => !r.ok)) loadPlan();
  };

  /* ── 다중 선택 출고 — 날짜 모달 오픈 ── */
  const markSelectedIssued = () => {
    const targets = Array.from(selectedIds).filter(
      (id) => rows.find((r) => r.id === id)?.status === "RECEIVED"
    );
    if (targets.length === 0) { alert("출고 처리할 수 있는 항목(입고완료 상태)이 없습니다."); return; }
    setIssuedDateInput(new Date().toISOString().split("T")[0]);
    setIssuedDateModal({ targetIds: targets });
  };

  /* ── 선택출고 확정 (날짜 모달에서 확인 클릭) ── */
  const confirmSelectedIssued = async () => {
    if (!issuedDateModal) return;
    const { targetIds } = issuedDateModal;
    const iso = new Date(issuedDateInput + "T00:00:00").toISOString();
    setIssuedDateModal(null);
    updateRowsLocally(targetIds, { status: "ISSUED", issuedAt: iso });
    setSelectedIds(new Set());
    const res = await fetch("/api/steel-plan/issue-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: targetIds, issuedAt: iso }),
    });
    if (!res.ok) loadPlan();
  };

  /* ── 다중 선택 출고취소 (ISSUED → RECEIVED) ── */
  const markSelectedIssueCancelled = async () => {
    const targets = Array.from(selectedIds).filter(
      (id) => rows.find((r) => r.id === id)?.status === "ISSUED"
    );
    if (targets.length === 0) { alert("출고취소할 수 있는 항목(출고완료 상태)이 없습니다."); return; }
    updateRowsLocally(targets, { status: "RECEIVED", issuedAt: null });
    setSelectedIds(new Set());
    const results = await Promise.all(
      targets.map((id) =>
        fetch(`/api/steel-plan/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "RECEIVED", cancelIssue: true }),
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

  /* ── 배치 단위 삭제 ── */
  const handleBatchDelete = async () => {
    if (!deleteBatchNo) return;
    if (!confirm(`업로드 배치 [${deleteBatchNo}]의 강재 전체목록 및 판번호 리스트를 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    await fetch("/api/steel-plan", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadBatchNo: deleteBatchNo }),
    });
    setDeleting(false);
    setShowDeleteModal(false);
    setDeleteBatchNo("");
    loadPlan();
    loadHeat();
  };

  /* ── 판번호 행 단위 삭제 ── */
  const deleteHeatRow = async (id: string, heatNo: string) => {
    if (!confirm(`판번호 [${heatNo}]를 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/steel-plan-heat/${id}`, { method: "DELETE" });
    if ((await res.json()).success) loadHeat();
    else alert("삭제 실패");
  };

  /* ── 판번호 수정 저장 ── */
  const saveHeatEdit = async () => {
    if (!editingHeat || !editHeatNo.trim()) return;
    const res = await fetch(`/api/steel-plan-heat/${editingHeat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heatNo: editHeatNo.trim() }),
    });
    const data = await res.json();
    if (data.success) { setEditingHeat(null); loadHeat(); }
    else alert(data.error ?? "수정 실패");
  };

  /* ── 일괄 입고 확정 ── */
  const submitBulkReceive = async () => {
    const validRows = bulkRows.filter(r => r.vesselCode && r.material && r.thickness && r.width && r.length);
    if (validRows.length === 0) { alert("입력된 항목이 없습니다."); return; }
    setBulkSubmitting(true);
    setBulkResults(null);
    try {
      const res = await fetch("/api/steel-plan/receive-bulk", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          receivedAt: bulkReceiveDate,
          items: validRows.map(r => ({
            vesselCode:      r.vesselCode.trim(),
            material:        r.material.trim(),
            thickness:       Number(r.thickness),
            width:           Number(r.width),
            length:          Number(r.length),
            qty:             r.qty ? Number(r.qty) : 1,
            storageLocation: r.storageLocation.trim() || null,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setBulkResults(json.results);
        syncAndRefresh();
      } else {
        alert(json.error ?? "오류가 발생했습니다.");
      }
    } finally {
      setBulkSubmitting(false);
    }
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
  const processUploadFile = async (file: File) => {
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

    // 등록 전 확인 — 인식된 강재 건수 표시
    if (!window.confirm(`엑셀에서 강재 ${items.length}건이 인식되었습니다.\n등록하시겠습니까?`)) {
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

  // 기존 <input ref={fileRef}> 호환용 어댑터 (현재는 모달 경로 사용)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processUploadFile(file);
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
            강재 입출고
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">강재 계획 등록 · 입고 · 외부출고 통합 관리</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShipoutExcelOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50"
            title="출고 예정 엑셀을 업로드해 자동매칭 후 카트에 담기"
          >
            <PackageOpen size={14} /> 외부출고 리스트
          </button>
          <button
            onClick={() => { setDeleteVessel(""); setShowDeleteModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
          >
            <Trash2 size={14} /> 리스트 삭제
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => { setBulkRows([emptyBulkRow()]); setBulkResults(null); setShowBulkReceive(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600"
          >
            <PackageCheck size={14} /> 입고등록
          </button>
          <button
            onClick={() => setShowShipoutRegister(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            title="판번호를 입력해 출고할 강재를 확인하고 선별지시서를 출력"
          >
            <Truck size={14} /> 출고등록
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        {[
          { key: "plan",   icon: <ClipboardList size={14} />,   label: "강재 전체목록" },
          { key: "heatno", icon: <Hash size={14} />,            label: "판번호 리스트" },
          { key: "match",  icon: <FileSpreadsheet size={14} />, label: "강재매칭" },
        ].map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key as "plan" | "heatno" | "match")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ── 강재매칭 탭 ── */}
      {tab === "match" && <SteelMatchTab />}

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

          {/* 상단 바: 필터 초기화 + 페이지네이션 + 액션 */}
          <div className="flex items-center gap-2">
            {/* 왼쪽 */}
            <div className="flex items-center min-w-[120px]">
              {Object.values(colFilters).some((v) => v.length > 0) && (
                <button
                  onClick={() => { setColFilters({}); setPage(1); }}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50"
                >
                  <X size={12} /> 필터 전체 초기화
                </button>
              )}
            </div>
            {/* 중앙 페이지네이션 */}
            <div className="flex-1 flex justify-center">
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-2.5 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">이전</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                    .reduce<(number | "...")[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                      acc.push(p); return acc;
                    }, [])
                    .map((p, i) => p === "..." ? (
                      <span key={`et-${i}`} className="px-1 text-gray-400">…</span>
                    ) : (
                      <button key={p} onClick={() => setPage(p as number)}
                        className={`px-2.5 py-1 text-sm border rounded-lg ${page === p ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 hover:bg-gray-50"}`}>
                        {p}
                      </button>
                    ))}
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="px-2.5 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">다음</button>
                  <span className="text-xs text-gray-400 ml-1">{page}/{totalPages}</span>
                </div>
              )}
            </div>
            {/* 오른쪽 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">총 {total}건</span>
              <button
                onClick={() => {
                  const hasFilter = !!search
                    || Object.values(colFilters).some(v => v && v.length > 0)
                    || !!memoMode;
                  if (selectedIds.size > 0) {
                    // 선택 우선
                    downloadPlanExcel("current");
                    return;
                  }
                  if (hasFilter) {
                    downloadPlanExcel("current");
                    return;
                  }
                  if (confirm(`리스트 전체를 다운로드합니다. (총 ${total}건)\n계속하시겠습니까?`)) {
                    downloadPlanExcel("all");
                  }
                }}
                disabled={excelLoading !== "none" || total === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                title={selectedIds.size > 0 ? "선택된 항목만 다운로드" : "필터가 있으면 필터 결과, 없으면 전체 다운로드"}
              >
                <Download size={14} /> {excelLoading !== "none" ? "다운로드 중..." : (selectedIds.size > 0 ? `선택 다운로드(${selectedIds.size})` : "엑셀다운로드")}
              </button>
              <button
                onClick={handlePrint}
                disabled={printing || total === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Printer size={14} /> {printing ? "준비 중..." : "선별지시서 출력"}
              </button>
              <button
                onClick={() => setMatchOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900"
                title="엑셀 사양을 업로드해 입고 강재와 매칭한 뒤 선별지시서 출력"
              >
                <Printer size={14} /> 선별지시서 출력 (매칭)
              </button>
            </div>
          </div>

          {/* 선택 액션 바 */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <span className="text-sm font-medium text-green-700">{selectedIds.size}건 선택됨</span>
              <span className="text-sm text-green-600">
                선택중량 {rows.filter((r) => selectedIds.has(r.id)).reduce((sum, r) => sum + (r.thickness * r.width * r.length * 7.85 / 1_000_000), 0).toFixed(1)}kg
              </span>
              <button onClick={markSelectedReceived} className="flex items-center gap-1.5 px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                <PackageCheck size={13} /> 입고
              </button>
              <button onClick={markSelectedReceiveCancelled} className="flex items-center gap-1.5 px-3 py-1 text-sm border border-green-400 text-green-700 rounded-lg hover:bg-green-100">
                <PackageCheck size={13} /> 입고취소
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
                위치
              </button>
              <button onClick={markSelectedIssued} className="flex items-center gap-1.5 px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <PackageOpen size={13} /> 출고
              </button>
              <button onClick={markSelectedIssueCancelled} className="flex items-center gap-1.5 px-3 py-1 text-sm border border-blue-400 text-blue-700 rounded-lg hover:bg-blue-100">
                <PackageOpen size={13} /> 출고취소
              </button>
              {/* 외부 납품처 출고 카트에 담기 — RECEIVED 만 허용 */}
              <button
                onClick={() => {
                  const selected = rows.filter(r => selectedIds.has(r.id));
                  const eligible = selected.filter(r => r.status === "RECEIVED");
                  const blocked  = selected.length - eligible.length;
                  if (eligible.length === 0) {
                    alert("입고 상태인 자재만 외부 출고 카트에 담을 수 있습니다.");
                    return;
                  }
                  const result = shipoutCart.add(eligible.map(r => ({
                    steelPlanId: r.id,
                    vesselCode:  r.vesselCode,
                    material:    r.material,
                    thickness:   r.thickness,
                    width:       r.width,
                    length:      r.length,
                    weight:      calcWeight(r.thickness, r.width, r.length),
                  })));
                  setSelectedIds(new Set());
                  alert(
                    `${result.added}건이 카트에 담겼습니다.` +
                    (result.duplicates > 0 ? `\n이미 카트에 있는 ${result.duplicates}건은 제외.` : "") +
                    (blocked > 0 ? `\n입고 전 상태 ${blocked}건은 제외.` : ""),
                  );
                }}
                className="flex items-center gap-1.5 px-3 py-1 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                title="외부 납품처 출고 카트에 담기"
              >
                <PackageOpen size={13} /> 외부출고
              </button>
              <button onClick={() => openDeleteModal("plan")} className="flex items-center gap-1.5 px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
                <Trash2 size={13} /> 삭제
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
                    {([
                      ["uploadBatchNo", "업로드번호"],
                      ["vesselCode",    "호선"],
                      ["material",      "재질"],
                      ["thickness",     "두께"],
                      ["width",         "폭"],
                      ["length",        "길이"],
                    ] as [string, string][]).map(([col, label]) => {
                      const filterActive = (colFilters[col]?.length ?? 0) > 0;
                      const isSort = sortKey === col;
                      const active = filterActive || isSort;
                      return (
                        <th key={col} className="px-2 py-1 text-center font-medium text-gray-600 text-[11px]">
                          <div className="flex items-center justify-center gap-0.5">
                            <span>{label}</span>
                            <button
                              onClick={(e) => { setOpenFilter(col); setFilterAnchorEl(e.currentTarget); }}
                              className={`rounded hover:bg-gray-200 p-0.5 inline-flex items-center ${active ? "text-blue-600" : "text-gray-400"}`}
                              title={active ? "필터·정렬 적용 중" : "필터·정렬"}
                            >
                              <Filter size={10} fill={filterActive ? "currentColor" : "none"} />
                              {isSort && (sortDir === "asc"
                                ? <ArrowUp size={8} className="text-blue-500" />
                                : <ArrowDown size={8} className="text-blue-500" />)}
                            </button>
                          </div>
                        </th>
                      );
                    })}
                    {(() => {
                      const col = "weight";
                      const label = "중량(kg)";
                      const filterActive = (colFilters[col]?.length ?? 0) > 0;
                      const isSort = sortKey === col;
                      const active = filterActive || isSort;
                      return (
                        <th className="px-2 py-1 text-center font-medium text-gray-600 text-[11px]">
                          <div className="flex items-center justify-center gap-0.5">
                            <span>{label}</span>
                            <button
                              onClick={(e) => { setOpenFilter(col); setFilterAnchorEl(e.currentTarget); }}
                              className={`rounded hover:bg-gray-200 p-0.5 inline-flex items-center ${active ? "text-blue-600" : "text-gray-400"}`}
                              title={active ? "필터·정렬 적용 중 (현재 페이지)" : "필터·정렬 (현재 페이지)"}
                            >
                              <Filter size={10} fill={filterActive ? "currentColor" : "none"} />
                              {isSort && (sortDir === "asc"
                                ? <ArrowUp size={8} className="text-blue-500" />
                                : <ArrowDown size={8} className="text-blue-500" />)}
                            </button>
                          </div>
                        </th>
                      );
                    })()}
                    {([
                      ["receivedAt",       "입고일"],
                      ["storageLocation",  "위치"],
                      ["status",           "상태"],
                      ["reservedFor",      "확정정보"],
                      ["selectionPrintedAt","선별지시일"],
                      ["issuedAt",         "출고일"],
                    ] as [string, string][]).map(([col, label]) => {
                      const filterActive = (colFilters[col]?.length ?? 0) > 0;
                      const isSort = sortKey === col;
                      const active = filterActive || isSort;
                      return (
                        <th key={col} className="px-2 py-1 text-center font-medium text-gray-600 text-[11px]">
                          <div className="flex items-center justify-center gap-0.5">
                            <span>{label}</span>
                            <button
                              onClick={(e) => { setOpenFilter(col); setFilterAnchorEl(e.currentTarget); }}
                              className={`rounded hover:bg-gray-200 p-0.5 inline-flex items-center ${active ? "text-blue-600" : "text-gray-400"}`}
                              title={active ? "필터·정렬 적용 중" : "필터·정렬"}
                            >
                              <Filter size={10} fill={filterActive ? "currentColor" : "none"} />
                              {isSort && (sortDir === "asc"
                                ? <ArrowUp size={8} className="text-blue-500" />
                                : <ArrowDown size={8} className="text-blue-500" />)}
                            </button>
                          </div>
                        </th>
                      );
                    })}
                    <th className="px-2 py-1 text-center font-medium text-gray-600 text-[11px]">
                      <div className="flex items-center justify-center gap-0.5">
                        <span>메모</span>
                        <button
                          onClick={() => {
                            // 3단 토글: "" → "has" → "none" → ""
                            setMemoMode(prev => prev === "" ? "has" : prev === "has" ? "none" : "");
                            setPage(1);
                          }}
                          className={`rounded hover:bg-gray-200 p-0.5 inline-flex items-center ${memoMode ? "text-blue-600" : "text-gray-400"}`}
                          title={memoMode === "has" ? "메모 있는 것만" : memoMode === "none" ? "메모 없는 것만" : "메모 필터 해제 — 클릭해서 토글"}
                        >
                          <Filter size={10} fill={memoMode ? "currentColor" : "none"} />
                          {memoMode === "has"  && <span className="text-[8px] font-bold ml-0.5">●</span>}
                          {memoMode === "none" && <span className="text-[8px] font-bold ml-0.5">○</span>}
                        </button>
                      </div>
                    </th>
                    <th className="w-16 px-2 py-1 text-center font-medium text-gray-600 text-[11px]">입고</th>
                    <th className="w-16 px-2 py-1 text-center font-medium text-gray-600 text-[11px]">출고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={18} className="py-12 text-center text-gray-400">불러오는 중...</td></tr>
                  ) : (() => {
                    const wSel = colFilters.weight;
                    const filtered = (wSel && wSel.length > 0)
                      ? rows.filter(r => wSel.includes(calcWeight(r.thickness, r.width, r.length).toFixed(1)))
                      : rows;
                    if (filtered.length === 0) {
                      return <tr><td colSpan={18} className="py-12 text-center text-gray-400">{rows.length === 0 ? "등록된 강재 계획이 없습니다" : "필터 조건에 맞는 자재가 없습니다"}</td></tr>;
                    }
                    return filtered.map((row) => {
                      const st = PLAN_STATUS[row.status];
                      return (
                        <tr key={row.id} className={`hover:bg-gray-50 ${selectedIds.has(row.id) ? "bg-blue-50" : ""}`}>
                          <td className="px-1 py-1 text-center">
                            <button onClick={() => toggleOne(row.id)}>
                              {selectedIds.has(row.id) ? <CheckSquare size={13} className="text-blue-600" /> : <Square size={13} className="text-gray-400" />}
                            </button>
                          </td>
                          <td className="px-2 py-1 text-center font-mono text-[10px] text-gray-400">
                            {row.uploadBatchNo ?? <span className="text-gray-200">-</span>}
                          </td>
                          <td className="px-2 py-1 text-center font-medium">{row.vesselCode}</td>
                          <td className="px-2 py-1 text-center">{row.material}</td>
                          <td className="px-2 py-1 text-center">{fmtT(row.thickness)}</td>
                          <td className="px-2 py-1 text-center">{fmtL(row.width)}</td>
                          <td className="px-2 py-1 text-center">{fmtL(row.length)}</td>
                          <td className="px-2 py-1 text-center font-medium text-gray-700">
                            {calcWeight(row.thickness, row.width, row.length).toFixed(1)}
                          </td>
                          <td className="px-2 py-1 text-center text-gray-500 font-mono">
                            {row.receivedAt ? fmtYMDcompact(row.receivedAt) : <span className="text-gray-300">-</span>}
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
                            {row.shipoutMarkedAt && row.status === "RECEIVED" ? (
                              <span className="inline-flex items-center justify-center gap-1">
                                {row.reservedFor && (
                                  <span className="px-1 py-0 rounded text-[10px] font-semibold bg-purple-100 text-purple-700">
                                    {row.reservedFor}
                                  </span>
                                )}
                                <button
                                  onClick={() => unmarkShipout(row)}
                                  title={`출고 확정${row.shipoutHeatNo ? ` (판번호 ${row.shipoutHeatNo})` : ""} — 클릭 시 취소`}
                                  className="px-1.5 py-0 rounded text-[11px] font-semibold bg-red-100 text-red-700 hover:bg-red-200"
                                >
                                  {row.vesselCode} 출고
                                </button>
                              </span>
                            ) : (row.status === "RECEIVED" || row.status === "ISSUED") && row.reservedFor ? (
                              <span className="px-1.5 py-0 rounded text-[11px] font-semibold bg-purple-100 text-purple-700">
                                {row.reservedFor}
                              </span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          {/* 선별지시일 */}
                          <td className="px-2 py-1 text-center text-gray-500 font-mono">
                            {row.selectionPrintedAt ? fmtYMDcompact(row.selectionPrintedAt) : <span className="text-gray-300">-</span>}
                          </td>
                          {/* 출고일 */}
                          <td className="px-2 py-1 text-center text-gray-500 font-mono">
                            {row.issuedAt ? fmtYMDcompact(row.issuedAt) : <span className="text-gray-300">-</span>}
                          </td>
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
                          {/* 입고/입고취소 버튼 */}
                          <td className="px-2 py-1 text-center">
                            {row.status === "REGISTERED" ? (
                              <button onClick={() => markReceived(row.id)} className="px-2 py-0.5 text-[11px] bg-green-600 text-white rounded hover:bg-green-700 font-medium">
                                입고
                              </button>
                            ) : row.status === "RECEIVED" ? (
                              <button onClick={() => revertReceived(row.id)} className="px-2 py-0.5 text-[11px] bg-gray-400 text-white rounded hover:bg-gray-500 font-medium">
                                취소
                              </button>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                          {/* 출고/출고취소 버튼 */}
                          <td className="px-2 py-1 text-center">
                            {row.status === "RECEIVED" ? (
                              <button onClick={() => markIssued(row.id)} className="px-2 py-0.5 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">
                                출고
                              </button>
                            ) : row.status === "ISSUED" ? (
                              <button onClick={() => revertIssued(row.id)} className="px-2 py-0.5 text-[11px] bg-gray-400 text-white rounded hover:bg-gray-500 font-medium">
                                취소
                              </button>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* 컬럼 필터 드롭다운 */}
          {openFilter && filterAnchorEl && (() => {
            // weight 는 derived(계산값) — 클라이언트에서 현재 페이지 rows 기준으로 distinct 생성
            const values: FilterValue[] = openFilter === "weight"
              ? Array.from(
                  new Set(rows.map(r => calcWeight(r.thickness, r.width, r.length).toFixed(1)))
                )
                  .map(v => parseFloat(v))
                  .sort((a, b) => a - b)
                  .map(v => ({ value: v.toFixed(1), label: v.toFixed(1) }))
              : (distinctValues[openFilter] ?? []);
            return (
              <ColumnFilterDropdown
                anchorEl={filterAnchorEl}
                values={values}
                selected={colFilters[openFilter] ?? []}
                onApply={(vals) => {
                  setColFilters((prev) => ({ ...prev, [openFilter]: vals }));
                  if (openFilter !== "weight") setPage(1); // weight 는 클라이언트 필터라 페이지 유지
                  setOpenFilter(null);
                  setFilterAnchorEl(null);
                }}
                onClose={() => { setOpenFilter(null); setFilterAnchorEl(null); }}
                sortDir={sortKey === openFilter ? sortDir : null}
                onSort={(dir) => handleSortFor(openFilter, dir)}
              />
            );
          })()}

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
            <button onClick={syncAndRefresh} title="작업일보 기준으로 강재·판번호 상태 자동 동기화" className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-500"><RefreshCw size={14} /></button>
            <span className="text-sm text-gray-500 ml-auto">총 {heatTotal}건</span>
            <button
              onClick={() => downloadHeatExcel("all")}
              disabled={excelLoading !== "none"}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
              title="전체 데이터를 엑셀로 다운로드"
            >
              <Download size={14} /> {excelLoading === "heat-all" ? "다운로드 중..." : "전체 다운로드"}
            </button>
            <button
              onClick={() => downloadHeatExcel("current")}
              disabled={excelLoading !== "none" || heatTotal === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
              title="필터 결과 다운로드"
            >
              <Download size={14} /> {excelLoading === "heat-current" ? "다운로드 중..." : "필터 다운로드"}
            </button>
          </div>

          {/* 선택 액션 바 */}
          {selectedHeatIds.size > 0 && (
            <div className="flex items-center gap-2 flex-wrap bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <span className="text-sm font-medium text-green-700">{selectedHeatIds.size}건 선택됨</span>
              <button onClick={() => openDeleteModal("heat")} className="flex items-center gap-1.5 px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
                <Trash2 size={13} /> 선택 삭제
              </button>
              <button onClick={() => setSelectedHeatIds(new Set())} className="ml-auto text-sm text-green-600 hover:underline">선택 해제</button>
            </div>
          )}

          {/* 판번호 리스트 테이블 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: "12px" }}>
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="w-7 px-1 py-1 text-center">
                      <button onClick={toggleAllHeat}>
                        {allHeatChecked ? <CheckSquare size={13} className="text-blue-600" /> : <Square size={13} className="text-gray-400" />}
                      </button>
                    </th>
                    {(["uploadBatchNo"] as const).map((col) => {
                      const active = (heatColFilters[col]?.length ?? 0) > 0;
                      return (
                        <th key={col} className="px-2 py-1 text-center font-medium text-gray-600 text-[11px]">
                          <div className="flex items-center justify-center gap-0.5">
                            <span>업로드번호</span>
                            <button onClick={(e) => { setHeatOpenFilter(col); setHeatFilterAnchorEl(e.currentTarget); }} className={`rounded hover:bg-gray-200 p-0.5 ${active ? "text-blue-500" : "text-gray-400"}`}>
                              <Filter size={10} fill={active ? "currentColor" : "none"} />
                            </button>
                          </div>
                        </th>
                      );
                    })}
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
                    <th className="px-2 py-1 text-center font-medium text-gray-600 text-[11px]">사용/출고일</th>
                    <th className="px-2 py-1 text-center font-medium text-gray-600 text-[11px]">수정/삭제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {heatLoading ? (
                    <tr><td colSpan={11} className="py-8 text-center text-gray-400">불러오는 중...</td></tr>
                  ) : heatRows.length === 0 ? (
                    <tr><td colSpan={11} className="py-8 text-center text-gray-400">등록된 판번호가 없습니다</td></tr>
                  ) : (
                    heatRows.map((row) => {
                      const st = HEAT_STATUS[row.status];
                      return (
                        <tr key={row.id} className={`hover:bg-gray-50 ${selectedHeatIds.has(row.id) ? "bg-blue-50" : ""}`}>
                          <td className="px-1 py-1 text-center">
                            <button onClick={() => toggleOneHeat(row.id)}>
                              {selectedHeatIds.has(row.id) ? <CheckSquare size={13} className="text-blue-600" /> : <Square size={13} className="text-gray-400" />}
                            </button>
                          </td>
                          <td className="px-2 py-1 text-center font-mono text-[10px] text-gray-400">
                            {row.uploadBatchNo ?? <span className="text-gray-200">-</span>}
                          </td>
                          <td className="px-2 py-1 text-center font-medium">{row.vesselCode}</td>
                          <td className="px-2 py-1 text-center">{row.material}</td>
                          <td className="px-2 py-1 text-center">{fmtT(row.thickness)}</td>
                          <td className="px-2 py-1 text-center">{fmtL(row.width)}</td>
                          <td className="px-2 py-1 text-center">{fmtL(row.length)}</td>
                          <td className="px-2 py-1 text-center font-mono text-blue-700 font-medium">
                            {editingHeat?.id === row.id ? (
                              <input
                                type="text"
                                value={editHeatNo}
                                onChange={e => setEditHeatNo(e.target.value)}
                                className="border border-blue-400 rounded px-1 py-0.5 text-xs font-mono w-28 focus:outline-none"
                                autoFocus
                              />
                            ) : row.heatNo}
                          </td>
                          <td className="px-2 py-1 text-center">
                            <span className={`px-1.5 py-0 rounded-full text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                          </td>
                          <td className="px-2 py-1 text-center text-gray-500 font-mono text-[11px]">
                            {row.status === "SHIPPED" && row.shippedAt
                              ? fmtYMDcompact(row.shippedAt)
                              : row.cutAt
                                ? fmtYMDcompact(row.cutAt)
                                : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-2 py-1 text-center">
                            {editingHeat?.id === row.id ? (
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={saveHeatEdit} className="px-2 py-0.5 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700">저장</button>
                                <button onClick={() => setEditingHeat(null)} className="px-2 py-0.5 text-[11px] border border-gray-300 rounded hover:bg-gray-50">취소</button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => { setEditingHeat({ id: row.id, heatNo: row.heatNo }); setEditHeatNo(row.heatNo); }}
                                  className="px-1.5 py-0.5 text-[11px] border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
                                >수정</button>
                                <button
                                  onClick={() => deleteHeatRow(row.id, row.heatNo)}
                                  className="px-1.5 py-0.5 text-[11px] border border-red-200 rounded text-red-500 hover:bg-red-50"
                                >삭제</button>
                              </div>
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

      {/* ── 선택출고 날짜 모달 ── */}
      {issuedDateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xs p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">출고일 선택</h3>
            <p className="text-sm text-gray-500">
              {issuedDateModal.targetIds.length}건을 출고 처리합니다.<br />
              출고일을 선택하세요.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">출고일</label>
              <input
                type="date"
                value={issuedDateInput}
                onChange={(e) => setIssuedDateInput(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIssuedDateModal(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={confirmSelectedIssued}
                disabled={!issuedDateInput}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 font-medium"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 일괄 입고 모달 ── */}
      {showBulkReceive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          {/* 호선 datalist - 입력+선택 모두 가능 */}
          <datalist id="bulk-vessel-list">
            {(distinctValues.vesselCode ?? []).map((v: FilterValue) => (
              <option key={String(v.value)} value={String(v.value)} />
            ))}
          </datalist>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">

            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <PackageCheck size={20} className="text-orange-500" /> 일괄 입고 등록
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  입고된 철판 목록을 입력하고 확정하면 강재 전체목록에서 자동으로 입고 처리됩니다.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRegisterExcelOpen(true)}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  title="엑셀 파일로 강재를 일괄 등록"
                >
                  <Upload size={14} /> {uploading ? "업로드 중..." : "엑셀 강재등록"}
                </button>
                <button onClick={() => setShowBulkReceive(false)} className="p-1.5 hover:bg-gray-100 rounded-full"><X size={18} /></button>
              </div>
            </div>

            {/* 결과 표시 (확정 후) */}
            {bulkResults && (
              <div className="mx-6 mt-4 rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {["호선","재질","두께","폭","길이","수량","결과"].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {bulkResults.map((r, i) => (
                      <tr key={i} className={r.notFound ? "bg-red-50" : r.matched > 0 ? "bg-green-50" : "bg-gray-50"}>
                        <td className="px-3 py-2 font-mono font-bold">{r.vesselCode}</td>
                        <td className="px-3 py-2">{r.material}</td>
                        <td className="px-3 py-2">{fmtT(r.thickness)}t</td>
                        <td className="px-3 py-2">{fmtL(r.width)}</td>
                        <td className="px-3 py-2">{fmtL(r.length)}</td>
                        <td className="px-3 py-2">{r.qty}장</td>
                        <td className="px-3 py-2 font-semibold">
                          {r.error ? <span className="text-gray-500">{r.error}</span>
                          : r.notFound ? <span className="text-red-600">❌ 목록 없음</span>
                          : <span className="text-green-700">✅ {r.matched}장 입고 완료</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-orange-50/60">
                      <td colSpan={5} className="px-3 py-2 text-right font-semibold text-gray-600">
                        수량 합계
                      </td>
                      <td className="px-3 py-2 font-bold text-orange-700">
                        {bulkResults.reduce((s, r) => s + (r.qty || 0), 0)}장
                      </td>
                      <td className="px-3 py-2 font-semibold text-green-700">
                        ✅ {bulkResults.reduce((s, r) => s + (r.matched || 0), 0)}장 입고 완료
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* 입력 그리드 */}
            {!bulkResults && (
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {/* 보관위치 일괄 적용 */}
                <div className="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                  <span className="text-xs text-gray-500 font-medium whitespace-nowrap">보관위치 전체 적용</span>
                  <input
                    type="text"
                    value={bulkLocationAll}
                    onChange={e => setBulkLocationAll(e.target.value)}
                    placeholder="예: A동 1번 구역"
                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:border-orange-400"
                  />
                  <button
                    onClick={() => setBulkRows(prev => prev.map(r => ({ ...r, storageLocation: bulkLocationAll })))}
                    className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 whitespace-nowrap"
                  >
                    전체 적용
                  </button>
                </div>

                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col style={{ width: "2rem" }} />      {/* # */}
                    <col style={{ width: "7rem" }} />      {/* 호선 */}
                    <col style={{ width: "88px" }} />      {/* 재질 */}
                    <col style={{ width: "88px" }} />      {/* 두께 */}
                    <col style={{ width: "88px" }} />      {/* 폭 */}
                    <col style={{ width: "88px" }} />      {/* 길이 */}
                    <col style={{ width: "88px" }} />      {/* 수량 */}
                    <col style={{ width: "88px" }} />      {/* 보관위치 */}
                    <col style={{ width: "2rem" }} />      {/* 삭제 */}
                  </colgroup>
                  <thead>
                    <tr className="border-b">
                      <th className="text-left pb-2 text-xs text-gray-500 font-semibold">#</th>
                      <th className="text-left pb-2 text-xs text-gray-500 font-semibold pr-2">호선</th>
                      <th className="text-left pb-2 text-xs text-gray-500 font-semibold pr-2">재질</th>
                      <th className="text-left pb-2 text-xs text-gray-500 font-semibold pr-2">두께(t)</th>
                      <th className="text-left pb-2 text-xs text-gray-500 font-semibold pr-2">폭(mm)</th>
                      <th className="text-left pb-2 text-xs text-gray-500 font-semibold pr-2">길이(mm)</th>
                      <th className="text-left pb-2 text-xs text-gray-500 font-semibold pr-2">수량</th>
                      <th className="text-left pb-2 text-xs text-gray-500 font-semibold pr-2">보관위치</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {bulkRows.map((row, idx) => {
                      const cols: (keyof BulkRow)[] = ["vesselCode","material","thickness","width","length","qty","storageLocation"];
                      const setRow = (key: keyof BulkRow, val: string) =>
                        setBulkRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r));

                      // Enter          → 같은 행 다음 컬럼 (마지막 컬럼이면 다음 행 첫 컬럼)
                      // Shift+Enter    → 같은 컬럼 다음 행 (마지막 행이면 새 행 추가)
                      // ArrowUp/Down   → 이전/다음 행 (같은 컬럼 유지, 마지막 행에서 Down 시 새 행 추가)
                      // ArrowLeft/Right→ 같은 행 이전/다음 컬럼 (텍스트 입력은 커서가 끝/처음일 때만 이동)
                      const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, colIdx: number) => {
                        const focusCell = (r: number, c: number) => {
                          document.getElementById(`bulk-${r}-${c}`)?.focus();
                        };
                        const appendRowAndFocus = (c: number) => {
                          setBulkRows(prev => [...prev, emptyBulkRow()]);
                          setTimeout(() => focusCell(idx + 1, c), 50);
                        };

                        // ── Arrow 네비게이션 ────────────────────────────
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          if (idx > 0) focusCell(idx - 1, colIdx);
                          return;
                        }
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          if (idx === bulkRows.length - 1) appendRowAndFocus(colIdx);
                          else focusCell(idx + 1, colIdx);
                          return;
                        }
                        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                          const target = e.currentTarget;
                          const isNum = target.type === "number";
                          // 텍스트 입력은 커서가 경계(0 or end)에 있고 선택영역이 없을 때만 셀 이동
                          const pos = target.selectionStart;
                          const end = target.selectionEnd;
                          const atStart = isNum ? true : (pos === 0 && end === 0);
                          const atEnd   = isNum ? true : (pos === target.value.length && end === target.value.length);

                          if (e.key === "ArrowLeft" && atStart) {
                            e.preventDefault();
                            if (colIdx > 0) focusCell(idx, colIdx - 1);
                            else if (idx > 0) focusCell(idx - 1, cols.length - 1);
                            return;
                          }
                          if (e.key === "ArrowRight" && atEnd) {
                            e.preventDefault();
                            if (colIdx < cols.length - 1) focusCell(idx, colIdx + 1);
                            else if (idx === bulkRows.length - 1) appendRowAndFocus(0);
                            else focusCell(idx + 1, 0);
                            return;
                          }
                          return;
                        }

                        // ── Enter / Shift+Enter ─────────────────────────
                        if (e.key !== "Enter") return;
                        e.preventDefault();

                        if (e.shiftKey) {
                          if (idx === bulkRows.length - 1) appendRowAndFocus(colIdx);
                          else focusCell(idx + 1, colIdx);
                          return;
                        }

                        if (colIdx < cols.length - 1) focusCell(idx, colIdx + 1);
                        else if (idx === bulkRows.length - 1) appendRowAndFocus(0);
                        else focusCell(idx + 1, 0);
                      };

                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="py-1.5 pr-2 text-xs text-gray-400 text-center">{idx + 1}</td>
                          {cols.map((col, colIdx) => (
                            <td key={col} className="py-1.5 pr-2">
                              <input
                                id={`bulk-${idx}-${colIdx}`}
                                list={col === "vesselCode" ? "bulk-vessel-list" : undefined}
                                type={["thickness","width","length","qty"].includes(col) ? "number" : "text"}
                                value={row[col]}
                                onChange={e => {
                                  // 재질: 한글/소문자 IME 입력도 즉시 영어 대문자+숫자로 필터링
                                  const v = col === "material"
                                    ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                                    : e.target.value;
                                  setRow(col, v);
                                }}
                                onKeyDown={e => handleKeyDown(e, colIdx)}
                                onFocus={e => {
                                  // 이전 행 자동복사 (호선·재질은 보통 같은 값)
                                  if (!row[col] && idx > 0 && (col === "vesselCode" || col === "material")) {
                                    setRow(col, bulkRows[idx - 1][col]);
                                    setTimeout(() => (e.target as HTMLInputElement).select(), 0);
                                  }
                                }}
                                placeholder={
                                  col === "vesselCode" ? "RS01" :
                                  col === "material"   ? "AH36" :
                                  col === "qty"        ? "1"    :
                                  col === "storageLocation" ? "예: A동 1번" : ""
                                }
                                style={col === "material" ? { textTransform: "uppercase", imeMode: "disabled" } as React.CSSProperties : undefined}
                                autoCapitalize={col === "material" ? "characters" : undefined}
                                lang={col === "material" ? "en" : undefined}
                                className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300"
                              />
                            </td>
                          ))}
                          <td className="py-1.5">
                            {bulkRows.length > 1 && (
                              <button
                                onClick={() => setBulkRows(prev => prev.filter((_, i) => i !== idx))}
                                className="p-1 text-gray-300 hover:text-red-400 rounded"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-orange-50/60">
                      <td colSpan={6} className="py-2 pr-2 text-right text-xs font-semibold text-gray-600">
                        수량 합계
                      </td>
                      <td className="py-2 pr-2 text-sm font-bold text-orange-700">
                        {bulkRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0)}장
                      </td>
                      <td colSpan={2} className="py-2 text-xs text-gray-400">
                        ({bulkRows.length}행)
                      </td>
                    </tr>
                  </tfoot>
                </table>

                <button
                  onClick={() => setBulkRows(prev => [...prev, emptyBulkRow()])}
                  className="mt-3 flex items-center gap-1.5 text-sm text-orange-500 hover:text-orange-700"
                >
                  <Plus size={14} /> 행 추가
                </button>
              </div>
            )}

            {/* 하단 버튼 */}
            <div className="px-6 py-4 border-t flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-shrink-0">
                {!bulkResults && (
                  <>
                    <span className="text-xs text-gray-500 font-medium whitespace-nowrap">입고일</span>
                    <input
                      type="date"
                      value={bulkReceiveDate}
                      onChange={e => setBulkReceiveDate(e.target.value)}
                      className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-orange-400"
                    />
                  </>
                )}
                {!bulkResults && (
                  <p className="text-xs text-gray-400 hidden sm:block">← → ↑ ↓ 셀 이동 · Enter: 다음 칸 · Shift+Enter: 다음 행</p>
                )}
              </div>
              <div className="flex gap-2">
                {bulkResults ? (
                  <>
                    <button
                      onClick={() => { setBulkRows([emptyBulkRow()]); setBulkResults(null); }}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      다시 입력
                    </button>
                    <button
                      onClick={() => setShowBulkReceive(false)}
                      className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600"
                    >
                      닫기
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setShowBulkReceive(false)}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      취소
                    </button>
                    <button
                      onClick={submitBulkReceive}
                      disabled={bulkSubmitting}
                      className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 font-semibold"
                    >
                      {bulkSubmitting ? "처리 중..." : "입고 확정"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 강재 삭제 모달 (호선 전체 / 업로드 배치) ── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Trash2 size={16} className="text-red-500" /> 강재 삭제
              </h3>
              <button onClick={() => setShowDeleteModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            {/* 탭 */}
            <div className="flex border-b">
              <button
                onClick={() => setDeleteTab("vessel")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${deleteTab === "vessel" ? "border-red-500 text-red-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
              >
                호선 전체 삭제
              </button>
              <button
                onClick={() => setDeleteTab("batch")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${deleteTab === "batch" ? "border-red-500 text-red-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
              >
                업로드 배치 삭제
              </button>
            </div>

            {deleteTab === "vessel" ? (
              <>
                <p className="text-sm text-gray-500">
                  선택 호선의 <span className="text-red-600 font-medium">강재 전체목록 + 판번호 리스트 전체</span>가 삭제됩니다.
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
                  <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
                  <button
                    onClick={handleVesselDelete}
                    disabled={!deleteVessel || deleting}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 font-medium"
                  >
                    {deleting ? "삭제 중..." : "삭제"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500">
                  업로드 배치번호를 입력하면 <span className="text-red-600 font-medium">해당 배치만</span> 삭제됩니다.<br />
                  <span className="text-gray-400 text-xs">예) 20260615-01 (테이블의 업로드번호 컬럼 참고)</span>
                </p>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">업로드 배치번호</label>
                  <input
                    type="text"
                    value={deleteBatchNo}
                    onChange={(e) => setDeleteBatchNo(e.target.value)}
                    placeholder="예: 20260615-01"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
                  <button
                    onClick={handleBatchDelete}
                    disabled={!deleteBatchNo || deleting}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 font-medium"
                  >
                    {deleting ? "삭제 중..." : "배치 삭제"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 선택 삭제 확인 모달 */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !deleteSubmitting && setDeleteModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Trash2 size={16} className="text-red-500" />
                선택 항목 삭제
              </h3>
              <button onClick={() => setDeleteModal(null)} disabled={deleteSubmitting} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-700">
                {deleteModal.scope === "plan" ? "강재 전체목록" : "판번호 리스트"}에서 선택한
                <span className="font-bold text-red-600 mx-1">{deleteModal.ids.length}건</span>을 삭제합니다.
              </p>
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2.5">
                ⚠️ 삭제된 데이터는 복구할 수 없습니다. 계속하려면 아래에 <strong>삭제</strong>라고 입력하세요.
              </p>
              <input
                autoFocus
                type="text"
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && deleteConfirmInput.trim() === "삭제" && !deleteSubmitting) submitDelete(); }}
                placeholder='"삭제" 입력'
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-400"
              />
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => setDeleteModal(null)}
                disabled={deleteSubmitting}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                취소
              </button>
              <button
                onClick={submitDelete}
                disabled={deleteConfirmInput.trim() !== "삭제" || deleteSubmitting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 size={13} /> {deleteSubmitting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 외부 납품처 출고 — 하단 고정 카트바 + 모달들 */}
      <ShipoutBar />

      {/* 카트가 비어있을 때도 직접 진입 가능한 엑셀 일괄 업로드 */}
      {shipoutExcelOpen && (
        <ShipoutExcelUploadModal onClose={() => setShipoutExcelOpen(false)} cart={shipoutCart} />
      )}

      {/* 강재등록 엑셀 업로드 모달 */}
      {registerExcelOpen && (
        <RegisterExcelUploadModal
          onClose={() => setRegisterExcelOpen(false)}
          uploading={uploading}
          onSelect={(file) => { setRegisterExcelOpen(false); processUploadFile(file); }}
        />
      )}

      {/* 선별지시서 출력 (매칭) 모달 */}
      {matchOpen && (
        <MatchingExcelModal onClose={() => setMatchOpen(false)} />
      )}

      {/* 출고등록 모달 — 판번호 확인 + 선별지시서 출력 + 출고 확정 */}
      {showShipoutRegister && (
        <ShipoutRegisterModal
          onClose={() => setShowShipoutRegister(false)}
          onDone={() => { setShowShipoutRegister(false); loadPlan(); }}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/* 강재등록 엑셀 업로드 모달                                                    */
/* ──────────────────────────────────────────────────────────────────────────── */
function RegisterExcelUploadModal({
  onClose, uploading, onSelect,
}: {
  onClose: () => void;
  uploading: boolean;
  onSelect: (file: File) => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
            <Upload size={16} className="text-blue-600" /> 엑셀로 강재 일괄 등록
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-sm text-gray-700">
            양식: <strong>호선 · 재질 · 두께 · 폭 · 길이 · 판번호</strong> 컬럼이 헤더 1행에 있는 엑셀.
            중량은 사양으로 자동 계산.
          </div>
          <label className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer ${uploading ? "border-gray-300 bg-gray-50" : "border-blue-300 hover:bg-blue-50/50"}`}>
            <Upload size={24} className="mx-auto mb-2 text-blue-500" />
            <div className="text-sm font-semibold text-gray-700">
              {uploading ? "처리 중…" : "엑셀 파일 선택 또는 드래그"}
            </div>
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onSelect(f); }} />
          </label>
          <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
            <div className="text-xs text-gray-500">양식이 필요하신가요?</div>
            <button
              onClick={downloadRegisterTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50"
            >
              <Download size={13} /> 강재등록_양식.xlsx
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/* 선별지시서 출력 (매칭) — 엑셀 사양과 입고 강재 매칭 + 비고 일괄/개별 + 출력  */
/* ──────────────────────────────────────────────────────────────────────────── */
function MatchingExcelModal({ onClose }: { onClose: () => void }) {
  const [step, setStep]             = useState<"upload" | "review">("upload");
  const [loading, setLoading]       = useState(false);
  const [candidates, setCandidates] = useState<SteelPlanRow[]>([]);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [memos, setMemos]           = useState<Record<string, string>>({});
  const [blocks, setBlocks]         = useState<Record<string, string>>({});
  const [bulkMemo, setBulkMemo]     = useState("");
  const [bulkBlock, setBulkBlock]   = useState("");
  const [summary, setSummary]       = useState("");

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
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

      type Spec = { vesselCode: string; material: string; thickness: number; width: number; length: number };
      const specs: Spec[] = [];
      for (let i = headerRow + 1; i < raw.length; i++) {
        const r = raw[i] as (string | number)[];
        const vesselCode = iVessel >= 0 ? String(r[iVessel] ?? "").trim() : "";
        const material   = iMaterial >= 0 ? String(r[iMaterial] ?? "").trim() : "";
        const thickness  = iThickness >= 0 ? Number(r[iThickness]) : 0;
        const width      = iWidth  >= 0 ? Number(r[iWidth])  : 0;
        const length     = iLength >= 0 ? Number(r[iLength]) : 0;
        if (!vesselCode || !material || !thickness || !width || !length) continue;
        specs.push({ vesselCode, material, thickness: fmtT(thickness), width: fmtL(width), length: fmtL(length) });
      }

      if (specs.length === 0) {
        alert("엑셀에서 유효한 사양 행을 찾지 못했습니다.\n헤더(호선/재질/두께/폭/길이)가 1행에 있어야 합니다.");
        setLoading(false);
        return;
      }

      // 강재 전체 fetch 후 '입고(RECEIVED)' 상태 자재만 매칭 대상으로 사용
      const res  = await fetch("/api/steel-plan?all=true&statuses=RECEIVED");
      const json = await res.json();
      const allRows: SteelPlanRow[] = (json.data ?? []).filter((r: SteelPlanRow) => r.status === "RECEIVED");

      // spec 별로 매칭 (한 강재가 여러 spec 에 매칭돼도 1번만) — 입고 상태만
      const matchedMap = new Map<string, SteelPlanRow>();
      for (const sp of specs) {
        for (const r of allRows) {
          if (
            r.status === "RECEIVED" &&
            r.vesselCode === sp.vesselCode &&
            r.material   === sp.material &&
            fmtT(r.thickness) === sp.thickness &&
            fmtL(r.width)     === sp.width &&
            fmtL(r.length)    === sp.length
          ) {
            matchedMap.set(r.id, r);
          }
        }
      }
      const matched = Array.from(matchedMap.values());

      const memoInit:  Record<string, string> = {};
      const blockInit: Record<string, string> = {};
      for (const r of matched) {
        memoInit[r.id]  = r.memo ?? "";
        blockInit[r.id] = r.reservedFor ?? "";
      }

      setSummary(`엑셀 사양 ${specs.length}건 → 매칭 자재 ${matched.length}장`);
      setCandidates(matched);
      setMemos(memoInit);
      setBlocks(blockInit);
      setSelected(new Set(matched.map((m) => m.id))); // 기본 전체 선택
      setStep("review");
    } catch (err) {
      alert(err instanceof Error ? err.message : "파일 처리 실패");
    } finally {
      setLoading(false);
    }
  };

  const toggleSel  = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectAll  = () => setSelected(new Set(candidates.map((c) => c.id)));
  const selectNone = () => setSelected(new Set());

  const applyBulkMemo = () => {
    if (!bulkMemo.trim()) return;
    setMemos((prev) => {
      const next = { ...prev };
      for (const id of selected) next[id] = bulkMemo;
      return next;
    });
  };

  const applyBulkBlock = () => {
    if (!bulkBlock.trim()) return;
    setBlocks((prev) => {
      const next = { ...prev };
      for (const id of selected) next[id] = bulkBlock;
      return next;
    });
  };

  const handlePrintMatched = () => {
    const sel = candidates.filter((c) => selected.has(c.id));
    if (sel.length === 0) { alert("선택된 자재가 없습니다."); return; }

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const rows_html = sel.map((r, i) => `
      <tr class="${i % 2 === 0 ? "even" : ""}">
        <td>${esc(r.vesselCode)}</td>
        <td>${esc(blocks[r.id] ?? "")}</td>
        <td>${esc(r.material)}</td>
        <td class="num">${fmtT(r.thickness)}</td>
        <td class="num">${fmtL(r.width)}</td>
        <td class="num">${fmtL(r.length)}</td>
        <td>${esc(r.storageLocation ?? "")}</td>
        <td>${PLAN_STATUS[r.status]?.label ?? r.status}</td>
        <td>${fmtYMDcompact(r.receivedAt)}</td>
        <td class="memo">${esc(memos[r.id] ?? "")}</td>
      </tr>`).join("");

    const totalWt = sel.reduce((s, r) => s + r.thickness * r.width * r.length * 7.85 / 1_000_000, 0).toFixed(1);

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<title>선별지시서 (매칭)</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Malgun Gothic", sans-serif; font-size: 16pt; color: #111; padding: 4mm; }
  h1 { font-size: 20pt; font-weight: bold; text-align: center; margin-bottom: 2mm; letter-spacing: 1px; }
  .meta { text-align: center; font-size: 10pt; color: #555; margin-bottom: 2mm; }
  /* auto layout — 모든 컬럼이 내용 길이에 따라 자동으로 폭 결정 */
  table { width: 100%; border-collapse: collapse; table-layout: auto; }
  th { background: #1e3a5f; color: #fff; padding: 1px 2px; font-size: 13pt; text-align: center; border: 1px solid #888; line-height: 1.1; white-space: nowrap; }
  td { padding: 1px 2px; border: 1px solid #aaa; text-align: center; vertical-align: middle; font-size: 16pt; line-height: 1.1; white-space: nowrap; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.memo { text-align: left; font-size: 13pt; color: #222; white-space: normal; }
  tr.even { background: #f5f8fc; }
  .summary { margin-top: 2mm; font-size: 10pt; color: #555; text-align: right; }
  @media print {
    body { padding: 3mm; }
    @page { margin: 6mm; size: A4 landscape; }
  }
</style>
</head>
<body>
<h1>선 별 지 시 서</h1>
<p class="meta">출력일시: ${new Date().toLocaleString("ko-KR")} | 총 ${sel.length}장 · 총중량 ${totalWt}kg | ${summary}</p>
<table>
  <thead>
    <tr>
      <th>호선</th><th>블록</th><th>재질</th><th>두께</th><th>폭</th><th>길이</th>
      <th>위치</th><th>상태</th><th>입고일</th><th>비고</th>
    </tr>
  </thead>
  <tbody>${rows_html}</tbody>
</table>
<p class="summary">총 ${sel.length}건</p>
<script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  /* 선별지시서(매칭) 엑셀 다운로드 — 출력과 동일한 데이터·컬럼 */
  const handleExportMatchedExcel = () => {
    const sel = candidates.filter((c) => selected.has(c.id));
    if (sel.length === 0) { alert("선택된 자재가 없습니다."); return; }

    const rows_ws = sel.map((r) => ({
      "호선":   r.vesselCode,
      "블록":   blocks[r.id] ?? "",
      "재질":   r.material,
      "두께":   fmtT(r.thickness),
      "폭":     fmtL(r.width),
      "길이":   fmtL(r.length),
      "위치":   r.storageLocation ?? "",
      "상태":   PLAN_STATUS[r.status]?.label ?? r.status,
      "입고일": fmtYMDcompact(r.receivedAt),
      "비고":   memos[r.id] ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows_ws);
    ws["!cols"] = autoColWidths(rows_ws);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "선별지시서");
    const today = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, `선별지시서_매칭_${today}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${step === "upload" ? "max-w-md" : "max-w-6xl"} max-h-[90vh] overflow-hidden flex flex-col`}>
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
            <Printer size={16} className="text-gray-800" /> 선별지시서 출력 (엑셀 매칭)
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} /></button>
        </div>

        {step === "upload" && (
          <div className="p-5 space-y-4">
            <div className="text-sm text-gray-700 leading-relaxed">
              엑셀 양식: <strong>호선 · 재질 · 두께 · 폭 · 길이</strong> 컬럼이 1행에 있는 파일.<br/>
              업로드하면 강재전체목록의 <strong>입고 상태</strong> 자재 중 사양이 일치하는 강재를 매칭합니다.
            </div>
            <label className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer ${loading ? "border-gray-300 bg-gray-50" : "border-gray-400 hover:bg-gray-50"}`}>
              <Upload size={24} className="mx-auto mb-2 text-gray-500" />
              <div className="text-sm font-semibold text-gray-700">
                {loading ? "매칭 중…" : "엑셀 파일 선택 또는 드래그"}
              </div>
              <input type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
          </div>
        )}

        {step === "review" && (
          <>
            <div className="px-5 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-3 flex-shrink-0">
              <div className="text-sm text-gray-700"><strong>{summary}</strong> · 선택 <strong className="text-blue-700">{selected.size}</strong>장</div>
              <div className="flex items-center gap-2">
                <button onClick={selectAll}  className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-white">전체 선택</button>
                <button onClick={selectNone} className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-white">선택 해제</button>
              </div>
            </div>

            <div className="px-5 py-2 border-b border-gray-200 bg-amber-50 flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-medium text-amber-700 whitespace-nowrap w-20">블록 일괄</span>
              <input value={bulkBlock} onChange={(e) => setBulkBlock(e.target.value)}
                placeholder="예: F52P — 선택된 자재 블록 컬럼에 한 번에 입력"
                className="flex-1 h-8 px-2 text-sm border border-gray-300 rounded" />
              <button onClick={applyBulkBlock}
                disabled={selected.size === 0 || !bulkBlock.trim()}
                className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-40 w-32">
                선택 {selected.size}장에 적용
              </button>
            </div>
            <div className="px-5 py-2 border-b border-gray-200 bg-amber-50 flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-medium text-amber-700 whitespace-nowrap w-20">비고 일괄</span>
              <input value={bulkMemo} onChange={(e) => setBulkMemo(e.target.value)}
                placeholder="이 칸에 입력하고 [적용] 클릭 — 선택된 자재 비고에 한 번에 입력"
                className="flex-1 h-8 px-2 text-sm border border-gray-300 rounded" />
              <button onClick={applyBulkMemo}
                disabled={selected.size === 0 || !bulkMemo.trim()}
                className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-40 w-32">
                선택 {selected.size}장에 적용
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 w-8">
                      <input type="checkbox"
                        checked={selected.size === candidates.length && candidates.length > 0}
                        onChange={(e) => e.target.checked ? selectAll() : selectNone()} />
                    </th>
                    <th className="px-2 py-2 text-left">호선</th>
                    <th className="px-2 py-2 text-left">블록</th>
                    <th className="px-2 py-2 text-left">재질</th>
                    <th className="px-2 py-2 text-right">두께</th>
                    <th className="px-2 py-2 text-right">폭</th>
                    <th className="px-2 py-2 text-right">길이</th>
                    <th className="px-2 py-2 text-left">위치</th>
                    <th className="px-2 py-2 text-center">상태</th>
                    <th className="px-2 py-2 text-left">입고일</th>
                    <th className="px-2 py-2 text-left">비고</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {candidates.length === 0 ? (
                    <tr><td colSpan={11} className="py-12 text-center text-gray-400">매칭된 자재가 없습니다.</td></tr>
                  ) : candidates.map((r) => (
                    <tr key={r.id} className={`hover:bg-gray-50/60 ${selected.has(r.id) ? "bg-blue-50/40" : ""}`}>
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} />
                      </td>
                      <td className="px-2 py-1">{r.vesselCode}</td>
                      <td className="px-2 py-1">
                        <input value={blocks[r.id] ?? ""} onChange={(e) => setBlocks((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          className="w-full px-1.5 py-0.5 text-xs border border-gray-200 rounded focus:border-gray-500 focus:outline-none" />
                      </td>
                      <td className="px-2 py-1">{r.material}</td>
                      <td className="px-2 py-1 text-right font-mono">{fmtT(r.thickness)}</td>
                      <td className="px-2 py-1 text-right font-mono">{fmtL(r.width)}</td>
                      <td className="px-2 py-1 text-right font-mono">{fmtL(r.length)}</td>
                      <td className="px-2 py-1">{r.storageLocation ?? ""}</td>
                      <td className="px-2 py-1 text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${PLAN_STATUS[r.status]?.cls ?? "bg-gray-100"}`}>
                          {PLAN_STATUS[r.status]?.label ?? r.status}
                        </span>
                      </td>
                      <td className="px-2 py-1 font-mono text-[11px]">{fmtYMDcompact(r.receivedAt)}</td>
                      <td className="px-2 py-1">
                        <input value={memos[r.id] ?? ""} onChange={(e) => setMemos((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          className="w-full px-1.5 py-0.5 text-xs border border-gray-200 rounded focus:border-gray-500 focus:outline-none" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between gap-2 flex-shrink-0">
              <button onClick={() => setStep("upload")} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
                ← 다시 업로드
              </button>
              <div className="flex items-center gap-2">
                <button onClick={handleExportMatchedExcel}
                  disabled={selected.size === 0}
                  className="inline-flex items-center gap-1 px-4 py-1.5 text-sm bg-emerald-700 text-white rounded hover:bg-emerald-800 disabled:opacity-40">
                  <Download size={13} /> 엑셀 다운로드 ({selected.size}장)
                </button>
                <button onClick={handlePrintMatched}
                  disabled={selected.size === 0}
                  className="inline-flex items-center gap-1 px-4 py-1.5 text-sm bg-gray-800 text-white rounded hover:bg-gray-900 disabled:opacity-40">
                  <Printer size={13} /> 선별지시서 출력 ({selected.size}장)
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────── */
/* 출고등록 — 판번호 입력 → 입고 강재 매칭 → 선별지시서 출력 + 출고 확정 마킹        */
/* ──────────────────────────────────────────────────────────────────────────── */
interface ShipoutPick {
  planId: string;
  heatNo: string;
  vesselCode: string;
  material: string;
  thickness: number;
  width: number;
  length: number;
  storageLocation: string | null;
}

function ShipoutRegisterModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [input, setInput]       = useState("");
  const [picked, setPicked]     = useState<ShipoutPick[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy]         = useState(false);
  const [msg, setMsg]           = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addHeat = async () => {
    const heatNo = input.trim();
    if (!heatNo || busy) return;
    if (picked.some((p) => p.heatNo.toLowerCase() === heatNo.toLowerCase())) {
      setMsg({ type: "err", text: `이미 추가된 판번호: ${heatNo}` });
      setInput("");
      return;
    }
    setBusy(true);
    try {
      const exclude = picked.map((p) => p.planId).join(",");
      const r = await fetch(`/api/steel-plan/shipout-match?heatNo=${encodeURIComponent(heatNo)}&exclude=${encodeURIComponent(exclude)}`);
      const d = await r.json();
      if (!d.success) { setMsg({ type: "err", text: d.error ?? "조회 실패" }); return; }
      if (!d.matched) {
        const reasonMap: Record<string, string> = {
          NOT_FOUND:     "등록되지 않은 판번호",
          ALREADY_USED:  "이미 절단·사용된 판번호 (남은 원판 없음)",
          ALREADY_MARKED:"이미 출고 확정된 판번호",
          NOT_RECEIVED:  "매칭되는 입고 강재 없음 (미입고 또는 소진)",
        };
        setMsg({ type: "err", text: `${heatNo} — ${reasonMap[d.reason] ?? "매칭 실패"}` });
        return;
      }
      const p = d.plan;
      setPicked((prev) => [...prev, {
        planId: p.id, heatNo, vesselCode: p.vesselCode, material: p.material,
        thickness: p.thickness, width: p.width, length: p.length, storageLocation: p.storageLocation,
      }]);
      setSelected((prev) => new Set(prev).add(p.id));
      setMsg({ type: "ok", text: `추가됨: ${heatNo} → ${p.vesselCode} ${p.material} ${fmtT(p.thickness)}×${fmtL(p.width)}×${fmtL(p.length)}` });
      setInput("");
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "네트워크 오류" });
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const removeRow = (planId: string) => {
    setPicked((prev) => prev.filter((p) => p.planId !== planId));
    setSelected((prev) => { const n = new Set(prev); n.delete(planId); return n; });
  };
  const toggle = (planId: string) => setSelected((prev) => {
    const n = new Set(prev); if (n.has(planId)) n.delete(planId); else n.add(planId); return n;
  });
  const allChecked = picked.length > 0 && picked.every((p) => selected.has(p.planId));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(picked.map((p) => p.planId)));

  const selRows = picked.filter((p) => selected.has(p.planId));

  const writeSelectionSheet = (win: Window, rows: ShipoutPick[]) => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const wt  = (t: number, w: number, l: number) => (Math.round(t * w * l * 7.85 / 1_000_000 * 10) / 10).toFixed(1);
    const body = rows.map((r, i) => `
      <tr class="${i % 2 === 0 ? "even" : ""}">
        <td>${esc(r.vesselCode)}</td>
        <td>${esc(r.heatNo)}</td>
        <td>${esc(r.material)}</td>
        <td class="num">${fmtT(r.thickness)}</td>
        <td class="num">${fmtL(r.width)}</td>
        <td class="num">${fmtL(r.length)}</td>
        <td class="num">${wt(r.thickness, r.width, r.length)}</td>
        <td>${esc(r.storageLocation ?? "-")}</td>
      </tr>`).join("");
    const totalWt = rows.reduce((s, r) => s + r.thickness * r.width * r.length * 7.85 / 1_000_000, 0).toFixed(1);
    const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"/><title>선별지시서 (출고)</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Malgun Gothic", sans-serif; font-size: 16pt; color: #111; padding: 4mm; }
  h1 { font-size: 20pt; font-weight: bold; text-align: center; margin-bottom: 2mm; letter-spacing: 1px; }
  .meta { text-align: center; font-size: 10pt; color: #555; margin-bottom: 2mm; }
  table { width: 100%; border-collapse: collapse; table-layout: auto; }
  th { background: #1e3a5f; color: #fff; padding: 1px 2px; font-size: 13pt; text-align: center; border: 1px solid #888; line-height: 1.1; white-space: nowrap; }
  td { padding: 1px 2px; border: 1px solid #aaa; text-align: center; vertical-align: middle; font-size: 16pt; line-height: 1.1; white-space: nowrap; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.even { background: #f5f8fc; }
  @media print { body { padding: 3mm; } @page { margin: 6mm; size: A4 landscape; } }
</style></head>
<body>
<h1>선 별 지 시 서</h1>
<p class="meta">출력일시: ${new Date().toLocaleString("ko-KR")} | 총수량: ${rows.length}장 | 총중량: ${totalWt}kg</p>
<table>
  <thead><tr>
    <th>호선</th><th>판번호</th><th>재질</th><th>두께</th><th>폭</th><th>길이</th><th>중량(kg)</th><th>위치</th>
  </tr></thead>
  <tbody>${body}</tbody>
</table>
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`;
    win.document.write(html); win.document.close();
  };

  const printAndMark = async () => {
    if (selRows.length === 0) { alert("선택된 자재가 없습니다."); return; }
    // 인쇄창은 클릭 제스처 안에서 빈 창으로 먼저 열고(팝업 차단 회피),
    // 확정(mark)이 성공한 뒤에 내용을 채워 인쇄 — 인쇄됨/확정실패 불일치 방지
    const win = window.open("", "_blank", "width=1100,height=750");
    setBusy(true);
    try {
      const r = await fetch("/api/steel-plan/shipout-mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark", items: selRows.map((p) => ({ id: p.planId, heatNo: p.heatNo })) }),
      });
      const d = await r.json();
      if (!d.success) { win?.close(); alert(d.error ?? "출고 확정 처리 실패"); return; }
      if (win) writeSelectionSheet(win, selRows);
      if (typeof d.count === "number" && typeof d.requested === "number" && d.count < d.requested) {
        alert(`요청 ${d.requested}장 중 ${d.count}건만 출고 확정되었습니다.\n(나머지는 이미 처리/선점되어 제외 — 인쇄 내용과 다를 수 있습니다.)`);
      } else {
        alert(`${d.count}건 출고 확정 처리되었습니다.\n강재전체목록 확정정보에 빨간 '출고'로 표시됩니다.`);
      }
      onDone();
    } catch (e) {
      win?.close();
      alert(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
            <Truck size={18} className="text-purple-600" /> 출고등록 — 판번호 확인
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-3 flex-1 overflow-y-auto">
          <div className="text-sm text-gray-600">
            현장에서 적어온 <strong>판번호</strong>를 한 장씩 입력하고 <kbd className="px-1 bg-gray-100 border rounded text-xs">Enter</kbd>. 입고된 강재와 자동 매칭됩니다.
            <span className="block text-xs text-gray-400 mt-0.5">출력 시 선택 강재가 <strong className="text-red-500">출고 확정</strong>되어 강재전체목록 확정정보에 빨간 &apos;출고&apos;로 표시됩니다. (배지 클릭으로 되돌리기 가능 · 사양 단위 매칭이며 판번호는 추적 기록용)</span>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Hash size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addHeat(); } }}
                placeholder="판번호 입력 후 Enter (예: HT240001)"
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
            <button onClick={addHeat} disabled={busy || !input.trim()}
              className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40">
              추가
            </button>
          </div>
          {msg && (
            <div className={`text-xs px-3 py-1.5 rounded ${msg.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
              {msg.text}
            </div>
          )}

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-8 px-2 py-2 text-center">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} disabled={picked.length === 0} className="accent-purple-600" />
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600">판번호</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600">호선</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600">재질</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-600">두께</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-600">폭</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-600">길이</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-600">보관위치</th>
                  <th className="w-8 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {picked.length === 0 ? (
                  <tr><td colSpan={9} className="py-8 text-center text-gray-400">판번호를 입력하면 매칭된 자재가 표시됩니다.</td></tr>
                ) : picked.map((p) => (
                  <tr key={p.planId} className={`hover:bg-gray-50 ${selected.has(p.planId) ? "bg-purple-50/40" : ""}`}>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={selected.has(p.planId)} onChange={() => toggle(p.planId)} className="accent-purple-600" />
                    </td>
                    <td className="px-2 py-1.5 font-mono font-semibold">{p.heatNo}</td>
                    <td className="px-2 py-1.5 font-medium">{p.vesselCode}</td>
                    <td className="px-2 py-1.5">{p.material}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmtT(p.thickness)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmtL(p.width)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmtL(p.length)}</td>
                    <td className="px-2 py-1.5">{p.storageLocation ?? "-"}</td>
                    <td className="px-2 py-1.5 text-center">
                      <button onClick={() => removeRow(p.planId)} className="text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="text-sm text-gray-500">매칭 {picked.length}장 · 선택 {selRows.length}장</div>
          <button onClick={printAndMark} disabled={busy || selRows.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-gray-800 text-white rounded hover:bg-gray-900 disabled:opacity-40">
            <Printer size={14} /> 선별지시서 출력 + 출고확정 ({selRows.length}장)
          </button>
        </div>
      </div>
    </div>
  );
}
