"use client";

import { useEffect, useRef } from "react";
// CSS is imported globally via next.config or layout

interface GanttItem {
  id: string;
  vesselCode: string;
  blockName: string;
  projectId: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  deliveryFactory: string | null;
  deliveryAssembly: string | null;
  workType: string;
  status: string;
  holdReason: string | null;
  priority: number;
  memo: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  completionRate: number;
  totalWeight: number;
  cutWeight: number;
  delayDays: number | null;
  logCount: number;
}

interface Props {
  items: GanttItem[];
  onItemClick?: (item: GanttItem) => void;
  onDateChange?: (id: string, start: string, end: string) => void;
  readOnly?: boolean;
}

function toFrappeDate(iso: string | null): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  return iso.slice(0, 10);
}

const STATUS_COLOR: Record<string, string> = {
  PLANNED:     "#3b82f6",
  IN_PROGRESS: "#10b981",
  COMPLETED:   "#6b7280",
  HOLD:        "#f59e0b",
  CANCELLED:   "#ef4444",
};

const PHANTOM_ROW_COUNT = 5;

function buildTasks(items: GanttItem[]) {
  const real = items
    .filter(item => item.plannedStart)
    .map(item => ({
      id:           item.id,
      name:         `[${item.vesselCode}] ${item.blockName}`,
      start:        toFrappeDate(item.plannedStart),
      end:          toFrappeDate(item.plannedEnd) || toFrappeDate(item.plannedStart),
      progress:     item.completionRate,
      custom_class: `status-${item.status.toLowerCase()}`,
      color:        STATUS_COLOR[item.status] ?? "#3b82f6",
      _data:        item,
    }));

  // 팝업 잘림 방지용 빈 행 (투명 바)
  const today = new Date().toISOString().slice(0, 10);
  const phantoms = Array.from({ length: PHANTOM_ROW_COUNT }, (_, i) => ({
    id:           `__phantom_${i}`,
    name:         "",
    start:        today,
    end:          today,
    progress:     0,
    custom_class: "phantom-row",
    color:        "transparent",
  }));

  return [...real, ...phantoms];
}

export default function FrappeGanttWrapper({ items, onItemClick, onDateChange, readOnly }: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const ganttRef        = useRef<any>(null);
  const prevIdsRef      = useRef<string>("");
  const isDragUpdateRef = useRef(false);
  // 드래그가 방금 끝났음 — on_date_change 직후 on_click이 오면 무시
  const wasDragRef      = useRef(false);
  // 더블클릭 타이머
  const clickTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef        = useRef<GanttItem[]>(items);
  const onClickRef      = useRef(onItemClick);
  const onDateChangeRef = useRef(onDateChange);

  useEffect(() => { onClickRef.current      = onItemClick; }, [onItemClick]);
  useEffect(() => { onDateChangeRef.current = onDateChange; }, [onDateChange]);
  useEffect(() => { itemsRef.current        = items; }, [items]);

  // 클린업은 unmount 시 한 번만 — [items] effect에 return 클린업을 넣으면
  // 드래그 후 items가 바뀔 때 클린업이 먼저 innerHTML을 지워버려 간트가 사라짐
  useEffect(() => {
    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    // 드래그로 인한 items 변경 → 재빌드 완전히 스킵
    // frappe-gantt이 이미 바를 올바른 위치에 표시하고 있음
    if (isDragUpdateRef.current) {
      isDragUpdateRef.current = false;
      return;
    }

    const tasks = buildTasks(items);
    if (tasks.length === 0) return;

    const currentIds = tasks.map(t => t.id).join(",");

    // 아이템 구조(ID) 동일하면 재빌드 스킵
    if (prevIdsRef.current === currentIds && ganttRef.current) {
      return;
    }

    prevIdsRef.current = currentIds;

    // 전체 재빌드 (초기 로드 또는 아이템 추가/삭제 시)
    containerRef.current.innerHTML = "";
    ganttRef.current = null;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    containerRef.current.appendChild(svg);

    import("frappe-gantt").then(({ default: Gantt }) => {
      // 클릭 후 남는 핸들(흰 사각형) JS로 강제 제거
      const hideHandles = () => {
        requestAnimationFrame(() => {
          containerRef.current?.querySelectorAll<SVGElement>(".handle").forEach(el => {
            el.style.opacity = "0";
          });
        });
      };
      containerRef.current?.addEventListener("pointerup", hideHandles);
      containerRef.current?.addEventListener("click", hideHandles);

      ganttRef.current = new Gantt(svg, tasks, {
        view_mode: "Week",
        date_format: "YYYY-MM-DD",
        popup_on: "click",
        readonly: readOnly ?? false,
        bar_height: 30,
        padding: 20,
        on_click: (task: any) => {
          if (String(task.id).startsWith("__phantom_")) return;
          // 드래그 직후 발생하는 클릭은 무시
          if (wasDragRef.current) {
            wasDragRef.current = false;
            return;
          }
          // 더블클릭 감지: 300ms 내 2번째 클릭 시 모달 오픈
          if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
            const item = itemsRef.current.find(i => i.id === task.id);
            if (item) onClickRef.current?.(item);
          } else {
            clickTimerRef.current = setTimeout(() => {
              clickTimerRef.current = null;
            }, 300);
          }
        },
        on_date_change: (task: any, start: Date, end: Date) => {
          if (onDateChangeRef.current) {
            isDragUpdateRef.current = true;
            wasDragRef.current = true; // 직후 on_click 무시
            const fmt = (d: Date) => d.toISOString().slice(0, 10);
            onDateChangeRef.current(task.id, fmt(start), fmt(end));
          }
        },
        popup: (({ task }: any): any => {
          if (String(task.id).startsWith("__phantom_")) return false;
          // _data는 buildTasks 시점에 항상 세팅, itemsRef는 최신 날짜 반영용 fallback
          const d = task._data ?? itemsRef.current.find(i => i.id === task.id);
          if (!d) return false; // 빈 문자열("") 반환 시 흰 박스가 뜨므로 false로 숨김
          const rate  = d.completionRate;
          const delay = d.delayDays;
          const delayStr = delay === null ? "-" : delay > 0 ? `<span style="color:#ef4444">+${delay}일 지연</span>` : delay < 0 ? `<span style="color:#10b981">${delay}일 앞당김</span>` : "정시";
          return `
            <div style="padding:8px;min-width:200px;font-size:12px;line-height:1.6">
              <strong style="font-size:13px">[${d.vesselCode}] ${d.blockName}</strong><br/>
              <span style="color:#6b7280">완료율: ${rate}% &nbsp;|&nbsp; 지연: ${delayStr}</span><br/>
              ${d.deliveryFactory ? `<span style="color:#6b7280">가공장 납기: ${d.deliveryFactory.slice(0,10)}</span><br/>` : ""}
              ${d.memo ? `<span style="color:#9ca3af">${d.memo}</span>` : ""}
            </div>
          `;
        }),
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  if (items.filter(i => i.plannedStart).length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        일정이 배치된 스케줄이 없습니다.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="frappe-gantt-container overflow-x-auto"
      style={{ minHeight: 700 }}
    />
  );
}
