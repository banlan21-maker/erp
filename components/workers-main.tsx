"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Pencil, Trash2, Users, Search, Filter, X, Save, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

interface Worker {
  id: string;
  name: string;
  nationality: string | null;
  birthDate: string | null;
  phone: string | null;
  role: string | null;
  position: string | null;
  joinDate: string | null;
  bloodType: string | null;
  shoeSize: string | null;
  winterTop: string | null;
  winterBottom: string | null;
  summerTop: string | null;
  summerBottom: string | null;
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
  role: string; position: string; joinDate: string; bloodType: string;
  shoeSize: string; winterTop: string; winterBottom: string;
  summerTop: string; summerBottom: string;
  nickname: string; englishName: string; visaType: string;
  foreignIdNo: string; passportNo: string; visaExpiry: string;
}

const emptyForm: FormState = {
  name: "", nationality: "한국", birthDate: "", phone: "",
  role: "", position: "", joinDate: "", bloodType: "",
  shoeSize: "", winterTop: "", winterBottom: "",
  summerTop: "", summerBottom: "",
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

  const [activeTab, setActiveTab] = useState<"list" | "register">("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [posFilter, setPosFilter] = useState("all");

  const uniqueRoles = Array.from(new Set(workers.map(w => w.role).filter(Boolean))) as string[];
  const uniquePositions = Array.from(new Set(workers.map(w => w.position).filter(Boolean))) as string[];

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      const matchSearch = w.name.includes(searchTerm) || (w.phone && w.phone.includes(searchTerm));
      const matchRole = roleFilter === "all" || w.role === roleFilter;
      const matchPos = posFilter === "all" || w.position === posFilter;
      return matchSearch && matchRole && matchPos;
    });
  }, [workers, searchTerm, roleFilter, posFilter]);

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
      setActiveTab("list");
      router.refresh();
    } catch {
      alert("서버 오류");
    } finally {
      setIsRegistering(false);
    }
  };

  const openEditModal = (w: Worker) => {
    setEditingId(w.id);
    setEditForm({
      name: w.name || "", nationality: w.nationality || "한국", birthDate: w.birthDate?.slice(0,10) || "",
      phone: w.phone || "", role: w.role || "", position: w.position || "",
      joinDate: w.joinDate?.slice(0,10) || "", bloodType: w.bloodType || "", shoeSize: w.shoeSize || "",
      winterTop: w.winterTop || "", winterBottom: w.winterBottom || "",
      summerTop: w.summerTop || "", summerBottom: w.summerBottom || "",
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

      <div className="flex border-b border-gray-200">
        <button onClick={() => setActiveTab("list")} className={`px-5 py-3 text-sm font-semibold flex items-center gap-2 relative transition-colors ${activeTab === "list" ? "text-blue-600" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}>
          <List size={16} />인원 리스트
          {activeTab === "list" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-md" />}
        </button>
        <button onClick={() => setActiveTab("register")} className={`px-5 py-3 text-sm font-semibold flex items-center gap-2 relative transition-colors ${activeTab === "register" ? "text-blue-600" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}>
          <Plus size={16} />신규 인원 등록
          {activeTab === "register" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-md" />}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

        {/* 인원 리스트 탭 */}
        {activeTab === "list" && (
          <div>
            <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50/50">
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="flex bg-white border border-gray-200 rounded-lg p-1">
                  <Filter size={14} className="text-gray-400 ml-2 mr-1 self-center" />
                  <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="focus:outline-none text-sm bg-transparent px-2 text-gray-700 py-1">
                    <option value="all">담당 전체</option>
                    {uniqueRoles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <div className="w-px h-4 bg-gray-200 self-center mx-1"></div>
                  <select value={posFilter} onChange={(e) => setPosFilter(e.target.value)} className="focus:outline-none text-sm bg-transparent px-2 text-gray-700 py-1">
                    <option value="all">직책 전체</option>
                    {uniquePositions.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="이름 또는 전화번호 검색" className="pl-9 pr-4 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-64 bg-white" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
              </div>
              <span className="text-sm text-gray-500 whitespace-nowrap">
                검색된 인원 <strong className="text-gray-900">{filteredWorkers.length}</strong>명
                <span className="text-xs text-gray-400 ml-1">(총 {workers.length}명)</span>
              </span>
            </div>

            <div className="overflow-x-auto min-h-[400px]">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500">이름</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500">국적</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500">담당</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500">직책</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500">연락처</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500">입사일</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500">생년월일</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500">비자만기일</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500">혈액형</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500">신발</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500 text-center">동복상의</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500 text-center">동복하의</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500 text-center">하계상의</th>
                    <th className="px-4 py-3 font-semibold text-xs text-gray-500 text-center">하계하의</th>
                    <th className="px-4 py-3 w-16 text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredWorkers.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="px-6 py-12 text-center text-gray-500">
                        {workers.length === 0 ? "등록된 인원이 없습니다. '신규 인원 등록' 탭을 이용해 추가하세요." : "검색 조건에 맞는 인원이 없습니다."}
                      </td>
                    </tr>
                  ) : (
                    filteredWorkers.map((w) => {
                      const isDeleting = deletingId === w.id;
                      const visaExpiryDate = w.visaExpiry ? new Date(w.visaExpiry) : null;
                      const daysToExpiry = visaExpiryDate ? Math.floor((visaExpiryDate.getTime() - Date.now()) / 86400000) : null;
                      const visaUrgent = daysToExpiry !== null && daysToExpiry <= 90;
                      return (
                        <tr key={w.id} className={`hover:bg-blue-50/50 transition-colors group cursor-pointer ${isDeleting ? "opacity-30" : ""}`} onClick={() => openEditModal(w)}>
                          <td className="px-4 py-3 font-bold text-gray-900">
                            {w.name}
                            {w.nickname && <span className="ml-1 text-xs text-gray-400">({w.nickname})</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {w.nationality ? (
                              <span className={`px-2 py-0.5 rounded-full font-semibold ${w.nationality === "한국" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>
                                {w.nationality}
                              </span>
                            ) : "-"}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {w.role ? <span className="inline-flex py-0.5 px-2 bg-gray-100 text-gray-600 rounded-md text-xs font-semibold">{w.role}</span> : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {w.position ? <span className="inline-flex py-0.5 px-2 bg-blue-50 text-blue-700 rounded-md text-xs font-semibold">{w.position}</span> : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 font-mono text-sm">{w.phone || "-"}</td>
                          <td className="px-4 py-3 text-gray-600 font-mono text-sm">{formatDate(w.joinDate)}</td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-sm">{formatDate(w.birthDate)}</td>
                          <td className="px-4 py-3 text-sm">
                            {visaExpiryDate ? (
                              <span className={`font-mono ${visaUrgent ? "text-red-600 font-bold" : "text-gray-500"}`}>
                                {formatDate(w.visaExpiry)}
                                {visaUrgent && <span className="ml-1 text-xs bg-red-100 text-red-600 px-1 rounded">D-{daysToExpiry}</span>}
                              </span>
                            ) : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-sm font-semibold">{w.bloodType || "-"}</td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-sm">{w.shoeSize || "-"}</td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-sm text-center">{w.winterTop || "-"}</td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-sm text-center">{w.winterBottom || "-"}</td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-sm text-center">{w.summerTop || "-"}</td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-sm text-center">{w.summerBottom || "-"}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                              <button onClick={() => openEditModal(w)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-white bg-transparent rounded transition-colors">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => deleteWorker(w.id, w.name)} disabled={isDeleting} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-white bg-transparent rounded transition-colors">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 인원 등록 탭 */}
        {activeTab === "register" && (
          <div>
            <div className="p-6 border-b border-gray-100 bg-blue-50/50">
              <h3 className="font-bold text-gray-900">신규 인원 등록 정보</h3>
              <p className="text-xs text-gray-500 mt-1">이름(*)을 포함하여 인원의 자세한 정보를 한 번에 입력하여 등록할 수 있습니다.</p>
            </div>

            <form onSubmit={handleRegisterSubmit} className="p-6 sm:p-8">
              <div className="mb-8">
                <h4 className="font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4">기본 인적 사항</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-1.5">이름 <span className="text-red-500">*</span></label>
                    <input required name="name" value={registerForm.name} onChange={handleRegisterChange} placeholder="예: 홍길동" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
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
                    <label className={labelCls}>입사일</label>
                    <input type="date" name="joinDate" value={registerForm.joinDate} onChange={handleRegisterChange} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>연락처</label>
                    <input name="phone" value={registerForm.phone} onChange={handleRegisterChange} placeholder="010-0000-0000" className={inputCls} />
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
                </div>

                {isForeigner(registerForm.nationality) && (
                  <ForeignFields form={registerForm} onChange={(name, value) => setRegisterForm(prev => ({ ...prev, [name]: value }))} />
                )}
              </div>

              <div>
                <h4 className="font-bold text-gray-800 border-b border-gray-200 pb-2 mb-4">피복 및 신체 사이즈 정보</h4>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
                  <div>
                    <label className={labelCls}>신발사이즈</label>
                    <input type="number" name="shoeSize" value={registerForm.shoeSize} onChange={handleRegisterChange} placeholder="270" className={`${inputCls} text-center`} />
                  </div>
                  <div className="lg:pl-4 lg:border-l border-gray-100">
                    <label className={labelCls}>동복 상의</label>
                    <input name="winterTop" value={registerForm.winterTop} onChange={handleRegisterChange} placeholder="105" className={`${inputCls} text-center`} />
                  </div>
                  <div>
                    <label className={labelCls}>동복 하의</label>
                    <input name="winterBottom" value={registerForm.winterBottom} onChange={handleRegisterChange} placeholder="32" className={`${inputCls} text-center`} />
                  </div>
                  <div className="lg:pl-4 lg:border-l border-gray-100">
                    <label className={labelCls}>하계/춘추복 상의</label>
                    <input name="summerTop" value={registerForm.summerTop} onChange={handleRegisterChange} placeholder="105" className={`${inputCls} text-center`} />
                  </div>
                  <div>
                    <label className={labelCls}>하계/춘추복 하의</label>
                    <input name="summerBottom" value={registerForm.summerBottom} onChange={handleRegisterChange} placeholder="32" className={`${inputCls} text-center`} />
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => { setRegisterForm(emptyForm); setActiveTab("list"); }} className="px-6 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
                <button type="submit" disabled={isRegistering} className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm flex items-center gap-2">
                  <UserPlus size={16} /> {isRegistering ? "등록 중..." : "인원 등록 완료"}
                </button>
              </div>
            </form>
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
                  <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-700">입사일</label><Input type="date" value={editForm.joinDate} onChange={e => handleEditChange("joinDate", e.target.value)} className="h-9 w-full" /></div>
                  <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-700">전화번호</label><Input value={editForm.phone} onChange={e => handleEditChange("phone", e.target.value)} className="h-9 w-full" /></div>
                  <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-700">생년월일</label><Input type="date" value={editForm.birthDate} onChange={e => handleEditChange("birthDate", e.target.value)} className="h-9 w-full" /></div>
                  <div className="space-y-1.5"><label className="text-xs font-semibold text-gray-700">혈액형</label>
                    <select value={editForm.bloodType} onChange={e => handleEditChange("bloodType", e.target.value)} className="w-full h-9 px-3 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">선택안함</option><option value="A">A형</option><option value="B">B형</option><option value="O">O형</option><option value="AB">AB형</option>
                    </select>
                  </div>
                </div>

                {isForeigner(editForm.nationality) && (
                  <ForeignFields form={editForm} onChange={handleEditChange} />
                )}
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
