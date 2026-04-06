"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Upload, Plus, Trash2, RefreshCw, Download, Search, X, CheckSquare, Square,
  PackageCheck, ClipboardList,
} from "lucide-react";

interface SteelPlanRow {
  id: string;
  vesselCode: string;
  material: string;
  thickness: number;
  width: number;
  length: number;
  qty: number;
  heatNo: string | null;
  status: "REGISTERED" | "RECEIVED";
  memo: string | null;
  sourceFile: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  REGISTERED: { label: "등록됨",   cls: "bg-gray-100 text-gray-700" },
  RECEIVED:   { label: "입고완료", cls: "bg-green-100 text-green-700" },
};

const EMPTY_ROW = {
  vesselCode: "", material: "", thickness: "", width: "", length: "", qty: "1", heatNo: "", memo: "",
};

export default function SteelPlanMain() {
  const [tab, setTab] = useState<"plan" | "receive">("plan");

  const [rows, setRows] = useState<SteelPlanRow[]>([]);
  const [loading, setLoading] = useState(false);

  // 필터
  const [filterVessel, setFilterVessel] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [search, setSearch] = useState("");

  // 선택
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 수동 등록 폼
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_ROW });
  const [formSaving, setFormSaving] = useState(false);

  // 엑셀 업로드
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<string | null>(null);

  // 인라인 수정
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<SteelPlanRow>>({});

  // 입고 처리 탭 상태
  const [rcvForm, setRcvForm] = useState({
    vesselCode: "", material: "", thickness: "", width: "", length: "", qty: "1",
  });
  const [rcvResult, setRcvResult] = useState<{ matched: number } | null>(null);
  const [rcvLoading, setRcvLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterVessel !== "ALL") params.set("vesselCode", filterVessel);
    if (filterStatus !== "ALL") params.set("status", filterStatus);
    if (search) params.set("search", search);
    const res = await fetch(`/api/steel-plan?${params}`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [filterVessel, filterStatus, search]);

  useEffect(() => { load(); }, [load]);

  // 호선 목록 (distinct)
  const vesselList = Array.from(new Set(rows.map((r) => r.vesselCode))).sort();

  // filtered
  const filtered = rows;

  // 전체 선택
  const allChecked = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const toggleAll = () => {
    if (allChecked) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // 수동 등록
  const handleAddRow = async () => {
    if (!form.vesselCode || !form.material || !form.thickness || !form.width || !form.length) {
      alert("호선, 재질, 두께, 폭, 길이는 필수입니다.");
      return;
    }
    setFormSaving(true);
    await fetch("/api/steel-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vesselCode: form.vesselCode.trim(),
        material: form.material.trim(),
        thickness: Number(form.thickness),
        width: Number(form.width),
        length: Number(form.length),
        qty: Number(form.qty) || 1,
        heatNo: form.heatNo.trim() || null,
        memo: form.memo.trim() || null,
      }),
    });
    setForm({ ...EMPTY_ROW });
    setShowForm(false);
    setFormSaving(false);
    load();
  };

  // 엑셀 업로드
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadFile(file.name);

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { header: 1, defval: "" }) as unknown[][];

    // 헤더 행 자동 탐지: 재질/두께/폭/길이 키워드가 있는 행
    let headerRow = 0;
    for (let i = 0; i < Math.min(10, raw.length); i++) {
      const row = raw[i] as string[];
      const joined = row.join(" ");
      if (/재질|두께|폭|길이|material|thickness/i.test(joined)) {
        headerRow = i;
        break;
      }
    }

    const headers = (raw[headerRow] as string[]).map((h) => String(h).trim().toLowerCase());
    const colIdx = (keys: string[]) => headers.findIndex((h) => keys.some((k) => h.includes(k)));

    const iVessel    = colIdx(["호선", "vessel"]);
    const iMaterial  = colIdx(["재질", "material"]);
    const iThickness = colIdx(["두께", "thickness", "t."]);
    const iWidth     = colIdx(["폭", "width", "w."]);
    const iLength    = colIdx(["길이", "length", "l."]);
    const iQty       = colIdx(["수량", "qty", "ea"]);
    const iHeat      = colIdx(["판번호", "히트", "heat", "no."]);
    const iMemo      = colIdx(["메모", "비고", "memo", "remark"]);

    const items: object[] = [];
    for (let i = headerRow + 1; i < raw.length; i++) {
      const r = raw[i] as (string | number)[];
      const material  = iMaterial  >= 0 ? String(r[iMaterial] ?? "").trim()  : "";
      const thickness = iThickness >= 0 ? Number(r[iThickness]) : 0;
      const width     = iWidth     >= 0 ? Number(r[iWidth])     : 0;
      const length    = iLength    >= 0 ? Number(r[iLength])    : 0;
      if (!material || !thickness || !width || !length) continue;

      // vesselCode: 컬럼이 있으면 그 값, 없으면 폼 값
      const vesselCode = iVessel >= 0 ? String(r[iVessel] ?? "").trim() : form.vesselCode.trim();
      if (!vesselCode) continue;

      items.push({
        vesselCode,
        material,
        thickness,
        width,
        length,
        qty:       iQty  >= 0 ? Number(r[iQty])   || 1 : 1,
        heatNo:    iHeat >= 0 ? String(r[iHeat] ?? "").trim() || null : null,
        memo:      iMemo >= 0 ? String(r[iMemo] ?? "").trim() || null : null,
        sourceFile: file.name,
      });
    }

    if (items.length === 0) {
      alert("인식된 데이터가 없습니다.\n헤더(재질/두께/폭/길이)가 포함된 엑셀인지 확인해주세요.");
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
    load();
  };

  // 선택 삭제
  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}건을 삭제하시겠습니까?`)) return;
    await fetch("/api/steel-plan", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    setSelectedIds(new Set());
    load();
  };

  // 입고완료 처리
  const markReceived = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}건을 입고완료 처리하시겠습니까?`)) return;
    await Promise.all(
      Array.from(selectedIds).map((id) =>
        fetch(`/api/steel-plan/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "RECEIVED" }),
        })
      )
    );
    setSelectedIds(new Set());
    load();
  };

  // 인라인 수정 저장
  const saveEdit = async () => {
    if (!editId) return;
    await fetch(`/api/steel-plan/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditId(null);
    setEditForm({});
    load();
  };

  // 입고 처리
  const handleReceive = async () => {
    if (!rcvForm.vesselCode || !rcvForm.material || !rcvForm.thickness || !rcvForm.width || !rcvForm.length) {
      alert("호선, 재질, 두께, 폭, 길이는 필수입니다.");
      return;
    }
    setRcvLoading(true);
    setRcvResult(null);
    const res = await fetch("/api/steel-plan/receive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vesselCode: rcvForm.vesselCode.trim(),
        material:   rcvForm.material.trim(),
        thickness:  Number(rcvForm.thickness),
        width:      Number(rcvForm.width),
        length:     Number(rcvForm.length),
        qty:        Number(rcvForm.qty) || 1,
      }),
    });
    const data = await res.json();
    setRcvResult(data);
    setRcvLoading(false);
    if (data.matched > 0) load();
  };

  // 양식 다운로드
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["호선", "재질", "두께", "폭", "길이", "수량", "판번호(히트번호)", "메모"],
      ["RS01", "AH36", 8, 1829, 6096, 5, "HT240001", ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "자재계획");
    XLSX.writeFile(wb, "자재계획_양식.xlsx");
  };

  const inputCls = "border border-gray-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400";

  return (
    <div className="p-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">자재 계획 · 입고 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">전체 자재 계획 등록 및 철판 입고 처리</p>
        </div>
        <div className="flex gap-2">
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
        <button
          onClick={() => setTab("plan")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "plan" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <ClipboardList size={14} /> 자재계획 등록
        </button>
        <button
          onClick={() => setTab("receive")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "receive" ? "border-green-600 text-green-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <PackageCheck size={14} /> 입고 처리
        </button>
      </div>

      {/* 입고 처리 탭 */}
      {tab === "receive" && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-xl space-y-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">철판 입고 처리</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              입고된 철판 정보를 입력하면 자재계획에서 일치하는 항목을 <strong>입고완료</strong>로 자동 업데이트합니다.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-medium">호선 *</label>
              <input className={inputCls} value={rcvForm.vesselCode} onChange={(e) => setRcvForm({ ...rcvForm, vesselCode: e.target.value })} placeholder="RS01" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">재질 *</label>
              <input className={inputCls} value={rcvForm.material} onChange={(e) => setRcvForm({ ...rcvForm, material: e.target.value })} placeholder="AH36" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">두께(mm) *</label>
              <input className={inputCls} type="number" value={rcvForm.thickness} onChange={(e) => setRcvForm({ ...rcvForm, thickness: e.target.value })} placeholder="8" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">폭(mm) *</label>
              <input className={inputCls} type="number" value={rcvForm.width} onChange={(e) => setRcvForm({ ...rcvForm, width: e.target.value })} placeholder="1829" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">길이(mm) *</label>
              <input className={inputCls} type="number" value={rcvForm.length} onChange={(e) => setRcvForm({ ...rcvForm, length: e.target.value })} placeholder="6096" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">수량 (처리 매수)</label>
              <input className={inputCls} type="number" min={1} value={rcvForm.qty} onChange={(e) => setRcvForm({ ...rcvForm, qty: e.target.value })} />
            </div>
          </div>
          <button
            onClick={handleReceive}
            disabled={rcvLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
          >
            <PackageCheck size={16} /> {rcvLoading ? "처리 중..." : "입고 처리"}
          </button>
          {rcvResult && (
            <div className={`rounded-lg px-4 py-3 text-sm font-medium ${rcvResult.matched > 0 ? "bg-green-50 text-green-700 border border-green-200" : "bg-yellow-50 text-yellow-700 border border-yellow-200"}`}>
              {rcvResult.matched > 0
                ? `✓ ${rcvResult.matched}건 입고완료 처리되었습니다.`
                : "일치하는 자재계획 항목을 찾지 못했습니다. 호선·재질·규격을 확인해주세요."}
            </div>
          )}
        </div>
      )}

      {/* 자재계획 등록 탭 */}
      {tab === "plan" && showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-blue-700">새 항목 직접 등록</p>
          <div className="grid grid-cols-8 gap-2">
            <div>
              <label className="text-xs text-gray-500">호선 *</label>
              <input className={inputCls} value={form.vesselCode} onChange={(e) => setForm({ ...form, vesselCode: e.target.value })} placeholder="RS01" />
            </div>
            <div>
              <label className="text-xs text-gray-500">재질 *</label>
              <input className={inputCls} value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} placeholder="AH36" />
            </div>
            <div>
              <label className="text-xs text-gray-500">두께(mm) *</label>
              <input className={inputCls} type="number" value={form.thickness} onChange={(e) => setForm({ ...form, thickness: e.target.value })} placeholder="8" />
            </div>
            <div>
              <label className="text-xs text-gray-500">폭(mm) *</label>
              <input className={inputCls} type="number" value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} placeholder="1829" />
            </div>
            <div>
              <label className="text-xs text-gray-500">길이(mm) *</label>
              <input className={inputCls} type="number" value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} placeholder="6096" />
            </div>
            <div>
              <label className="text-xs text-gray-500">수량</label>
              <input className={inputCls} type="number" min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">판번호</label>
              <input className={inputCls} value={form.heatNo} onChange={(e) => setForm({ ...form, heatNo: e.target.value })} placeholder="HT240001" />
            </div>
            <div>
              <label className="text-xs text-gray-500">메모</label>
              <input className={inputCls} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowForm(false); setForm({ ...EMPTY_ROW }); }} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
            <button onClick={handleAddRow} disabled={formSaving} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {formSaving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      )}

      {/* 자재계획 탭: 필터 + 테이블 */}
      {tab === "plan" && <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filterVessel}
          onChange={(e) => setFilterVessel(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="ALL">전체 호선</option>
          {vesselList.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="ALL">전체 상태</option>
          <option value="REGISTERED">등록됨</option>
          <option value="RECEIVED">입고완료</option>
        </select>
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="호선·재질·판번호 검색"
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        <button onClick={load} className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-500">
          <RefreshCw size={14} />
        </button>
        <span className="text-sm text-gray-500 ml-auto">총 {filtered.length}건</span>
      </div>}

      {/* 선택 액션 바 */}
      {tab === "plan" && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-blue-700">{selectedIds.size}건 선택됨</span>
          <button
            onClick={markReceived}
            className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            입고완료 처리
          </button>
          <button
            onClick={deleteSelected}
            className="px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            선택 삭제
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-sm text-blue-500 hover:underline">
            선택 해제
          </button>
        </div>
      )}

      {/* 테이블 */}
      {tab === "plan" && <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-10 px-3 py-2.5 text-center">
                  <button onClick={toggleAll}>
                    {allChecked ? <CheckSquare size={15} className="text-blue-600" /> : <Square size={15} className="text-gray-400" />}
                  </button>
                </th>
                <th className="px-3 py-2.5 text-center font-medium text-gray-600">호선</th>
                <th className="px-3 py-2.5 text-center font-medium text-gray-600">재질</th>
                <th className="px-3 py-2.5 text-center font-medium text-gray-600">두께</th>
                <th className="px-3 py-2.5 text-center font-medium text-gray-600">폭</th>
                <th className="px-3 py-2.5 text-center font-medium text-gray-600">길이</th>
                <th className="px-3 py-2.5 text-center font-medium text-gray-600">수량</th>
                <th className="px-3 py-2.5 text-center font-medium text-gray-600">판번호(히트번호)</th>
                <th className="px-3 py-2.5 text-center font-medium text-gray-600">상태</th>
                <th className="px-3 py-2.5 text-center font-medium text-gray-600">메모</th>
                <th className="px-3 py-2.5 text-center font-medium text-gray-600">파일</th>
                <th className="w-20 px-3 py-2.5 text-center font-medium text-gray-600">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={12} className="py-12 text-center text-gray-400">불러오는 중...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="py-12 text-center text-gray-400">등록된 자재 계획이 없습니다</td></tr>
              ) : (
                filtered.map((row) => {
                  const isEdit = editId === row.id;
                  const st = STATUS_LABEL[row.status];
                  return (
                    <tr key={row.id} className={`hover:bg-gray-50 ${selectedIds.has(row.id) ? "bg-blue-50" : ""}`}>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => toggleOne(row.id)}>
                          {selectedIds.has(row.id)
                            ? <CheckSquare size={15} className="text-blue-600" />
                            : <Square size={15} className="text-gray-400" />}
                        </button>
                      </td>
                      {isEdit ? (
                        <>
                          <td className="px-2 py-1"><input className={inputCls} value={editForm.vesselCode ?? ""} onChange={(e) => setEditForm({ ...editForm, vesselCode: e.target.value })} /></td>
                          <td className="px-2 py-1"><input className={inputCls} value={editForm.material ?? ""} onChange={(e) => setEditForm({ ...editForm, material: e.target.value })} /></td>
                          <td className="px-2 py-1"><input className={inputCls} type="number" value={editForm.thickness ?? ""} onChange={(e) => setEditForm({ ...editForm, thickness: Number(e.target.value) })} /></td>
                          <td className="px-2 py-1"><input className={inputCls} type="number" value={editForm.width ?? ""} onChange={(e) => setEditForm({ ...editForm, width: Number(e.target.value) })} /></td>
                          <td className="px-2 py-1"><input className={inputCls} type="number" value={editForm.length ?? ""} onChange={(e) => setEditForm({ ...editForm, length: Number(e.target.value) })} /></td>
                          <td className="px-2 py-1"><input className={inputCls} type="number" value={editForm.qty ?? ""} onChange={(e) => setEditForm({ ...editForm, qty: Number(e.target.value) })} /></td>
                          <td className="px-2 py-1"><input className={inputCls} value={editForm.heatNo ?? ""} onChange={(e) => setEditForm({ ...editForm, heatNo: e.target.value })} /></td>
                          <td className="px-2 py-1">
                            <select className={inputCls} value={editForm.status ?? row.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as "REGISTERED" | "RECEIVED" })}>
                              <option value="REGISTERED">등록됨</option>
                              <option value="RECEIVED">입고완료</option>
                            </select>
                          </td>
                          <td className="px-2 py-1"><input className={inputCls} value={editForm.memo ?? ""} onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })} /></td>
                          <td className="px-2 py-1 text-center text-xs text-gray-400">{row.sourceFile ?? "-"}</td>
                          <td className="px-2 py-1 text-center">
                            <div className="flex gap-1 justify-center">
                              <button onClick={saveEdit} className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">저장</button>
                              <button onClick={() => { setEditId(null); setEditForm({}); }} className="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-50">취소</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-center font-medium">{row.vesselCode}</td>
                          <td className="px-3 py-2 text-center">{row.material}</td>
                          <td className="px-3 py-2 text-center">{row.thickness}</td>
                          <td className="px-3 py-2 text-center">{row.width}</td>
                          <td className="px-3 py-2 text-center">{row.length}</td>
                          <td className="px-3 py-2 text-center">{row.qty}</td>
                          <td className="px-3 py-2 text-center text-blue-700 font-mono">{row.heatNo ?? "-"}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span>
                          </td>
                          <td className="px-3 py-2 text-center text-gray-500 text-xs">{row.memo ?? "-"}</td>
                          <td className="px-3 py-2 text-center text-xs text-gray-400 truncate max-w-[100px]" title={row.sourceFile ?? ""}>{row.sourceFile ?? "-"}</td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => { setEditId(row.id); setEditForm({ ...row }); }}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              수정
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  );
}
