/**
 * 미저장 변경 전역 가드 — SPA 이동/사용자 전환 시 작성 중 내용 유실 방지.
 *
 * beforeunload 는 브라우저 새로고침·닫기만 잡고, Next.js 클라이언트 라우팅(<Link>)이나
 * 업무관리 '현재 사용자' 전환은 잡지 못한다. 페이지가 자신의 dirty 여부를 여기에 등록하면
 * 사이드바 Link(onNavigate) 와 사용자 선택 드롭다운이 이동 전에 확인한다.
 *
 * 사용:
 *   useEffect(() => registerUnsavedGuard(() => dirty), [dirty]);   // 반환값이 해제 함수
 *   if (!confirmLeaveIfUnsaved()) return;                          // 이동 직전 확인
 */

type Guard = () => boolean;

const guards = new Set<Guard>();

/** 미저장 여부를 알려주는 함수를 등록. 반환값을 호출하면 해제(cleanup 에 그대로 사용). */
export function registerUnsavedGuard(fn: Guard): () => void {
  guards.add(fn);
  return () => { guards.delete(fn); };
}

/** 현재 미저장 변경이 하나라도 있는가. */
export function hasUnsaved(): boolean {
  for (const g of guards) { try { if (g()) return true; } catch { /* 무시 */ } }
  return false;
}

/** 이동해도 되는지. 미저장이 있으면 확인창을 띄우고 사용자가 취소하면 false. */
export function confirmLeaveIfUnsaved(
  message = "저장되지 않은 변경이 있습니다. 이동하면 입력 내용이 사라집니다. 계속할까요?"
): boolean {
  if (!hasUnsaved()) return true;
  if (typeof window === "undefined") return true;
  return window.confirm(message);
}
