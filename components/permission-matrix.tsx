"use client";

import { ACTIONS, RESOURCE_GROUPS } from "@/lib/permissions";

/**
 * 권한 매트릭스 — 리소스(메뉴×서브메뉴) × 액션(읽기/쓰기/수정) 체크.
 * value = "<resource>:<action>" 토큰 배열. onChange 로 갱신.
 * UX: 쓰기/수정 체크 시 읽기 자동 포함, 읽기 해제 시 쓰기/수정도 해제.
 */
export default function PermissionMatrix({
  value, onChange,
}: { value: string[]; onChange: (tokens: string[]) => void }) {
  const set = new Set(value);
  const tok = (res: string, act: string) => `${res}:${act}`;

  const apply = (next: Set<string>) => onChange([...next]);

  const toggle = (res: string, act: string) => {
    const next = new Set(set);
    const key = tok(res, act);
    if (next.has(key)) {
      next.delete(key);
      if (act === "read") { next.delete(tok(res, "write")); next.delete(tok(res, "edit")); } // 읽기 끄면 나머지도
    } else {
      next.add(key);
      if (act === "write" || act === "edit") next.add(tok(res, "read")); // 쓰기/수정엔 읽기 필요
    }
    apply(next);
  };

  // 그룹 전체 토글 (해당 액션 전부 on/off)
  const groupAllChecked = (items: { key: string }[], act: string) => items.length > 0 && items.every(i => set.has(tok(i.key, act)));
  const toggleGroup = (items: { key: string }[], act: string) => {
    const next = new Set(set);
    const allOn = groupAllChecked(items, act);
    for (const i of items) {
      const key = tok(i.key, act);
      if (allOn) {
        next.delete(key);
        if (act === "read") { next.delete(tok(i.key, "write")); next.delete(tok(i.key, "edit")); }
      } else {
        next.add(key);
        if (act === "write" || act === "edit") next.add(tok(i.key, "read"));
      }
    }
    apply(next);
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">메뉴 / 서브메뉴</th>
            {ACTIONS.map(a => <th key={a.key} className="px-3 py-2 w-16 text-center font-semibold">{a.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {RESOURCE_GROUPS.map(g => (
            <GroupRows key={g.key} group={g} set={set} toggle={toggle} toggleGroup={toggleGroup} groupAllChecked={groupAllChecked} tok={tok} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ group, set, toggle, toggleGroup, groupAllChecked, tok }: {
  group: (typeof RESOURCE_GROUPS)[number];
  set: Set<string>;
  toggle: (res: string, act: string) => void;
  toggleGroup: (items: { key: string }[], act: string) => void;
  groupAllChecked: (items: { key: string }[], act: string) => boolean;
  tok: (res: string, act: string) => string;
}) {
  return (
    <>
      <tr className="bg-gray-100/70 border-t border-gray-200">
        <td className="px-3 py-1.5 font-bold text-gray-700">{group.label}</td>
        {ACTIONS.map(a => (
          <td key={a.key} className="px-3 py-1.5 text-center">
            <input type="checkbox" className="accent-blue-600"
              title={`${group.label} 전체 ${a.label}`}
              checked={groupAllChecked(group.items, a.key)}
              onChange={() => toggleGroup(group.items, a.key)} />
          </td>
        ))}
      </tr>
      {group.items.map(it => (
        <tr key={it.key} className="border-t border-gray-100 hover:bg-gray-50">
          <td className="px-3 py-1.5 pl-6 text-gray-700">{it.label}</td>
          {ACTIONS.map(a => (
            <td key={a.key} className="px-3 py-1.5 text-center">
              <input type="checkbox" className="accent-blue-600"
                checked={set.has(tok(it.key, a.key))}
                onChange={() => toggle(it.key, a.key)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
