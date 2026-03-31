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

function buildTasks(items: GanttItem[]) {
  return items
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
}

export default function FrappeGanttWrapper({ items, onItemClick, onDateChange, readOnly }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const ganttRef      = useRef<any>(null);
  const prevIdsRef    = useRef<string>("");
  // keep latest callbacks in refs so they never become stale deps
  const onClickRef      = useRef(onItemClick);
  const onDateChangeRef = useRef(onDateChange);
  useEffect(() => { onClickRef.current = onItemClick; }, [onItemClick]);
  useEffect(() => { onDateChangeRef.current = onDateChange; }, [onDateChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const tasks = buildTasks(items);
    if (tasks.length === 0) return;

    const currentIds = tasks.map(t => t.id).join(",");

    // 아이템 구조(ID 목록)가 같으면 전체 재빌드 없이 refresh만
    if (prevIdsRef.current === currentIds && ganttRef.current) {
      try { ganttRef.current.refresh(tasks); } catch { /* ignore */ }
      return;
    }

    prevIdsRef.current = currentIds;

    // 전체 재빌드 (아이템 추가/삭제 시에만)
    containerRef.current.innerHTML = "";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    containerRef.current.appendChild(svg);

    import("frappe-gantt").then(({ default: Gantt }) => {
      ganttRef.current = new Gantt(svg, tasks, {
        view_mode: "Week",
        date_format: "YYYY-MM-DD",
        popup_on: "click",
        readonly: readOnly ?? false,
        on_click: (task: any) => {
          onClickRef.current?.(task._data);
        },
        on_date_change: (task: any, start: Date, end: Date) => {
          if (onDateChangeRef.current) {
            const fmt = (d: Date) => d.toISOString().slice(0, 10);
            onDateChangeRef.current(task.id, fmt(start), fmt(end));
          }
        },
        popup: (task: any) => {
          const d = task._data as GanttItem;
          const rate = d.completionRate;
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
        },
      });
    });

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
      prevIdsRef.current = "";
    };
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
      style={{ minHeight: 200 }}
    />
  );
}
