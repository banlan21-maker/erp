"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Pencil, Trash2, Users, Search, Filter, X, Save, List, Plus, GitBranch, Phone, MapPin, Settings2, ArrowUp, ArrowDown, ArrowUpDown, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import dynamic from "next/dynamic";
import EmergencyTab from "@/components/emergency-tab";
import ColumnFilterDropdown, { type FilterValue } from "@/components/column-filter-dropdown";
import { getCascadedFilteredRows, getAllCascadedOptions, type ColumnAccessorMap } from "@/lib/cascading-filters";

const OrgChartTab = dynamic(() => import("@/components/org-chart-tab"), { ssr: false });

const NATIONALITIES = ["한국", "태국", "미얀마", "베트남"];

const inputCls = "w-full px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-sm font-medium text-gray-700 mb-1.5";

function ForeignFields({ form, onChange }: {
  form: FormState;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div className="mt-6">
      <h4 className="font-bold text-orange-700 border-b border-orange-200 pb-2 mb-4 flex items-center gap-2">
        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">외국인</span>
        비자 및 체류 정보
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div>
          <label className={labelCls}>닉네임</label>
          <input name="nickname" value={form.nickname} onChange={e => onChange("nickname", e.target.value)} placeholder="현장에서 불리는 이름" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>영문이름</label>
          <input name="englishName" value={form.englishName} onChange={e => onChange("englishName", e.target.value)} placeholder="여권상 영문 이름" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>비자타입</label>
          <input name="visaType" value={form.visaType} onChange={e => onChange("visaType", e.target.value)} placeholder="E-9, E-7, H-2 등" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>외국인등록증번호</label>
          <input name="foreignIdNo" value={form.foreignIdNo} onChange={e => onChange("foreignIdNo", e.target.value)} placeholder="000000-0000000" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>여권번호</label>
          <input name="passportNo" value={form.passportNo} onChange={e => onChange("passportNo", e.target.value)} placeholder="여권번호 입력" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>비자만기일</label>
          <input type="date" name="visaExpiry" value={form.visaExpiry} onChange={e => onChange("visaExpiry", e.target.value)} className={inputCls} />
        </div>
      </div>
    </div>
  );
}

interface WorksiteOption { id: string; name: string; }

interface Worker {
  id: string;
  name: string;
  nationality: string | null;
  birthDate: string | null;
  phone: string | null;
  role: string | null;
  position: string | null;
  worksite: string | null;
  carNumber: string | null;
  joinDate: string | null;
  bloodType: string | null;
  shoeSize: string | null;
  winterTop: string | null;
  winterBottom: string | null;
  summerTop: string | null;
  summerBottom: string | null;
  isCncOp: boolean;
  nickname: string | null;
  englishName: string | null;
  visaType: string | null;
  foreignIdNo: string | null;
  passportNo: string | null;
  visaExpiry: string | null;
  createdAt: string;
}

interface FormState {
  name: string; nationality: string; birthDate: string; phone: string;
  role: string; position: string; worksite: string; carNumber: string; joinDate: string; bloodType: string;
  shoeSize: string; winterTop: string; winterBottom: string;
  summerTop: string; summerBottom: string;
  isCncOp: boolean;
  nickname: string; englishName: string; visaType: string;
  foreignIdNo: string; passportNo: string; visaExpiry: string;
}

const emptyForm: FormState = {
  name: "", nationality: "한국", birthDate: "", phone: "",
  role: "", position: "", worksite: "", carNumber: "", joinDate: "", bloodType: "",
  shoeSize: "", winterTop: "", winterBottom: "",
  summerTop: "", summerBottom: "",
  isCncOp: false,
  nickname: "", englishName: "", visaType: "",
  foreignIdNo: "", passportNo: "", visaExpiry: "",
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return dateStr.slice(0, 10);
}

function isForeigner(nationality: string) {
  return nationality && nationality !== "한국";
}

