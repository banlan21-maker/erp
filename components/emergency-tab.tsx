"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Phone, Plus, Trash2, Printer, GripVertical, Search, X, Edit2, Check } from "lucide-react";

// ── 타입 ─────────────────────────────────────────────────────

export interface Worker {
  id: string;
  name: string;
  role: string | null;
  position: string | null;
  phone: string | null;
}

interface ContactItem {
  id: string;
  groupId: string;
  workerId: string | null;
  directName: string | null;
  directPhone: string | null;
  sortOrder: number;
  // 표시용 (인원 테이블에서 읽어옴)
  displayName?: string;
  displayRole?: string;
  displayPhone?: string;
}

interface Group {
  id: string;
  name: string;
  sortOrder: number;
  contacts: ContactItem[];
}

// ── 정렬 가능 항목 ─────────────────────────────────────────────

function SortableContact({
  contact,
  editMode,
  onDelete,
}: {
  contact: ContactItem;
  editMode: boolean;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: contact.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const phone = contact.displayPhone || contact.directPhone || "";

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
      {editMode && (
        <button {...attributes} {...listeners} className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing">
          <GripVertical size={16} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate">{contact.displayName || contact.directName || "-"}</p>
        <p className="text-xs text-gray-500 truncate">{contact.displayRole || ""}</p>
      </div>
      {phone && (
        <a
          href={`tel:${phone.replace(/[^0-9+]/g, "")}`}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-semibold rounded-lg hover:bg-green-100 transition-colors"
          onClick={e => editMode && e.preventDefault()}
        >
          <Phone size={13} />{phone}
        </a>
      )}
      {editMode && (
        <button onClick={() => onDelete(contact.id)} className="text-gray-300 hover:text-red-500 transition-colors ml-1">
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

// ── 그룹 카드 ─────────────────────────────────────────────────

function GroupCard({
  group,
  workers,
  editMode,
  onDeleteGroup,
  onAddContact,
  onDeleteContact,
  onReorderContacts,
  onRenameGroup,
}: {
  group: Group;
  workers: Worker[];
  editMode: boolean;
  onDeleteGroup: (id: string) => void;
  onAddContact: (groupId: string, workerId: string | null, directName: string, directPhone: string) => void;
  onDeleteContact: (id: string) => void;
  onReorderContacts: (groupId: string, newOrder: ContactItem[]) => void;
  onRenameGroup: (id: string, name: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState<"worker" | "direct">("worker");
  const [workerSearch, setWorkerSearch] = useState("");
  const [directName, setDirectName] = useState("");
  const [directPhone, setDirectPhone] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(group.name);

  const filteredWorkers = workers.filter(
    w => w.name.includes(workerSearch) || (w.role && w.role.includes(workerSearch))
  );
  const alreadyIds = new Set(group.contacts.map(c => c.workerId).filter(Boolean));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = group.contacts.findIndex(c => c.id === active.id);
    const newIdx = group.contacts.findIndex(c => c.id === over.id);
    onReorderContacts(group.id, arrayMove(group.contacts, oldIdx, newIdx));
  }

  function handleAddWorker(worker: Worker) {
    onAddContact(group.id, worker.id, "", "");
    setWorkerSearch("");
    setShowAddForm(false);
  }

  function handleAddDirect() {
    if (!directName.trim()) return;
    onAddContact(group.id, null, directName, directPhone);
    setDirectName("");
    setDirectPhone("");
    setShowAddForm(false);
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden">
      {/* 그룹 헤더 */}
      <div className="px-5 py-3 bg-white border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {editMode && editingName ? (
            <div className="flex items-center gap-2">
              <input
                className="border border-blue-300 rounded-lg px-2 py-1 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") { onRenameGroup(group.id, nameInput); setEditingName(false); } }}
              />
              <button onClick={() => { onRenameGroup(group.id, nameInput); setEditingName(false); }} className="text-blue-600 hover:text-blue-800">
                <Check size={15} />
              </button>
            </div>
          ) : (
            <>
              <h3 className="font-bold text-gray-900">{group.name}</h3>
              <span className="text-xs text-gray-400">{group.contacts.length}명</span>
              {editMode && (
                <button onClick={() => setEditingName(true)} className="text-gray-300 hover:text-gray-600 ml-1">
                  <Edit2 size={13} />
                </button>
              )}
            </>
          )}
        </div>
        {editMode && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(v => !v)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"
            >
              <Plus size={13} /> 추가
            </button>
            <button onClick={() => onDeleteGroup(group.id)} className="text-gray-300 hover:text-red-500">
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>

      {/* 항목 추가 폼 */}
      {editMode && showAddForm && (
        <div className="px-5 py-4 bg-blue-50 border-b border-blue-100">
          <div className="flex gap-2 mb-3">
            <button onClick={() => setAddMode("worker")} className={`text-xs px-3 py-1.5 rounded-lg font-medium ${addMode === "worker" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>인원 검색</button>
            <button onClick={() => setAddMode("direct")} className={`text-xs px-3 py-1.5 rounded-lg font-medium ${addMode === "direct" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>직접 입력</button>
          </div>
          {addMode === "worker" ? (
            <div>
              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                  placeholder="이름 또는 담당 검색"
                  value={workerSearch}
                  onChange={e => setWorkerSearch(e.target.value)}
                />
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {filteredWorkers.filter(w => !alreadyIds.has(w.id)).map(w => (
                  <button key={w.id} onClick={() => handleAddWorker(w)}
                    className="w-full text-left px-3 py-2 bg-white border border-gray-100 rounded-lg hover:border-blue-400 hover:bg-blue-50 text-sm transition-colors">
                    <span className="font-semibold text-gray-900">{w.name}</span>
                    {w.position && <span className="text-xs text-gray-400 ml-2">{w.position}</span>}
                    {w.phone && <span className="text-xs text-gray-400 ml-2">{w.phone}</span>}
                  </button>
                ))}
                {filteredWorkers.filter(w => !alreadyIds.has(w.id)).length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">검색 결과 없음</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <input className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" placeholder="이름 (예: 소방서 119)" value={directName} onChange={e => setDirectName(e.target.value)} />
              <input className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" placeholder="연락처" value={directPhone} onChange={e => setDirectPhone(e.target.value)} />
              <button onClick={handleAddDirect} className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">추가</button>
            </div>
          )}
        </div>
      )}

      {/* 항목 목록 */}
      <div className="p-4 space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={group.contacts.map(c => c.id)} strategy={verticalListSortingStrategy}>
            {group.contacts.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-4">항목이 없습니다.</p>
            ) : (
              group.contacts.map(c => (
                <SortableContact key={c.id} contact={c} editMode={editMode} onDelete={onDeleteContact} />
              ))
            )}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export default function EmergencyTab({ workers }: { workers: Worker[] }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);

  const workerMap = new Map(workers.map(w => [w.id, w]));

  // 연락처에 인원 정보 병합
  function enrichContacts(contacts: ContactItem[]): ContactItem[] {
    return contacts.map(c => {
      if (c.workerId) {
        const w = workerMap.get(c.workerId);
        return {
          ...c,
          displayName: w?.name || c.directName || "알수없음",
          displayRole: [w?.position, w?.role].filter(Boolean).join(" · ") || "",
          displayPhone: w?.phone || c.directPhone || "",
        };
      }
      return {
        ...c,
        displayName: c.directName || "",
        displayRole: "",
        displayPhone: c.directPhone || "",
      };
    });
  }

  useEffect(() => {
    fetch("/api/emergency-group")
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setGroups(data.data.map((g: Group) => ({ ...g, contacts: enrichContacts(g.contacts) })));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // 그룹 추가
  async function handleAddGroup() {
    if (!newGroupName.trim()) return;
    setAddingGroup(true);
    try {
      const res = await fetch("/api/emergency-group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName }),
      });
      const data = await res.json();
      if (data.success) {
        setGroups(prev => [...prev, { ...data.data, contacts: [] }]);
        setNewGroupName("");
      }
    } finally {
      setAddingGroup(false);
    }
  }

  // 그룹 이름 변경
  async function handleRenameGroup(id: string, name: string) {
    await fetch(`/api/emergency-group/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g));
  }

  // 그룹 삭제
  async function handleDeleteGroup(id: string) {
    if (!confirm("그룹과 포함된 모든 항목이 삭제됩니다. 계속하시겠습니까?")) return;
    await fetch(`/api/emergency-group/${id}`, { method: "DELETE" });
    setGroups(prev => prev.filter(g => g.id !== id));
  }

  // 항목 추가
  async function handleAddContact(groupId: string, workerId: string | null, directName: string, directPhone: string) {
    const res = await fetch("/api/emergency-contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, workerId, directName, directPhone }),
    });
    const data = await res.json();
    if (data.success) {
      const newContact = enrichContacts([data.data])[0];
      setGroups(prev => prev.map(g =>
        g.id === groupId ? { ...g, contacts: [...g.contacts, newContact] } : g
      ));
    }
  }

  // 항목 삭제
  async function handleDeleteContact(id: string) {
    await fetch(`/api/emergency-contact/${id}`, { method: "DELETE" });
    setGroups(prev => prev.map(g => ({
      ...g,
      contacts: g.contacts.filter(c => c.id !== id),
    })));
  }

  // 항목 순서 변경 (로컬 상태 + API)
  async function handleReorderContacts(groupId: string, newOrder: ContactItem[]) {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, contacts: newOrder } : g));
    // 각 항목 sortOrder 업데이트
    await Promise.all(
      newOrder.map((c, i) =>
        fetch(`/api/emergency-contact/${c.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: i }),
        })
      )
    );
  }

  // 그룹 순서 변경 (드래그)
  const groupSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  async function handleGroupDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = groups.findIndex(g => g.id === active.id);
    const newIdx = groups.findIndex(g => g.id === over.id);
    const newGroups = arrayMove(groups, oldIdx, newIdx);
    setGroups(newGroups);
    await Promise.all(
      newGroups.map((g, i) =>
        fetch(`/api/emergency-group/${g.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: i }),
        })
      )
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">불러오는 중...</div>;
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-gray-500">그룹별로 비상연락망을 구성합니다. 전화 버튼 클릭 시 바로 통화 연결됩니다.</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditMode(v => !v)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${
              editMode ? "bg-blue-600 text-white border-blue-600" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {editMode ? "편집 완료" : "편집"}
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700">
            <Printer size={14} />인쇄
          </button>
        </div>
      </div>

      {/* 그룹 추가 */}
      {editMode && (
        <div className="flex gap-2 print:hidden">
          <input
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            placeholder="새 그룹명 (예: 경영진, 현장, 외부 긴급)"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAddGroup()}
          />
          <button onClick={handleAddGroup} disabled={addingGroup} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
            <Plus size={14} />그룹 추가
          </button>
        </div>
      )}

      {/* 그룹 목록 */}
      {groups.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
          비상연락망 그룹이 없습니다.{" "}
          {!editMode && <button onClick={() => setEditMode(true)} className="text-blue-600 hover:underline">편집 모드에서 추가하세요.</button>}
        </div>
      ) : (
        <DndContext sensors={groupSensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
          <SortableContext items={groups.map(g => g.id)} strategy={verticalListSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groups.map(group => (
                <SortableGroupWrapper key={group.id} groupId={group.id} editMode={editMode}>
                  <GroupCard
                    group={group}
                    workers={workers}
                    editMode={editMode}
                    onDeleteGroup={handleDeleteGroup}
                    onAddContact={handleAddContact}
                    onDeleteContact={handleDeleteContact}
                    onReorderContacts={handleReorderContacts}
                    onRenameGroup={handleRenameGroup}
                  />
                </SortableGroupWrapper>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* 인쇄 CSS */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { background: white; }
          @page { size: A4; margin: 15mm; }
        }
      `}</style>
      <div className="hidden print:block text-xs text-gray-400 text-right mt-4">
        출력일: {new Date().toLocaleDateString("ko-KR")}
      </div>
    </div>
  );
}

// ── 그룹 정렬 래퍼 ────────────────────────────────────────────

function SortableGroupWrapper({ groupId, editMode, children }: { groupId: string; editMode: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: groupId });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {editMode && (
        <button
          {...attributes}
          {...listeners}
          className="absolute top-3 left-3 z-10 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing print:hidden"
        >
          <GripVertical size={15} />
        </button>
      )}
      {children}
    </div>
  );
}
