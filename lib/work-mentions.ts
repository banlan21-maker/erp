/**
 * 업무관리 @멘션 파서
 * 글 내용에서 "@사용자이름" 을 찾아 멘션된 사용자 id 목록을 반환.
 *
 * 각 '@' 위치마다 "그 자리에서 시작하는 가장 긴 등록 이름"을 하나만 인정하고 소비한다.
 *  - 접두 충돌 방지: 사용자 김철 / 김철수 가 둘 다 있을 때 "@김철수" 는 김철수만 매칭(김철 오탐 X).
 *    (단순 substring includes 는 longest-first 정렬을 해도 김철 도 함께 매칭되는 버그였음)
 */
export function parseMentions(content: string, users: { id: string; name: string }[]): string[] {
  const ids = new Set<string>();
  const sorted = [...users].filter(u => u.name).sort((a, b) => b.name.length - a.name.length);
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== "@") continue;
    for (const u of sorted) {
      if (content.startsWith(u.name, i + 1)) {
        ids.add(u.id);
        i += u.name.length; // 매칭 구간 소비 — 같은 '@' 에서 더 짧은(접두) 이름 재매칭 차단
        break;
      }
    }
  }
  return [...ids];
}
