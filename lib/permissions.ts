/**
 * 권한(RBAC) 리소스·액션 정의 — 순수 모듈(클라이언트/서버 공용, prisma 미사용).
 *  - 리소스 = 상단메뉴 × 서브메뉴 (사이드바 menuGroups 와 일치)
 *  - 액션   = 읽기(read) / 쓰기(write, 등록) / 수정(edit, 수정+삭제)
 *  - 계정의 permissions 는 "<resource>:<action>" 토큰 문자열 배열로 저장.
 *  ⚠ 현재는 저장/표시만. 실제 접근 차단(로그인 게이트 + 페이지/API 강제)은 차후 활성화.
 */
export const ACTIONS = [
  { key: "read",  label: "읽기" },
  { key: "write", label: "쓰기" },
  { key: "edit",  label: "수정" }, // 수정 + 삭제 포함
] as const;
export type ActionKey = (typeof ACTIONS)[number]["key"];

export interface ResourceItem { key: string; label: string }
export interface ResourceGroup { key: string; label: string; items: ResourceItem[] }

export const RESOURCE_GROUPS: ResourceGroup[] = [
  {
    key: "cutpart", label: "절단파트", items: [
      { key: "cutpart.dashboard",        label: "절단 대시보드" },
      { key: "cutpart.steel-plan",       label: "강재입출고" },
      { key: "cutpart.projects",         label: "프로젝트" },
      { key: "cutpart.scrap",            label: "잔재관리" },
      { key: "cutpart.external-shipout", label: "외부출고관리" },
      { key: "cutpart.worklog",          label: "작업일보관리" },
      { key: "cutpart.reports",          label: "절단보고서" },
      { key: "cutpart.billing",          label: "기성관리" },
      { key: "cutpart.archive",          label: "아카이브" },
    ],
  },
  {
    key: "supply", label: "구매/자재파트", items: [
      { key: "supply.dashboard", label: "구매/자재 대시보드" },
      { key: "supply.inventory", label: "재고관리" },
      { key: "supply.history",   label: "입출고 이력/등록" },
      { key: "supply.stats",     label: "월별 통계" },
    ],
  },
  {
    key: "management", label: "관리파트", items: [
      { key: "management.dashboard", label: "관리 대시보드" },
      { key: "management.workers",   label: "인원관리" },
      { key: "management.equipment", label: "장비관리" },
      { key: "management.transport", label: "운송관리" },
      { key: "management.facility",  label: "시설관리" },
      { key: "management.payment",   label: "결제관리" },
      { key: "management.vendors",   label: "거래처 관리" },
      { key: "management.meal",      label: "식수 관리" },
    ],
  },
  {
    key: "work", label: "업무관리", items: [
      { key: "work.dashboard", label: "업무 대시보드" },
      { key: "work.journal",   label: "업무일지" },
      { key: "work.users",     label: "사용자 등록" },
    ],
  },
  {
    key: "schedule", label: "스케줄", items: [
      { key: "schedule.create", label: "스케줄 생성" },
      { key: "schedule.view",   label: "스케줄 확인" },
    ],
  },
];

export const ALL_RESOURCE_KEYS: string[] = RESOURCE_GROUPS.flatMap(g => g.items.map(i => i.key));
export const ALL_PERMISSION_TOKENS: string[] = RESOURCE_GROUPS.flatMap(g =>
  g.items.flatMap(i => ACTIONS.map(a => `${i.key}:${a.key}`)),
);

const RESOURCE_KEY_SET = new Set(ALL_RESOURCE_KEYS);
const ACTION_KEY_SET = new Set(ACTIONS.map(a => a.key as string));

/** "<resource>:<action>" 토큰이 유효한지 (화이트리스트) */
export function isValidPermToken(tok: string): boolean {
  const [res, act] = String(tok).split(":");
  return RESOURCE_KEY_SET.has(res) && ACTION_KEY_SET.has(act);
}

/** 권한 보유 여부 (차후 페이지/API 강제에서 사용) */
export function can(perms: string[] | undefined, resource: string, action: ActionKey): boolean {
  return !!perms && perms.includes(`${resource}:${action}`);
}
