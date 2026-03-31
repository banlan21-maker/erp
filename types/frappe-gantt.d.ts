declare module "frappe-gantt" {
  export interface Task {
    id: string;
    name: string;
    start: string;
    end: string;
    progress?: number;
    dependencies?: string;
    custom_class?: string;
    color?: string;
    [key: string]: any;
  }

  export interface GanttOptions {
    view_mode?: string;
    date_format?: string;
    popup_on?: "click" | "hover";
    readonly?: boolean;
    on_click?: (task: Task) => void;
    on_date_change?: (task: Task, start: Date, end: Date) => void;
    on_progress_change?: (task: Task, progress: number) => void;
    on_view_change?: (mode: string) => void;
    popup?: (task: Task) => string;
    [key: string]: any;
  }

  export default class Gantt {
    constructor(wrapper: HTMLElement | SVGElement | string, tasks: Task[], options?: GanttOptions);
    change_view_mode(mode?: string): void;
    refresh(tasks: Task[]): void;
  }
}
