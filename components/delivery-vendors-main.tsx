"use client";

/**
 * 절단파트 — 납품처(고객) 관리
 * - 좌측: 납품처 목록 + 검색
 * - 우측: 선택된 납품처 상세 (편집 폼) + 사업자등록증 업로드/미리보기/삭제
 * - 새 납품처는 좌측 상단 "신규 등록" 버튼으로 빈 상세를 띄움
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2, Plus, Search, Save, Trash2, X, Upload, FileText,
  Image as ImageIcon, Download, Eye, Check, CircleSlash2,
} from "lucide-react";

export interface DeliveryVendor {
  id:                  string;
  bizNo:               string | null;
  name:                string;
  ceo:                 string | null;
  address:             string | null;
  bizType:             string | null;
  bizItem:             string | null;
  phone:               string | null;
  fax:                 string | null;
  contactName:         string | null;
  contactPhone:        string | null;
  memo:                string | null;
  bizCertStoredName:   string | null;
  bizCertOriginalName: string | null;
  bizCertMimeType:     string | null;
  bizCertSize:         number | null;
  isActive:            boolean;
  createdAt:           string;
  updatedAt:           string;
}

interface Props { initial: DeliveryVendor[] }

type DraftForm = {
  bizNo:        string;
  name:         string;
  ceo:          string;
  address:      string;
  bizType:      string;
  bizItem:      string;
  phone:        string;
  fax:          string;
  contactName:  string;
  contactPhone: string;
  memo:         string;
  isActive:     boolean;
};

const emptyDraft = (): DraftForm => ({
  bizNo: "", name: "", ceo: "", address: "", bizType: "", bizItem: "",
  phone: "", fax: "", contactName: "", contactPhone: "", memo: "",
  isActive: true,
});

const toDraft = (v: DeliveryVendor): DraftForm => ({
  bizNo:        v.bizNo        ?? "",
  name:         v.name,
  ceo:          v.ceo          ?? "",
  address:      v.address      ?? "",
  bizType:      v.bizType      ?? "",
  bizItem:      v.bizItem      ?? "",
  phone:        v.phone        ?? "",
  fax:          v.fax          ?? "",
  contactName:  v.contactName  ?? "",
  contactPhone: v.contactPhone ?? "",
  memo:         v.memo         ?? "",
  isActive:     v.isActive,
});

const fmtSize = (n: number | null): string => {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const isPdfMime   = (m: string | null) => m === "application/pdf";
const isImageMime = (m: string | null) => !!m && m.startsWith("image/");

export default function DeliveryVendorsMain({ initial }: Props) {
  const [vendors, setVendors] = useState<DeliveryVendor[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  // null = 신규 등록 모드 (selectedId 도 null)
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [draft, setDraft] = useState<DraftForm>(() => initial[0] ? toDraft(initial[0]) : emptyDraft());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  // 사업자등록증 업로드/미리보기
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading,    setUploading]    = useState(false);
  const [deletingCert, setDeletingCert] = useState(false);
  const [previewing,   setPreviewing]   = useState(false);

  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState<DeliveryVendor | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  // 모바일에서 선택 시 우측 폼으로 스크롤하기 위한 ref + 신규 모드 첫 input ref + 성공 토스트
  const detailRef    = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [toast,      setToast]      = useState<string>("");
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const selected = vendors.find(v => v.id === selectedId) ?? null;
  const isNew    = selectedId === null && !selected;

  // 선택 변경 시 draft 동기화 (dirty 이면 경고 — 작성 중 데이터 손실 방지)
  const selectVendor = (id: string | null) => {
    if (dirty && !confirm("저장하지 않은 변경 내용이 사라집니다. 이대로 이동할까요?")) return;
    setSelectedId(id);
    setError("");
    if (id === null) setDraft(emptyDraft());
    else {
      const v = vendors.find(x => x.id === id);
      if (v) setDraft(toDraft(v));
    }
    setDirty(false);
    // 모바일/좁은 화면에서 우측 상세 패널로 자동 스크롤 (lg 이상은 이미 같은 행에 보임)
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      // 다음 paint 이후 스크롤
      window.requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  // 신규 모드 진입 시 상호 input 자동 포커스
  useEffect(() => {
    if (isNew && nameInputRef.current) nameInputRef.current.focus();
  }, [isNew]);

  const updateDraft = <K extends keyof DraftForm>(k: K, v: DraftForm[K]) => {
    setDraft(d => ({ ...d, [k]: v }));
    setDirty(true);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors
      .filter(v => showInactive || v.isActive)
      .filter(v => {
        if (!q) return true;
        return (
          v.name.toLowerCase().includes(q) ||
          (v.bizNo ?? "").toLowerCase().includes(q) ||
          (v.ceo ?? "").toLowerCase().includes(q) ||
          (v.contactName ?? "").toLowerCase().includes(q) ||
          (v.contactPhone ?? "").toLowerCase().includes(q)
        );
      });
  }, [vendors, search, showInactive]);

  // 저장 — 신규 POST, 기존 PATCH
  const handleSave = async () => {
    setError("");
    if (!draft.name.trim()) { setError("상호(이름)는 필수입니다."); return; }
    setSaving(true);
    try {
      if (isNew) {
        const res = await fetch("/api/delivery-vendors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const json = await res.json();
        if (!json.success) { setError(json.error || "등록 실패"); return; }
        const v: DeliveryVendor = json.data;
        setVendors(prev => [v, ...prev]);
        setSelectedId(v.id);
        setDraft(toDraft(v));
        setDirty(false);
        setToast("등록되었습니다. 이제 사업자등록증을 업로드할 수 있습니다.");
      } else if (selected) {
        const res = await fetch(`/api/delivery-vendors/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const json = await res.json();
        if (!json.success) { setError(json.error || "수정 실패"); return; }
        const v: DeliveryVendor = json.data;
        setVendors(prev => prev.map(x => x.id === v.id ? v : x));
        setDraft(toDraft(v));
        setDirty(false);
        setToast("저장되었습니다.");
        // 비활성으로 토글되었고 비활성 표시가 꺼져있으면 선택 해제 (목록에서 사라짐과 정합)
        if (!v.isActive && !showInactive) {
          setSelectedId(null);
          setDraft(emptyDraft());
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류로 저장에 실패했습니다.");
    } finally { setSaving(false); }
  };

  // 사업자등록증 업로드
  const handleUpload = async (file: File) => {
    if (!selected) { setError("먼저 납품처를 저장한 뒤 업로드하세요."); return; }
    setUploading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/delivery-vendors/${selected.id}/biz-cert`, { method: "POST", body: fd });
      const json = await res.json();
      if (!json.success) { setError(json.error || "업로드 실패"); return; }
      const v: DeliveryVendor = json.data;
      setVendors(prev => prev.map(x => x.id === v.id ? v : x));
      setToast("사업자등록증이 업로드되었습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류로 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteCert = async () => {
    if (!selected) return;
    if (!confirm("사업자등록증 파일을 삭제하시겠습니까?")) return;
    setDeletingCert(true); setError("");
    try {
      const res = await fetch(`/api/delivery-vendors/${selected.id}/biz-cert`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) { setError(json.error || "삭제 실패"); return; }
      const v: DeliveryVendor = json.data;
      setVendors(prev => prev.map(x => x.id === v.id ? v : x));
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류로 삭제에 실패했습니다.");
    } finally { setDeletingCert(false); }
  };

  // 납품처 삭제
  const handleDeleteVendor = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/delivery-vendors/${deleteTarget.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) { alert(json.error || "삭제 실패"); return; }
      const remaining = vendors.filter(v => v.id !== deleteTarget.id);
      setVendors(remaining);
      if (selectedId === deleteTarget.id) {
        setSelectedId(remaining[0]?.id ?? null);
        if (remaining[0]) setDraft(toDraft(remaining[0])); else setDraft(emptyDraft());
        setDirty(false);
      }
      setDeleteTarget(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "네트워크 오류로 삭제에 실패했습니다.");
    } finally { setDeleting(false); }
  };

  const certUrl = (opts: { download?: boolean; bust?: boolean } = {}) => {
    if (!selected || !selected.bizCertStoredName) return "";
    const params = new URLSearchParams();
    if (opts.download) params.set("download", "1");
    // storedName (cuid) 은 파일 교체 시 반드시 새 값이 되므로 캐시 무효화 키로 안전
    if (opts.bust)     params.set("v", selected.bizCertStoredName);
    const qs = params.toString();
    return `/api/delivery-vendors/${selected.id}/biz-cert/file${qs ? "?" + qs : ""}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Building2 size={24} className="text-blue-600" /> 납품처관리
        </h2>
        <p className="text-sm text-gray-500 mt-1">절단·가공부재를 납품받는 거래처. 출고장/거래명세표 자동출력에 사용합니다.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* 좌측 목록 */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col" style={{ minHeight: "70vh" }}>
          <div className="p-3 border-b border-gray-200 space-y-2">
            <button
              onClick={() => selectVendor(null)}
              className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border-2 border-dashed ${
                isNew ? "bg-blue-50 border-blue-400 text-blue-700" : "border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600"
              }`}
            >
              <Plus size={14} /> 새 납품처 등록
            </button>
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="상호·사업자번호·대표자·담당자 검색"
                className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="w-3 h-3" />
              비활성 포함
            </label>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400">
                {vendors.length === 0 ? "등록된 납품처가 없습니다." : "검색 결과가 없습니다."}
              </div>
            ) : filtered.map(v => (
              <button
                key={v.id}
                onClick={() => selectVendor(v.id)}
                className={`w-full text-left px-3 py-2.5 transition-colors ${
                  selectedId === v.id ? "bg-blue-50 border-l-4 border-blue-600 pl-2" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1">
                      {!v.isActive && <CircleSlash2 size={11} className="text-gray-400 flex-shrink-0" />}
                      {v.name}
                    </div>
                    <div className="text-[11px] text-gray-500 font-mono truncate">
                      {v.bizNo ?? "사업자번호 미입력"}
                    </div>
                    {v.contactName && (
                      <div className="text-[11px] text-gray-500 truncate">
                        담당: {v.contactName}{v.contactPhone ? ` · ${v.contactPhone}` : ""}
                      </div>
                    )}
                  </div>
                  {v.bizCertStoredName && (
                    isPdfMime(v.bizCertMimeType)
                      ? <FileText size={13} className="text-red-500 flex-shrink-0" />
                      : <ImageIcon size={13} className="text-emerald-600 flex-shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 우측 상세 + 편집 */}
        <div ref={detailRef} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden scroll-mt-4">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-bold text-base text-gray-800">
              {isNew ? "새 납품처 등록" : (selected?.name ?? "납품처를 선택하세요")}
              {dirty && <span className="ml-2 text-xs font-normal text-amber-600">* 저장 안 됨</span>}
            </h3>
            <div className="flex items-center gap-2">
              {!isNew && selected && (
                <button
                  onClick={() => setDeleteTarget(selected)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                >
                  <Trash2 size={12} /> 삭제
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving || (!isNew && !selected)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={12} /> {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>

          {!isNew && !selected ? (
            <div className="py-20 text-center text-sm text-gray-400">왼쪽 목록에서 납품처를 선택하거나 새 납품처를 등록하세요.</div>
          ) : (
            <div className="p-5 space-y-5">
              {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>}

              {/* 사업자 정보 */}
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">사업자 정보</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="상호" required>
                    <input ref={nameInputRef} value={draft.name} onChange={e => updateDraft("name", e.target.value)}
                      className="input" placeholder="(주)○○산업" />
                  </Field>
                  <Field label="사업자등록번호">
                    <input value={draft.bizNo} onChange={e => updateDraft("bizNo", e.target.value)}
                      className="input font-mono" placeholder="123-45-67890" />
                  </Field>
                  <Field label="대표자">
                    <input value={draft.ceo} onChange={e => updateDraft("ceo", e.target.value)}
                      className="input" placeholder="홍길동" />
                  </Field>
                  <Field label="주소">
                    <input value={draft.address} onChange={e => updateDraft("address", e.target.value)}
                      className="input" placeholder="경남 사천시 …" />
                  </Field>
                  <Field label="업태">
                    <input value={draft.bizType} onChange={e => updateDraft("bizType", e.target.value)}
                      className="input" placeholder="제조업" />
                  </Field>
                  <Field label="종목">
                    <input value={draft.bizItem} onChange={e => updateDraft("bizItem", e.target.value)}
                      className="input" placeholder="조선부재" />
                  </Field>
                  <Field label="전화번호">
                    <input value={draft.phone} onChange={e => updateDraft("phone", e.target.value)}
                      className="input font-mono" placeholder="055-000-0000" />
                  </Field>
                  <Field label="팩스">
                    <input value={draft.fax} onChange={e => updateDraft("fax", e.target.value)}
                      className="input font-mono" placeholder="055-000-0000" />
                  </Field>
                </div>
              </section>

              {/* 담당자 */}
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">업체 담당자</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="담당자 이름">
                    <input value={draft.contactName} onChange={e => updateDraft("contactName", e.target.value)}
                      className="input" placeholder="김영업" />
                  </Field>
                  <Field label="담당자 전화번호">
                    <input value={draft.contactPhone} onChange={e => updateDraft("contactPhone", e.target.value)}
                      className="input font-mono" placeholder="010-0000-0000" />
                  </Field>
                </div>
              </section>

              {/* 비고 + 활성 */}
              <section className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
                <Field label="비고">
                  <textarea value={draft.memo} onChange={e => updateDraft("memo", e.target.value)}
                    rows={2} className="input resize-none" placeholder="특이사항" />
                </Field>
                <Field label="활성 상태">
                  <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer h-[42px]">
                    <input type="checkbox" checked={draft.isActive}
                      onChange={e => updateDraft("isActive", e.target.checked)} className="w-4 h-4" />
                    <span className="text-sm">{draft.isActive ? "사용 중" : "비활성"}</span>
                  </label>
                </Field>
              </section>

              {/* 사업자등록증 */}
              <section>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">사업자등록증 (이미지/PDF · 최대 10MB)</h4>
                {isNew ? (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg px-4 py-6 text-center text-xs text-gray-500">
                    먼저 위의 정보를 저장한 뒤 사업자등록증을 업로드하세요.
                  </div>
                ) : selected?.bizCertStoredName ? (
                  <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      {isPdfMime(selected.bizCertMimeType)
                        ? <FileText size={28} className="text-red-500" />
                        : <ImageIcon size={28} className="text-emerald-600" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{selected.bizCertOriginalName}</div>
                        <div className="text-[11px] text-gray-500">{selected.bizCertMimeType} · {fmtSize(selected.bizCertSize)}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setPreviewing(true)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50">
                          <Eye size={12} /> 미리보기
                        </button>
                        <a href={certUrl({ download: true })} download
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50">
                          <Download size={12} /> 다운로드
                        </a>
                        <button onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50">
                          <Upload size={12} /> 교체
                        </button>
                        <button onClick={handleDeleteCert} disabled={deletingCert}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">
                          <Trash2 size={12} /> {deletingCert ? "삭제 중…" : "삭제"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full border-2 border-dashed border-blue-300 text-blue-600 rounded-lg px-4 py-6 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50"
                  >
                    <Upload size={16} className="inline mr-1" /> {uploading ? "업로드 중…" : "사업자등록증 업로드"}
                  </button>
                )}
                <input
                  ref={fileInputRef} type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp,image/heic"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                  }}
                />
              </section>

              <style jsx>{`
                .input {
                  width: 100%;
                  padding: 0.5rem 0.75rem;
                  font-size: 0.875rem;
                  border: 1px solid rgb(229 231 235);
                  border-radius: 0.5rem;
                  outline: none;
                }
                .input:focus { box-shadow: 0 0 0 2px rgb(59 130 246 / 0.4); border-color: rgb(59 130 246); }
              `}</style>
            </div>
          )}
        </div>
      </div>

      {/* 미리보기 모달 */}
      {previewing && selected && selected.bizCertStoredName && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewing(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
              <h4 className="font-bold text-sm truncate flex-1 min-w-0" title={selected.bizCertOriginalName ?? ""}>{selected.bizCertOriginalName}</h4>
              <button onClick={() => setPreviewing(false)} className="p-1 hover:bg-gray-100 rounded-full flex-shrink-0"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100">
              {isPdfMime(selected.bizCertMimeType) ? (
                <iframe src={certUrl({ bust: true })} className="w-full h-[80vh]" title="사업자등록증" />
              ) : isImageMime(selected.bizCertMimeType) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={certUrl({ bust: true })} alt="사업자등록증" className="max-w-full mx-auto" />
              ) : (
                <div className="py-20 text-center text-sm text-gray-500">미리보기 불가 — 다운로드 후 확인하세요.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 납품처 삭제 확인 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="font-bold text-lg text-gray-900">납품처 삭제</h3>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-sm text-gray-700">
                <strong className="text-gray-900">{deleteTarget.name}</strong> 을(를) 정말로 삭제하시겠습니까?
              </p>
              {deleteTarget.bizCertStoredName && (
                <p className="text-xs text-gray-500">등록된 사업자등록증 파일도 함께 삭제됩니다.</p>
              )}
            </div>
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2 rounded-b-2xl">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50">취소</button>
              <button onClick={handleDeleteVendor} disabled={deleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                <Trash2 size={14} /> {deleting ? "삭제 중…" : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 성공 토스트 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-emerald-600 text-white px-5 py-2.5 rounded-full text-sm font-semibold shadow-lg flex items-center gap-2">
          <Check size={14} /> {toast}
        </div>
      )}
    </div>
  );
}

function Field({
  label, required, children,
}: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