export default function WorkersMain({ workers }: { workers: Worker[] }) {
  const router = useRouter();
  const wsManagerRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<"list" | "org" | "emergency">("list");
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [worksiteOptions, setWorksiteOptions] = useState<WorksiteOption[]>([]);
  const [showWsManager, setShowWsManager] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [addingWs, setAddingWs] = useState(false);

  useEffect(() => {
    fetch("/api/worksite-options").then(r => r.json()).then(d => {
      if (d.success) setWorksiteOptions(d.data);
    });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wsManagerRef.current && !wsManagerRef.current.contains(e.target as Node)) {
        setShowWsManager(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const addWorksite = async () => {
    if (!newWsName.trim()) return;
    setAddingWs(true);
    try {
      const res = await fetch("/api/worksite-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWsName.trim() }),
      });
      const d = await res.json();
      if (d.success) { setWorksiteOptions(prev => [...prev, d.data]); setNewWsName(""); }
      else alert(d.error ?? "추가 실패");
    } finally { setAddingWs(false); }
  };

  const deleteWorksite = async (id: string, name: string) => {
    if (!confirm(`"${name}" 근무지를 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/worksite-options/${id}`, { method: "DELETE" });
    const d = await res.json();
    if (d.success) setWorksiteOptions(prev => prev.filter(w => w.id !== id));
    else alert(d.error ?? "삭제 실패");
  };

  /* ── 엑셀형 컬럼 정의 ── */
  const COLUMNS = useMemo(() => [
    { key: "name",         label: "이름",      align: "left"   as const },
    { key: "nationality",  label: "국적",      align: "center" as const },
    { key: "role",         label: "담당",      align: "left"   as const },
    { key: "position",     label: "직책",      align: "left"   as const },
    { key: "worksite",     label: "근무지",    align: "left"   as const },
    { key: "carNumber",    label: "차량번호",  align: "left"   as const },
    { key: "phone",        label: "연락처",    align: "left"   as const },
    { key: "joinDate",     label: "입사일",    align: "left"   as const },
    { key: "birthDate",    label: "생년월일",  align: "left"   as const },
    { key: "visaExpiry",   label: "비자만기일",align: "left"   as const },
    { key: "isCncOp",      label: "CNC OP",   align: "center" as const },
    { key: "bloodType",    label: "혈액형",    align: "center" as const },
    { key: "shoeSize",     label: "신발",      align: "center" as const },
    { key: "winterTop",    label: "동복상의",  align: "center" as const },
    { key: "winterBottom", label: "동복하의",  align: "center" as const },
    { key: "summerTop",    label: "하계상의",  align: "center" as const },
    { key: "summerBottom", label: "하계하의",  align: "center" as const },
  ], []);

  const colValue = useCallback((w: Worker, col: string): string => {
    switch (col) {
      case "name":         return w.name;
      case "nationality":  return w.nationality ?? "";
      case "role":         return w.role ?? "";
      case "position":     return w.position ?? "";
      case "worksite":     return w.worksite ?? "";
      case "carNumber":    return w.carNumber ?? "";
      case "phone":        return w.phone ?? "";
      case "joinDate":     return formatDate(w.joinDate) !== "-" ? formatDate(w.joinDate) : "";
      case "birthDate":    return formatDate(w.birthDate) !== "-" ? formatDate(w.birthDate) : "";
      case "visaExpiry":   return formatDate(w.visaExpiry) !== "-" ? formatDate(w.visaExpiry) : "";
      case "isCncOp":      return w.isCncOp ? "CNC OP" : "";
      case "bloodType":    return w.bloodType ?? "";
      case "shoeSize":     return w.shoeSize ?? "";
      case "winterTop":    return w.winterTop ?? "";
      case "winterBottom": return w.winterBottom ?? "";
      case "summerTop":    return w.summerTop ?? "";
      case "summerBottom": return w.summerBottom ?? "";
      default: return "";
    }
  }, []);

  const [colFilters, setColFilters] = useState<Record<string, string[]>>({});
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filterAnchorEl, setFilterAnchorEl] = useState<HTMLElement | null>(null);

  type SortKey = { col: string; dir: "asc" | "desc" };
  const [sortKeys, setSortKeys] = useState<SortKey[]>([]);

  const handleSort = useCallback((col: string) => {
    setSortKeys(prev => {
      const i = prev.findIndex(k => k.col === col);
      if (i === -1) return [...prev, { col, dir: "asc" }];
      if (prev[i].dir === "asc") return prev.map((k, j) => j === i ? { ...k, dir: "desc" } : k);
      return prev.filter((_, j) => j !== i);
    });
  }, []);

  // cascading filter accessors
  const accessors = useMemo<ColumnAccessorMap<typeof workers[number]>>(() => {
    const m: ColumnAccessorMap<typeof workers[number]> = {};
    for (const c of COLUMNS) m[c.key] = (row) => colValue(row, c.key);
    return m;
  }, [COLUMNS, colValue]);

  // 컬럼별 distinct (필터 드롭다운용 — cascading)
  const distinctValues = useMemo(
    () => getAllCascadedOptions(workers, colFilters, accessors),
    [workers, colFilters, accessors],
  );

  const filteredWorkers = useMemo(() => {
    // 1) 검색어 적용
    const searched = searchTerm
      ? workers.filter(w => w.name.includes(searchTerm) || (w.phone && w.phone.includes(searchTerm)))
      : workers;
    // 2) cascading 컬럼 필터 적용
    const filtered = getCascadedFilteredRows(searched, colFilters, accessors);
    if (sortKeys.length === 0) return filtered;
    return [...filtered].sort((a, b) => {
      for (const { col, dir } of sortKeys) {
        const av = colValue(a, col);
        const bv = colValue(b, col);
        const cmp = av.localeCompare(bv, "ko");
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }, [workers, searchTerm, colFilters, sortKeys, colValue]);

  const activeFilterCount = Object.values(colFilters).filter(v => v.length > 0).length;

  /* ── 엑셀 다운로드 (메인 시트 + 사이즈 집계 시트들) ── */
  const downloadExcel = () => {
    const list = filteredWorkers;
    if (list.length === 0) { alert("다운로드할 데이터가 없습니다."); return; }

    const wb = XLSX.utils.book_new();
    const filterTag = activeFilterCount > 0 || searchTerm ? "필터" : "전체";

    // 1) 메인 시트 — 인원 전체
    const mainHeader = COLUMNS.map(c => c.label);
    const mainRows = list.map(w => COLUMNS.map(c => colValue(w, c.key) || "-"));
    const mainData = [
      [`인원 리스트 (${filterTag} — 총 ${list.length}명)`],
      mainHeader,
      ...mainRows,
    ];
    const mainSheet = XLSX.utils.aoa_to_sheet(mainData);
    mainSheet["!cols"] = COLUMNS.map(c => ({ wch: c.key === "name" || c.key === "phone" || c.key === "worksite" ? 14 : 10 }));
    XLSX.utils.book_append_sheet(wb, mainSheet, "인원리스트");

    // 2) 사이즈 집계 시트 (피복·신체 사이즈 발주용)
    const sizeFields: { key: keyof Worker; label: string }[] = [
      { key: "shoeSize",     label: "신발" },
      { key: "winterTop",    label: "동복상의" },
      { key: "winterBottom", label: "동복하의" },
      { key: "summerTop",    label: "하계상의" },
      { key: "summerBottom", label: "하계하의" },
    ];

    for (const f of sizeFields) {
      // 사이즈별 카운트 + 해당 인원 이름들
      const counter = new Map<string, string[]>();
      for (const w of list) {
        const size = ((w[f.key] as string | null) ?? "").trim() || "(미입력)";
        if (!counter.has(size)) counter.set(size, []);
        counter.get(size)!.push(w.name);
      }
      const rows = Array.from(counter.entries())
        .map(([size, names]) => ({ size, count: names.length, names: names.join(", ") }))
        .sort((a, b) => {
          // (미입력)은 마지막
          if (a.size === "(미입력)") return 1;
          if (b.size === "(미입력)") return -1;
          // 숫자형 사이즈 우선 비교 (신발 등)
          const an = parseFloat(a.size), bn = parseFloat(b.size);
          if (!isNaN(an) && !isNaN(bn)) return an - bn;
          return a.size.localeCompare(b.size, "ko");
        });

      const data: (string | number)[][] = [
        [`${f.label} 사이즈 집계 (총 ${list.length}명)`],
        ["사이즈", "수량(명)", "대상자"],
        ...rows.map(r => [r.size, r.count, r.names]),
        [],
        ["합계", list.length, ""],
      ];
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, ws, f.label);
    }

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `인원리스트_${filterTag}_${today}.xlsx`);
  };

  const [registerForm, setRegisterForm] = useState<FormState>(emptyForm);
  const [isRegistering, setIsRegistering] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleRegisterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setRegisterForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  const handleEditChange = (name: string, value: string) => {
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.name.trim()) { alert("이름을 입력하세요."); return; }
    setIsRegistering(true);
    try {
      const res = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registerForm),
      });
      const data = await res.json();
      if (!data.success) { alert(data.error ?? "등록 실패"); return; }
      alert("인원이 성공적으로 등록되었습니다.");
      setRegisterForm(emptyForm);
      setShowRegisterModal(false);
      router.refresh();
    } catch { alert("서버 오류"); } finally { setIsRegistering(false); }
  };

  const openEditModal = (w: Worker) => {
    setEditingId(w.id);
    setEditForm({
      name: w.name || "", nationality: w.nationality || "한국", birthDate: w.birthDate?.slice(0,10) || "",
      phone: w.phone || "", role: w.role || "", position: w.position || "", worksite: w.worksite || "", carNumber: w.carNumber || "",
      joinDate: w.joinDate?.slice(0,10) || "", bloodType: w.bloodType || "", shoeSize: w.shoeSize || "",
      winterTop: w.winterTop || "", winterBottom: w.winterBottom || "",
      summerTop: w.summerTop || "", summerBottom: w.summerBottom || "",
      isCncOp: w.isCncOp,
      nickname: w.nickname || "", englishName: w.englishName || "",
      visaType: w.visaType || "", foreignIdNo: w.foreignIdNo || "",
      passportNo: w.passportNo || "", visaExpiry: w.visaExpiry?.slice(0,10) || "",
    });
    setIsEditModalOpen(true);
  };

  const saveEdit = async () => {
    if (!editForm.name.trim()) { alert("이름은 필수 입력 사항입니다."); return; }
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/workers/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!data.success) { alert(data.error ?? "수정에 실패했습니다."); return; }
      setIsEditModalOpen(false);
      router.refresh();
    } catch { alert("서버 연결에 실패했습니다."); } finally { setIsSavingEdit(false); }
  };

  const deleteWorker = async (id: string, name: string) => {
    if (!confirm(`'${name}' 직원을 명단에서 완전히 삭제하시겠습니까?`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/workers/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) { alert(data.error ?? "삭제 실패"); return; }
      router.refresh();
      setIsEditModalOpen(false);
    } catch { alert("서버 오류"); } finally { setDeletingId(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
          <Users size={24} className="text-blue-600" />
          인원 관리
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          임직원 기본 정보 및 보급품 관련 사항을 등록하고 한눈에 관리합니다.
        </p>
      </div>

      <div className="flex border-b border-gray-200 items-end justify-between">
        <div className="flex">
          {(["list","org","emergency"] as const).map((tab) => {
            const labels: Record<string, React.ReactNode> = {
              list: <><List size={16} />인원 리스트</>,
              org: <><GitBranch size={16} />조직도</>,
              emergency: <><Phone size={16} />비상연락망</>,
            };
            return (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-semibold flex items-center gap-2 relative transition-colors ${activeTab === tab ? "text-blue-600" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}>
                {labels[tab]}
                {activeTab === tab && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-md" />}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => { setRegisterForm(emptyForm); setShowRegisterModal(true); }}
          className="mb-2 mr-1 flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm"
        >
          <UserPlus size={15} /> 신규 인원 등록
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

        {/* 인원 리스트 탭 */}
        {activeTab === "list" && (
          <div>
            <div className="p-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-3 bg-gray-50/50">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="이름·전화번호 검색"
                    className="pl-9 pr-4 py-1.5 h-9 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56 bg-white"
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                {/* 근무지 마스터 관리 */}
                <div className="relative" ref={wsManagerRef}>
                  <button onClick={() => setShowWsManager(v => !v)} title="근무지 관리"
                    className="flex items-center gap-1.5 h-9 px-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                    <Settings2 size={13} /> 근무지 관리
                  </button>
                  {showWsManager && (
                    <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl p-3 z-20 min-w-[220px]">
                      <div className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1">
                        <MapPin size={11} className="text-blue-500" /> 근무지 마스터
                      </div>
                      <div className="space-y-0.5 mb-3 max-h-40 overflow-y-auto">
                        {worksiteOptions.length === 0 && <p className="text-xs text-gray-400 py-1">등록된 근무지가 없습니다.</p>}
                        {worksiteOptions.map(ws => (
                          <div key={ws.id} className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-gray-50">
                            <span className="text-sm text-gray-700">{ws.name}</span>
                            <button onClick={() => deleteWorksite(ws.id, ws.name)} className="text-gray-300 hover:text-red-500 transition-colors ml-3 flex-shrink-0">
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1.5 border-t border-gray-100 pt-2">
                        <input value={newWsName} onChange={e => setNewWsName(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && addWorksite()}
                          placeholder="새 근무지명" className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        <button onClick={addWorksite} disabled={addingWs}
                          className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-semibold">
                          추가
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {activeFilterCount > 0 && (
                  <button onClick={() => setColFilters({})} className="flex items-center gap-1 h-9 px-3 text-xs border border-blue-300 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100">
                    <Filter size={11} fill="currentColor" /> 필터 {activeFilterCount}개 초기화
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500 whitespace-nowrap">
                  <strong className="text-gray-900">{filteredWorkers.length}</strong>명
                  <span className="text-xs text-gray-400 ml-1">/ 총 {workers.length}명</span>
                </span>
                <button onClick={downloadExcel}
                  className="flex items-center gap-1.5 h-9 px-3 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm"
                  title="현재 필터·정렬 결과를 엑셀로 다운로드 (사이즈별 집계 시트 포함)">
                  <Download size={14} /> 엑셀 다운로드
                </button>
              </div>
            </div>

            <div className="overflow-x-auto min-h-[400px]">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-gray-50 border-b-2 border-gray-300">
                  <tr>
                    {COLUMNS.map(c => {
                      const filterActive = (colFilters[c.key]?.length ?? 0) > 0;
                      const sortIdx = sortKeys.findIndex(k => k.col === c.key);
                      const sortKey = sortKeys[sortIdx];
                      const alignCls = c.align === "center" ? "text-center" : "text-left";
                      return (
                        <th key={c.key} className={`px-3 py-2.5 font-semibold text-xs text-gray-600 border-r border-gray-200 ${alignCls}`}>
                          <div className={`flex items-center gap-0.5 ${c.align === "center" ? "justify-center" : ""}`}>
                            <span>{c.label}</span>
                            <button
                              onClick={(e) => { setOpenFilter(c.key); setFilterAnchorEl(e.currentTarget); }}
                              className={`rounded hover:bg-gray-200 p-0.5 ${filterActive ? "text-blue-600" : "text-gray-400"}`}
                              title={filterActive ? `필터 ${colFilters[c.key].length}개` : "필터"}
                            >
                              <Filter size={10} fill={filterActive ? "currentColor" : "none"} />
                            </button>
                            <button
                              onClick={() => handleSort(c.key)}
                              className={`rounded hover:bg-gray-200 p-0.5 ${sortKey ? "text-blue-600" : "text-gray-300 hover:text-gray-500"}`}
                              title={sortKey ? (sortKey.dir === "asc" ? "오름차순" : "내림차순") : "정렬"}
                            >
                              <span className="flex items-center gap-px">
                                {sortKey ? (sortKey.dir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : <ArrowUpDown size={10} />}
                                {sortKeys.length > 1 && sortKey && <span className="text-[8px] leading-none">{sortIdx + 1}</span>}
                              </span>
                            </button>
                          </div>
                        </th>
                      );
                    })}
                    <th className="px-3 py-2.5 w-20 text-center text-xs text-gray-600 font-semibold">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredWorkers.length === 0 ? (
                    <tr>
                      <td colSpan={COLUMNS.length + 1} className="px-6 py-12 text-center text-gray-500">
                        {workers.length === 0 ? "등록된 인원이 없습니다. 우측 상단 '+ 신규 인원 등록' 버튼으로 추가하세요." : "필터·검색 조건에 맞는 인원이 없습니다."}
                      </td>
                    </tr>
                  ) : filteredWorkers.map((w) => {
                    const isDeleting = deletingId === w.id;
                    const visaExpiryDate = w.visaExpiry ? new Date(w.visaExpiry) : null;
                    const daysToExpiry = visaExpiryDate ? Math.floor((visaExpiryDate.getTime() - Date.now()) / 86400000) : null;
                    const visaUrgent = daysToExpiry !== null && daysToExpiry <= 90;
                    return (
                      <tr key={w.id} onClick={() => openEditModal(w)}
                        className={`hover:bg-gray-50/70 transition-colors group cursor-pointer ${isDeleting ? "opacity-30" : ""}`}>
                        <td className="px-3 py-2 text-xs font-bold text-gray-900">
                          {w.name}
                          {w.nickname && <span className="ml-1 text-xs text-gray-400">({w.nickname})</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-xs">
                          {w.nationality ? (
                            <span className={`px-2 py-0.5 rounded-full font-semibold ${w.nationality === "한국" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>
                              {w.nationality}
                            </span>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {w.role ? <span className="py-0.5 px-2 bg-gray-100 text-gray-600 rounded-md text-xs font-semibold">{w.role}</span> : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {w.position ? <span className="py-0.5 px-2 bg-blue-50 text-blue-700 rounded-md text-xs font-semibold">{w.position}</span> : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {w.worksite ? (
                            <span className="inline-flex items-center gap-1 py-0.5 px-2 bg-green-50 text-green-700 rounded-md text-xs font-semibold">
                              <MapPin size={10} />{w.worksite}
                            </span>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 font-mono">{w.carNumber || "-"}</td>
                        <td className="px-3 py-2 text-xs text-gray-600 font-mono">{w.phone || "-"}</td>
                        <td className="px-3 py-2 text-xs text-gray-600 font-mono">{formatDate(w.joinDate)}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 font-mono">{formatDate(w.birthDate)}</td>
                        <td className="px-3 py-2 text-xs text-sm">
                          {visaExpiryDate ? (
                            <span className={`font-mono ${visaUrgent ? "text-red-600 font-bold" : "text-gray-500"}`}>
                              {formatDate(w.visaExpiry)}
                              {visaUrgent && <span className="ml-1 text-xs bg-red-100 text-red-600 px-1 rounded">D-{daysToExpiry}</span>}
                            </span>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-center">
                          {w.isCncOp
                            ? <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">CNC OP</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 text-sm font-semibold">{w.bloodType || "-"}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 font-mono">{w.shoeSize || "-"}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 font-mono text-center">{w.winterTop || "-"}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 font-mono text-center">{w.winterBottom || "-"}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 font-mono text-center">{w.summerTop || "-"}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 font-mono text-center">{w.summerBottom || "-"}</td>
                        <td className="px-3 py-2 text-xs">
                          <div className="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <button onClick={() => openEditModal(w)} className="p-1.5 text-gray-500 hover:text-blue-600 rounded transition-colors">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => deleteWorker(w.id, w.name)} disabled={isDeleting} className="p-1.5 text-gray-500 hover:text-red-600 rounded transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 컬럼 필터 드롭다운 */}
            {openFilter && filterAnchorEl && (
              <ColumnFilterDropdown
                anchorEl={filterAnchorEl}
                values={distinctValues[openFilter] ?? []}
                selected={colFilters[openFilter] ?? []}
                onApply={(vals) => {
                  setColFilters(prev => ({ ...prev, [openFilter]: vals }));
                  setOpenFilter(null);
                  setFilterAnchorEl(null);
                }}
                onClose={() => { setOpenFilter(null); setFilterAnchorEl(null); }}
              />
            )}
          </div>
        )}

        {/* 신규 인원 등록 모달 */}
        {showRegisterModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto backdrop-blur-sm" onClick={() => !isRegistering && setShowRegisterModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-6" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
              <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><UserPlus size={18} className="text-blue-600" /> 신규 인원 등록</h3>
              <button onClick={() => setShowRegisterModal(false)} disabled={isRegistering} className="p-1 hover:bg-gray-100 rounded-full disabled:opacity-50"><X size={18} /></button>
            </div>
            <div className="p-6 border-b border-gray-100 bg-blue-50/50">
              <p className="text-xs text-gray-500">이름(*)을 포함하여 인원의 자세한 정보를 한 번에 입력하여 등록할 수 있습니다.</p>
            </div>
            <form onSubmit={handleRegisterSubmit} className="p-6 sm:p-8">
              <div className="mb-8">
                <h4 className="font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4">기본 인적 사항</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-1.5">이름 <span className="text-red-500">*</span></label>
                    <input required name="name" value={registerForm.name} onChange={handleRegisterChange} placeholder="예: 홍길동"
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                  </div>
                  <div>
                    <label className={labelCls}>국적</label>
                    <select name="nationality" value={registerForm.nationality} onChange={handleRegisterChange} className={inputCls}>
                      {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>담당 업무</label>
                    <input name="role" value={registerForm.role} onChange={handleRegisterChange} placeholder="절단, 로더 등" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>직책</label>
                    <input name="position" value={registerForm.position} onChange={handleRegisterChange} placeholder="조장, 사원 등" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>근무지</label>
                    <select name="worksite" value={registerForm.worksite} onChange={handleRegisterChange} className={inputCls}>
                      <option value="">선택안함</option>
                      {worksiteOptions.map(ws => <option key={ws.id} value={ws.name}>{ws.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>입사일</label>
                    <input type="date" name="joinDate" value={registerForm.joinDate} onChange={handleRegisterChange} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>연락처</label>
                    <input name="phone" value={registerForm.phone} onChange={handleRegisterChange} placeholder="010-0000-0000" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>차량번호</label>
                    <input name="carNumber" value={registerForm.carNumber} onChange={handleRegisterChange} placeholder="12가 3456" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>생년월일</label>
                    <input type="date" name="birthDate" value={registerForm.birthDate} onChange={handleRegisterChange} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>혈액형</label>
                    <select name="bloodType" value={registerForm.bloodType} onChange={handleRegisterChange} className={inputCls}>
                      <option value="">선택안함</option>
                      <option value="A">A형</option><option value="B">B형</option>
                      <option value="O">O형</option><option value="AB">AB형</option>
                    </select>
                  </div>
                  <div className="flex flex-col justify-center">
                    <label className={labelCls}>CNC 플라즈마 운전</label>
                    <button type="button" onClick={() => setRegisterForm(prev => ({ ...prev, isCncOp: !prev.isCncOp }))}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors border ${
                        registerForm.isCncOp ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700" : "bg-white text-gray-400 border-gray-200 hover:border-blue-300"
                      }`}>
                      <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${registerForm.isCncOp ? "bg-white border-white" : "border-gray-300"}`} />
                      {registerForm.isCncOp ? "CNC OP 지정됨" : "CNC OP 아님"}
                    </button>
                  </div>
                </div>
                {isForeigner(registerForm.nationality) && (
                  <ForeignFields form={registerForm} onChange={(name, value) => setRegisterForm(prev => ({ ...prev, [name]: value }))} />
                )}
              </div>
              <div>
                <h4 className="font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4">피복 및 신체 사이즈 정보</h4>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
                  <div><label className={labelCls}>신발사이즈</label><input type="number" name="shoeSize" value={registerForm.shoeSize} onChange={handleRegisterChange} placeholder="270" className={`${inputCls} text-center`} /></div>
                  <div className="lg:pl-4 lg:border-l border-gray-100"><label className={labelCls}>동복 상의</label><input name="winterTop" value={registerForm.winterTop} onChange={handleRegisterChange} placeholder="105" className={`${inputCls} text-center`} /></div>
                  <div><label className={labelCls}>동복 하의</label><input name="winterBottom" value={registerForm.winterBottom} onChange={handleRegisterChange} placeholder="32" className={`${inputCls} text-center`} /></div>
                  <div className="lg:pl-4 lg:border-l border-gray-100"><label className={labelCls}>하계/춘추복 상의</label><input name="summerTop" value={registerForm.summerTop} onChange={handleRegisterChange} placeholder="105" className={`${inputCls} text-center`} /></div>
                  <div><label className={labelCls}>하계/춘추복 하의</label><input name="summerBottom" value={registerForm.summerBottom} onChange={handleRegisterChange} placeholder="32" className={`${inputCls} text-center`} /></div>
                </div>
              </div>
              <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => { setRegisterForm(emptyForm); setShowRegisterModal(false); }} disabled={isRegistering}
                  className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">취소</button>
                <button type="submit" disabled={isRegistering}
                  className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm flex items-center gap-2">
                  <UserPlus size={16} /> {isRegistering ? "등록 중..." : "인원 등록 완료"}
                </button>
              </div>
            </form>
          </div>
          </div>
        )}

        {activeTab === "org" && (
          <div className="p-6">
            <OrgChartTab workers={workers.map(w => ({ id: w.id, name: w.name, role: w.role, position: w.position, phone: w.phone, nationality: w.nationality }))} />
          </div>
        )}

        {activeTab === "emergency" && (
          <div className="p-6">
            <EmergencyTab workers={workers.map(w => ({ id: w.id, name: w.name, role: w.role, position: w.position, phone: w.phone }))} />
          </div>
        )}
      </div>

      {/* 수정 모달 */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/80">
              <h3 className="font-bold text-lg text-blue-900 flex items-center gap-2">
                <Pencil size={18} className="text-blue-600" />
                {editForm.name}님의 정보 수정
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-md"><X size={20} /></button>
            </div>
            <div className="p-6 md:p-8 overflow-y-auto w-full bg-white flex-1">
              <div className="mb-6">
                <h4 className="font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4">기본 인적 사항</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
                  <div className="space-y-1.5"><label className="text-xs font-bold text-gray-700">이름 <span className="text-red-500">*</span></label><Input value={editForm.name} onChange={e => handleEditChange("name", e.target.value)} className="h-9 w-full bg-gray-50" /></div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">국적</label>
                    <select value={editForm.nationality} onChange={e => handleEditChange("nationality", e.target.value)} className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-700">담당 업무</label><Input value={editForm.role} onChange={e => handleEditChange("role", e.target.value)} className="h-9 w-full" /></div>
                  <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-700">직책</label><Input value={editForm.position} onChange={e => handleEditChange("position", e.target.value)} className="h-9 w-full" /></div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">근무지</label>
                    <select value={editForm.worksite} onChange={e => handleEditChange("worksite", e.target.value)} className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">선택안함</option>
                      {worksiteOptions.map(ws => <option key={ws.id} value={ws.name}>{ws.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-700">입사일</label><Input type="date" value={editForm.joinDate} onChange={e => handleEditChange("joinDate", e.target.value)} className="h-9 w-full" /></div>
                  <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-700">전화번호</label><Input value={editForm.phone} onChange={e => handleEditChange("phone", e.target.value)} className="h-9 w-full" /></div>
                  <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-700">차량번호</label><Input value={editForm.carNumber} onChange={e => handleEditChange("carNumber", e.target.value)} placeholder="12가 3456" className="h-9 w-full" /></div>
                  <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-700">생년월일</label><Input type="date" value={editForm.birthDate} onChange={e => handleEditChange("birthDate", e.target.value)} className="h-9 w-full" /></div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700">혈액형</label>
                    <select value={editForm.bloodType} onChange={e => handleEditChange("bloodType", e.target.value)} className="w-full h-9 px-3 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">선택안함</option><option value="A">A형</option><option value="B">B형</option><option value="O">O형</option><option value="AB">AB형</option>
                    </select>
                  </div>
                  <div className="space-y-1.5 flex flex-col justify-end">
                    <label className="text-xs font-semibold text-gray-700">CNC 플라즈마 운전</label>
                    <button type="button" onClick={() => setEditForm(prev => ({ ...prev, isCncOp: !prev.isCncOp }))}
                      className={`h-9 px-3 rounded-md text-sm font-bold transition-colors border flex items-center gap-2 ${
                        editForm.isCncOp ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700" : "bg-white text-gray-400 border-gray-200 hover:border-blue-300"
                      }`}>
                      <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${editForm.isCncOp ? "bg-white border-white" : "border-gray-300"}`} />
                      {editForm.isCncOp ? "CNC OP 지정됨" : "CNC OP 아님"}
                    </button>
                  </div>
                </div>
                {isForeigner(editForm.nationality) && <ForeignFields form={editForm} onChange={handleEditChange} />}
              </div>
              <div>
                <h4 className="font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4">피복 및 신체 사이즈 정보</h4>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-5 gap-y-5">
                  <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-600">신발사이즈</label><Input type="number" value={editForm.shoeSize} onChange={e => handleEditChange("shoeSize", e.target.value)} className="h-9 w-full text-center" /></div>
                  <div className="space-y-1.5 lg:pl-2 lg:border-l border-gray-100"><label className="text-xs font-semibold text-gray-600">동복 상의</label><Input value={editForm.winterTop} onChange={e => handleEditChange("winterTop", e.target.value)} className="h-9 w-full text-center" /></div>
                  <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-600">동복 하의</label><Input value={editForm.winterBottom} onChange={e => handleEditChange("winterBottom", e.target.value)} className="h-9 w-full text-center" /></div>
                  <div className="space-y-1.5 lg:pl-2 lg:border-l border-gray-100"><label className="text-xs font-semibold text-gray-600">하계 상의</label><Input value={editForm.summerTop} onChange={e => handleEditChange("summerTop", e.target.value)} className="h-9 w-full text-center" /></div>
                  <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-600">하계 하의</label><Input value={editForm.summerBottom} onChange={e => handleEditChange("summerBottom", e.target.value)} className="h-9 w-full text-center" /></div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
              <Button variant="outline" onClick={() => { if (editingId) deleteWorker(editingId, editForm.name); }} className="text-red-500 border-red-200 hover:bg-red-50 text-sm">
                <Trash2 size={14} className="mr-1" /> 삭제
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setIsEditModalOpen(false)} className="px-6 text-sm font-medium">취소</Button>
                <Button onClick={saveEdit} disabled={isSavingEdit} className="px-8 text-sm font-bold bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-200">
                  <Save size={16} className="mr-2" /> {isSavingEdit ? "저장 중..." : "수정사항 저장"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
