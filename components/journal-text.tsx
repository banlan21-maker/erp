"use client";

/**
 * 업무일지 읽기 렌더러 — 줄머리 상태 토큰을 해석해 상태별 스타일(완료=취소선 등) +
 * @멘션 강조로 표시. 어제칸·공유받은내용·대시보드 팀일지 등 일지 텍스트 표시에 공용 사용.
 */

import { MentionText } from "@/components/work-user-context";
import { parseLine, STATUS_META } from "@/lib/work-line-status";

export function JournalText({ content }: { content: string }) {
  const lines = (content ?? "").split("\n");
  return (
    <div className="space-y-0.5">
      {lines.map((raw, i) => {
        const { status, text } = parseLine(raw);
        if (status === "none" && text.trim() === "") return <div key={i} className="h-2" />;
        const meta = STATUS_META[status];
        return (
          <div key={i} className="flex items-start gap-1.5">
            {status !== "none" && (
              <span className={`mt-[6px] w-2 h-2 rounded-full shrink-0 ${meta.dot}`} aria-label={meta.label} />
            )}
            <span className={`whitespace-pre-wrap break-words ${meta.textClass}`}>
              <MentionText content={text} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
