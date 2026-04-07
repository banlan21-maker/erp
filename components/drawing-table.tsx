"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { DrawingList } from "@prisma/client";
import { Pencil, Trash2, Check, X, ListFilter, XCircle, Plus, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface EditForm {
  block: string; drawingNo: string; material: string;
  thickness: string; width: string; length: string; useWeight: string;
}

const emptyAddForm: EditForm = {
  block: "", drawingNo: "", material: "",
  thickness: "", width: "", length: "", useWeight: "",
};

type DrawingStatusType = "REGISTERED" | "WAITING" | "CUT" | "CAUTION";

const STATUS_LABEL: Record<DrawingStatusType, string> = {
  REGISTERED: "미입고", WAITING: "입고", CUT: "절단", CAUTION: "경고",
};
const STATUS_STYLE: Record<DrawingStatusType, string> = {
  REGISTERED: "bg-orange-100 text-orange-700",
  WAITING:    "bg-green-100 text-green-700",
  CUT:        "bg-blue-100  text-blue-700",
  CAUTION:    "bg-red-100   text-red-700",
};

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function toEditForm(d: DrawingList): EditForm {
  return {
    block: d.block ?? "", drawingNo: d.drawingNo ?? "",
    material: d.material, thickness: String(d.thickness), width: String(d.width),
    length: String(d.length),
    useWeight: d.useWeight != null ? String(d.useWeight) : "",
  };
}

function calcSteelWeight(t: number | string, w: number | string, l: number | string): number {
  return Math.round(Number(t) * Number(w) * Number(l) * 7.85 / 1_000_000 * 100) / 100;
}

function StatusBadge({ status }: { status: string }) {
  const s = status as DrawingStatusType;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${STATUS_STYLE[s] ?? "bg-gray-100 text-gray-500"}`}>
      {STATUS_LABEL[s] ?? status}
    </span>
  );
}

function formatDate(val: Date | string | null | undefined): string {
  if (!val) return "-";
  return new Date(val).toISOString().split("T")[0];
}

// 각 컬럼의 셀 값을 문자열로 반환 (필터 비교용)
function colValue(d: DrawingList, col: string): string {
  switch (col) {
    case "status":      return STATUS_LABEL[(d.status ?? "REGISTERED") as DrawingStatusType] ?? d.status ?? "";
    case "block":       return d.block ?? "(없음)";
    case "drawingNo":   return d.drawingNo ?? "(없음)";
    case "heatNo":      return d.heatNo ?? "(없음)";
    case "material":    return d.material;
    case "thickness":   return String(d.thickness);
    case "width":       return String(d.width);
    case "length":      return String(d.length);
    case "steelWeight": return String(calcSteelWeight(d.thickness, d.width, d.length));
    case "useWeight":   return d.useWeight != null ? String(d.useWeight) : "(없음)";
    default:            return "";
  }
}

// ─── 필터 드롭다운 컴포넌트 ──────────────────────────────────────────────────

interface FilterDropdownProps {
  col: string;
  allValues: string[];
  selected: string[];
  onChange: (col: string, values: string[]) => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

function FilterDropdown({ col, allValues, selected, onChange, onClose, anchorRect }: FilterDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");

  // 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const filtered = allValues.filter(v => v.toLowerCase().includes(search.toLowerCase()));
  const allChecked = selected.length === 0 || selected.length === allValues.length;

  const toggle = (v: string) => {
    if (selected.includes(v)) {
      const next = selected.filter(x => x !== v);
      onChange(col, next.length === allValues.length ? [] : next);
    } else {
      const next = [...selected, v];
      onChange(col, next.length === allValues.length ? [] : next);
    }
  };

  const toggleAll = () => {
    onChange(col, allChecked ? [] : []);
  };

  // 화면 오른쪽 잘림 방지
  const left = Math.min(anchorRect.left, window.innerWidth - 220);
  const top  = anchorRect.bottom + 4;

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top, left, zIndex: 9999, minWidth: 200 }}
      className="bg-white border border-gray-200 rounded-lg shadow-xl text-xs"
    >
      {/* 검색 */}
      <div className="p-2 border-b">
        <Input
          autoFocus
          placeholder="검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-7 text-xs"
        />
      </div>
      {/* 전체 선택 */}
      <div className="px-2 py-1.5 border-b">
        <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className="rounded"
          />
          <span className="font-semibold text-gray-600">전체 선택</span>
        </label>
      </div>
      {/* 항목 목록 */}
      <div className="max-h-52 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-gray-400">검색 결과 없음</div>
        ) : (
          filtered.map(v => (
            <label key={v} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-3 py-1">
              <input
                type="checkbox"
                checked={selected.length === 0 || selected.includes(v)}
                onChange={() => toggle(v)}
                className="rounded"
              />
              <span className="text-gray-700 truncate max-w-[160px]">{v}</span>
            </label>
          ))
        )}
      </div>
      {/* 초기화 */}
      {selected.length > 0 && (
        <div className="p-2 border-t">
          <button
            onClick={() => onChange(col, [])}
            className="w-full text-center text-xs text-red-500 hover:text-red-700 py-0.5"
          >
            필터 초기화
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 필터 헤더 버튼 ───────────────────────────────────────────────────────────

interface FilterHeaderProps {
  col: string;
  label: string;
  align?: "left" | "right" | "center";
  drawings: DrawingList[];
  filters: Record<string, string[]>;
  onFilterChange: (col: string, values: string[]) => void;
  openCol: string | null;
  anchorRect: DOMRect | null;
  onOpen: (col: string, rect: DOMRect) => void;
  onClose: () => void;
}

function FilterHeader({
  col, label, align = "left", drawings, filters,
  onFilterChange, openCol, anchorRect, onOpen, onClose,
}: FilterHeaderProps) {
  const allValues = useMemo(
    () => [...new Set(drawings.map(d => colValue(d, col)))].sort(),
    [drawings, col]
  );
  const selected = filters[col] ?? [];
  const isActive = selected.length > 0;

  return (
    <th className={`px-2 py-2.5 text-xs font-semibold text-gray-500 text-${align} whitespace-nowrap`}>
      <div className={`flex items-center gap-1 w-full ${align === "right" ? "justify-end" : align === "center" ? "justify-center" : ""}`}>
        <span>{label}</span>
        <button
          onClick={e => {
            e.stopPropagation();
            if (openCol === col) { onClose(); return; }
            onOpen(col, e.currentTarget.getBoundingClientRect());
          }}
          className={`p-0.5 rounded hover:bg-gray-200 transition-colors ${isActive ? "text-blue-600" : "text-gray-400"}`}
          title={isActive ? `필터 적용 중 (${selected.length}개)` : "필터"}
        >
          <ListFilter size={11} />
        </button>
      </div>
      {/* 열린 드롭다운 */}
      {openCol === col && anchorRect && (
        <FilterDropdown
          col={col}
          allValues={allValues}
          selected={selected}
          onChange={onFilterChange}
          onClose={onClose}
          anchorRect={anchorRect}
        />
      )}
    </th>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function DrawingTable({
  drawings,
  projectId,
  confirmedDrawingIds = [],
}: {
  drawings: DrawingList[];
  projectId: string;
  confirmedDrawingIds?: string[];
}) {
  const router = useRouter();

  // 편집
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  // 삭제 / 전체삭제
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  // 스케줄 확정
  const [confirmedSet, setConfirmedSet] = useState<Set<string>>(() => new Set(confirmedDrawingIds));
  const [bulkReserving, setBulkReserving] = useState(false);
  const [bulkUnreserving, setBulkUnreserving] = useState(false);

  // 서버에서 confirmedDrawingIds가 갱신되면 로컬 state 동기화
  useEffect(() => {
    setConfirmedSet(new Set(confirmedDrawingIds));
  }, [confirmedDrawingIds.join(",")]);

  const bulkReserve = async () => {
    setBulkReserving(true);
    try {
      const res = await fetch("/api/drawings/reserve-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!data.success) { alert(data.error ?? "일괄 확정 실패"); return; }
      window.location.reload();
    } catch { alert("서버 오류"); } finally { setBulkReserving(false); }
  };

  const bulkUnreserve = async () => {
    setBulkUnreserving(true);
    try {
      const res = await fetch("/api/drawings/reserve-bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!data.success) { alert(data.error ?? "일괄 확정 취소 실패"); return; }
      window.location.reload();
    } catch { alert("서버 오류"); } finally { setBulkUnreserving(false); }
  };

  // 단건 추가 모달
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<EditForm>(emptyAddForm);
  const [adding, setAdding] = useState(false);

  const af = (field: keyof EditForm, value: string) =>
    setAddForm(prev => ({ ...prev, [field]: value }));

  const submitAdd = async () => {
    if (!addForm.material.trim() || !addForm.thickness || !addForm.width || !addForm.length) {
      alert("재질, 두께, 폭, 길이는 필수입니다."); return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/drawings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          rows: [{
            block: addForm.block || null,
            drawingNo: addForm.drawingNo || null,
            heatNo: null,
            material: addForm.material,
            thickness: Number(addForm.thickness),
            width: Number(addForm.width),
            length: Number(addForm.length),
            qty: 1,
            steelWeight: calcSteelWeight(addForm.thickness, addForm.width, addForm.length),
            useWeight: addForm.useWeight ? Number(addForm.useWeight) : null,
          }],
        }),
      });
      const data = await res.json();
      if (!data.success) { alert(data.error ?? "추가 실패"); return; }
      setShowAddModal(false);
      setAddForm(emptyAddForm);
      router.refresh();
    } catch { alert("서버 오류"); } finally { setAdding(false); }
  };

  // 필터
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [openCol, setOpenCol] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const handleFilterChange = useCallback((col: string, values: string[]) => {
    setFilters(prev => ({ ...prev, [col]: values }));
  }, []);

  const handleFilterOpen = useCallback((col: string, rect: DOMRect) => {
    setOpenCol(col);
    setAnchorRect(rect);
  }, []);

  const handleFilterClose = useCallback(() => {
    setOpenCol(null);
    setAnchorRect(null);
  }, []);

  const activeFilterCount = Object.values(filters).filter(v => v.length > 0).length;

  // 필터 적용
  const filteredDrawings = useMemo(() => {
    return drawings.filter(d =>
      Object.entries(filters).every(([col, values]) => {
        if (values.length === 0) return true;
        return values.includes(colValue(d, col));
      })
    );
  }, [drawings, filters]);

  // 편집 헬퍼
  const startEdit = (d: DrawingList) => { setEditingId(d.id); setEditForm(toEditForm(d)); };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); };
  const f = (field: keyof EditForm, value: string) =>
    setEditForm(prev => prev ? { ...prev, [field]: value } : prev);

  const saveEdit = async (id: string) => {
    if (!editForm) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/drawings/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          qty: 1,
          steelWeight: calcSteelWeight(editForm.thickness, editForm.width, editForm.length),
        }),
      });
      const data = await res.json();
      if (!data.success) { alert(data.error ?? "수정 실패"); return; }
      setEditingId(null); setEditForm(null); router.refresh();
    } catch { alert("서버 오류"); } finally { setSaving(false); }
  };

  const deleteRow = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/drawings/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) { alert(data.error ?? "삭제 실패"); return; }
      router.refresh();
    } catch { alert("서버 오류"); } finally { setDeletingId(null); }
  };

  const clearAll = async () => {
    setClearing(true);
    try {
      const res = await fetch(`/api/drawings?projectId=${projectId}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) { alert(data.error ?? "삭제 실패"); return; }
      setClearConfirm(false); router.refresh();
    } catch { alert("서버 오류"); } finally { setClearing(false); }
  };

  // 상태별 카운트 (전체 기준)
  const counts = drawings.reduce((acc, d) => {
    const s = (d.status ?? "REGISTERED") as DrawingStatusType;
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {} as Record<DrawingStatusType, number>);

  const filterHeaderProps = {
    drawings, filters,
    onFilterChange: handleFilterChange,
    openCol, anchorRect,
    onOpen: handleFilterOpen,
    onClose: handleFilterClose,
  };

  if (drawings.length === 0) {
    return (
      <>
        <div className="flex justify-end mb-2">
          <Button size="sm" onClick={() => setShowAddModal(true)} className="text-xs flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white">
            <Plus size={13} /> 강재 추가
          </Button>
        </div>
        <div className="text-center py-8 text-gray-400 bg-white rounded-xl border text-sm">
          강재리스트가 없습니다. Excel 파일을 업로드하거나 강재 추가 버튼으로 직접 입력하세요.
        </div>
        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <h3 className="font-bold text-gray-900 flex items-center gap-2"><Plus size={16} className="text-blue-600" /> 강재 1행 추가</h3>
                <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-3">
                <div className="col-span-2 grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-semibold text-gray-600 mb-1 block">블록</label><Input className="h-8 text-xs" placeholder="예: FR20" value={addForm.block} onChange={e => af("block", e.target.value)} /></div>
                  <div><label className="text-xs font-semibold text-gray-600 mb-1 block">도면번호</label><Input className="h-8 text-xs" placeholder="도면번호" value={addForm.drawingNo} onChange={e => af("drawingNo", e.target.value)} /></div>
                </div>
                <div><label className="text-xs font-semibold text-gray-600 mb-1 block">재질 <span className="text-red-500">*</span></label><Input className="h-8 text-xs" placeholder="예: SS400" value={addForm.material} onChange={e => af("material", e.target.value)} /></div>
                <div><label className="text-xs font-semibold text-gray-600 mb-1 block">두께(mm) <span className="text-red-500">*</span></label><Input type="number" className="h-8 text-xs text-right" value={addForm.thickness} onChange={e => af("thickness", e.target.value)} /></div>
                <div><label className="text-xs font-semibold text-gray-600 mb-1 block">폭(mm) <span className="text-red-500">*</span></label><Input type="number" className="h-8 text-xs text-right" value={addForm.width} onChange={e => af("width", e.target.value)} /></div>
                <div><label className="text-xs font-semibold text-gray-600 mb-1 block">길이(mm) <span className="text-red-500">*</span></label><Input type="number" className="h-8 text-xs text-right" value={addForm.length} onChange={e => af("length", e.target.value)} /></div>
                <div><label className="text-xs font-semibold text-gray-600 mb-1 block">사용중량(kg)</label><Input type="number" className="h-8 text-xs text-right" placeholder="선택" value={addForm.useWeight} onChange={e => af("useWeight", e.target.value)} /></div>
              </div>
              <div className="px-5 py-4 border-t flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowAddModal(false)}>취소</Button>
                <Button size="sm" onClick={submitAdd} disabled={adding} className="bg-blue-600 hover:bg-blue-700 text-white">{adding ? "저장 중..." : "추가"}</Button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-2">
      {/* 상단 바 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {/* 상태 카운트 */}
          <div className="flex gap-1.5 text-xs">
            {(counts.CAUTION ?? 0) > 0 && <span className="px-2 py-1 bg-red-100 text-red-700 rounded-md font-medium">경고 {counts.CAUTION}</span>}
            <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-md font-medium">미입고 {counts.REGISTERED ?? 0}</span>
            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-md font-medium">입고 {counts.WAITING ?? 0}</span>
            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md font-medium">절단 {counts.CUT ?? 0}</span>
          </div>
          {/* 필터 적용 중 표시 */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
              <ListFilter size={11} />
              <span>필터 {activeFilterCount}개 적용 ({filteredDrawings.length}/{drawings.length}행)</span>
              <button
                onClick={() => setFilters({})}
                className="ml-0.5 hover:text-blue-800"
                title="모든 필터 초기화"
              >
                <XCircle size={12} />
              </button>
            </div>
          )}
        </div>

        {/* 우측 버튼 그룹 */}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowAddModal(true)}
            className="text-xs flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white">
            <Plus size={13} /> 강재 추가
          </Button>

          {/* 일괄 확정 / 일괄 확정 취소 */}
          {drawings.some(d => d.status === "WAITING") && (
            <>
              <Button size="sm" onClick={bulkReserve} disabled={bulkReserving || bulkUnreserving}
                className="text-xs flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white">
                <CalendarCheck size={13} /> {bulkReserving ? "확정 중..." : "일괄 확정"}
              </Button>
              <Button size="sm" variant="outline" onClick={bulkUnreserve} disabled={bulkReserving || bulkUnreserving}
                className="text-xs flex items-center gap-1 text-purple-600 border-purple-300 hover:bg-purple-50">
                {bulkUnreserving ? "취소 중..." : "일괄 확정취소"}
              </Button>
            </>
          )}

          {/* 전체 삭제 */}
          {clearConfirm ? (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              <span className="text-xs text-red-700 font-medium">전체 {drawings.length}행을 삭제할까요?</span>
              <Button size="sm" variant="destructive" onClick={clearAll} disabled={clearing} className="h-7 text-xs">
                {clearing ? "삭제 중..." : "전체 삭제"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setClearConfirm(false)} className="h-7 text-xs">취소</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setClearConfirm(true)}
              className="text-red-400 hover:text-red-600 hover:bg-red-50 text-xs flex items-center gap-1">
              <Trash2 size={12} /> 전체 삭제 후 재업로드
            </Button>
          )}
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm min-w-[1494px] table-fixed">
          <colgroup>
            <col style={{ width: "130px" }} />  {/* 상태 */}
            <col style={{ width: "130px" }} />  {/* 블록 */}
            <col style={{ width: "130px" }} />  {/* 도면번호 */}
            <col style={{ width: "130px" }} />  {/* 재질 */}
            <col style={{ width: "130px" }} />  {/* 두께 */}
            <col style={{ width: "130px" }} />  {/* 폭 */}
            <col style={{ width: "130px" }} />  {/* 길이 */}
            <col style={{ width: "130px" }} />  {/* 강재중량 */}
            <col style={{ width: "130px" }} />  {/* 사용중량 */}
            <col style={{ width: "130px" }} />  {/* 실사용판번호 */}
            <col style={{ width: "90px" }} />   {/* 확정 */}
            <col style={{ width: "64px" }} />   {/* 액션 */}
          </colgroup>
          <thead className="bg-gray-50 border-b">
            <tr>
              <FilterHeader col="status"      label="상태"         align="center" {...filterHeaderProps} />
              <FilterHeader col="block"       label="블록"                        {...filterHeaderProps} />
              <FilterHeader col="drawingNo"   label="도면번호"                    {...filterHeaderProps} />
              <FilterHeader col="material"    label="재질"                        {...filterHeaderProps} />
              <FilterHeader col="thickness"   label="두께(mm)"     align="right"  {...filterHeaderProps} />
              <FilterHeader col="width"       label="폭(mm)"       align="right"  {...filterHeaderProps} />
              <FilterHeader col="length"      label="길이(mm)"     align="right"  {...filterHeaderProps} />
              <FilterHeader col="steelWeight" label="강재중량(kg)" align="right"  {...filterHeaderProps} />
              <FilterHeader col="useWeight"   label="사용중량(kg)" align="right"  {...filterHeaderProps} />
              <FilterHeader col="heatNo"      label="실사용판번호" align="center" {...filterHeaderProps} />
              <th className="px-2 py-2.5 text-xs font-semibold text-gray-500 text-center whitespace-nowrap">확정</th>
              <th className="px-2 py-2.5 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredDrawings.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-8 text-gray-400 text-xs">
                  필터 조건에 맞는 데이터가 없습니다.
                  <button onClick={() => setFilters({})} className="ml-2 text-blue-500 hover:underline">
                    필터 초기화
                  </button>
                </td>
              </tr>
            ) : (
              filteredDrawings.map((d) => {
                const isEditing = editingId === d.id;
                const isDeleting = deletingId === d.id;
                const status = (d.status ?? "REGISTERED") as DrawingStatusType;

                const isConfirmed = confirmedSet.has(d.id);

                if (isEditing && editForm) {
                  return (
                    <tr key={d.id} className="bg-blue-50">
                      <td className="px-2 py-1.5 text-center"><StatusBadge status={status} /></td>
                      <td className="px-2 py-1.5"><Input className="h-7 text-xs w-full"   value={editForm.block}       onChange={e => f("block",       e.target.value)} /></td>
                      <td className="px-2 py-1.5"><Input className="h-7 text-xs w-full"   value={editForm.drawingNo}   onChange={e => f("drawingNo",   e.target.value)} /></td>
                      <td className="px-2 py-1.5"><Input className="h-7 text-xs w-full"   value={editForm.material}    onChange={e => f("material",    e.target.value)} /></td>
                      <td className="px-2 py-1.5"><Input className="h-7 text-xs w-full text-right" value={editForm.thickness}  onChange={e => f("thickness",  e.target.value)} /></td>
                      <td className="px-2 py-1.5"><Input className="h-7 text-xs w-full text-right" value={editForm.width}      onChange={e => f("width",      e.target.value)} /></td>
                      <td className="px-2 py-1.5"><Input className="h-7 text-xs w-full text-right" value={editForm.length}     onChange={e => f("length",     e.target.value)} /></td>
                      <td className="px-2 py-1.5 text-right text-xs text-gray-500">{calcSteelWeight(editForm.thickness, editForm.width, editForm.length).toLocaleString()}</td>
                      <td className="px-2 py-1.5"><Input className="h-7 text-xs w-full text-right" value={editForm.useWeight}  onChange={e => f("useWeight",  e.target.value)} /></td>
                      <td className="px-2 py-1.5 text-center text-xs text-blue-600 font-mono">{d.heatNo ?? <span className="text-gray-300">-</span>}</td>
                      <td className="px-2 py-1.5"></td>
                      <td className="px-2 py-1.5">
                        <div className="flex gap-1">
                          <button onClick={() => saveEdit(d.id)} disabled={saving} className="p-1 text-green-600 hover:bg-green-100 rounded" title="저장"><Check size={14} /></button>
                          <button onClick={cancelEdit} disabled={saving} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="취소"><X size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={d.id} className={`hover:bg-gray-50 transition-colors ${isDeleting ? "opacity-40" : ""} ${status === "CUT" ? "bg-green-50/30" : ""}`}>
                    <td className="px-2 py-2 text-center"><StatusBadge status={status} /></td>
                    <td className="px-2 py-2 text-gray-700 font-medium text-xs truncate">{d.block ?? "-"}</td>
                    <td className="px-2 py-2 text-gray-700 font-mono text-xs truncate">{d.drawingNo ?? "-"}</td>
                    <td className="px-2 py-2">
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-xs rounded font-medium">{d.material}</span>
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-gray-700">{d.thickness}</td>
                    <td className="px-2 py-2 text-right text-xs text-gray-700">{d.width.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right text-xs text-gray-700">{d.length.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right text-xs text-gray-700">{calcSteelWeight(d.thickness, d.width, d.length).toLocaleString()}</td>
                    <td className="px-2 py-2 text-right text-xs text-gray-500">{d.useWeight != null ? d.useWeight.toLocaleString() : "-"}</td>
                    <td className="px-2 py-2 text-center text-xs font-mono text-blue-600 truncate">{d.heatNo ?? <span className="text-gray-300">-</span>}</td>
                    <td className="px-2 py-2 text-center">
                      {status === "WAITING" && isConfirmed && (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-700">
                          확정
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1 justify-end items-center">
                        <button
                          onClick={() => startEdit(d)}
                          disabled={status === "CUT"}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title={status === "CUT" ? "절단 완료 항목은 수정 불가" : "수정"}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => deleteRow(d.id)}
                          disabled={isDeleting || status === "CUT"}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title={status === "CUT" ? "절단 완료 항목은 삭제 불가" : "삭제"}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot className="bg-gray-50 border-t">
            <tr>
              <td colSpan={7} className="px-2 py-2 text-xs text-gray-500 font-medium">
                합계 ({filteredDrawings.length}행{activeFilterCount > 0 ? ` / 전체 ${drawings.length}행` : ""})
              </td>
              <td className="px-2 py-2 text-right text-xs font-bold text-gray-700">
                {filteredDrawings.reduce((s, d) => s + calcSteelWeight(d.thickness, d.width, d.length), 0).toLocaleString()}kg
              </td>
              <td className="px-2 py-2 text-right text-xs font-bold text-gray-700">
                {filteredDrawings.reduce((s, d) => s + (d.useWeight ?? 0), 0).toLocaleString()}kg
              </td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 단건 강재 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Plus size={16} className="text-blue-600" /> 강재 1행 추가</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <div className="col-span-2 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">블록</label>
                  <Input className="h-8 text-xs" placeholder="예: FR20" value={addForm.block} onChange={e => af("block", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">도면번호</label>
                  <Input className="h-8 text-xs" placeholder="도면번호" value={addForm.drawingNo} onChange={e => af("drawingNo", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">재질 <span className="text-red-500">*</span></label>
                <Input className="h-8 text-xs" placeholder="예: SS400" value={addForm.material} onChange={e => af("material", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">두께(mm) <span className="text-red-500">*</span></label>
                <Input type="number" className="h-8 text-xs text-right" placeholder="0" value={addForm.thickness} onChange={e => af("thickness", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">폭(mm) <span className="text-red-500">*</span></label>
                <Input type="number" className="h-8 text-xs text-right" placeholder="0" value={addForm.width} onChange={e => af("width", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">길이(mm) <span className="text-red-500">*</span></label>
                <Input type="number" className="h-8 text-xs text-right" placeholder="0" value={addForm.length} onChange={e => af("length", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">사용중량(kg)</label>
                <Input type="number" className="h-8 text-xs text-right" placeholder="선택" value={addForm.useWeight} onChange={e => af("useWeight", e.target.value)} />
              </div>
            </div>
            <div className="px-5 py-4 border-t flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddModal(false)}>취소</Button>
              <Button size="sm" onClick={submitAdd} disabled={adding} className="bg-blue-600 hover:bg-blue-700 text-white">
                {adding ? "저장 중..." : "추가"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
