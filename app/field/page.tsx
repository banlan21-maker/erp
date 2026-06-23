import Link from "next/link";
import { Package, PackageOpen, Truck, Wrench, CreditCard, type LucideIcon } from "lucide-react";

/**
 * 현장 페이지 모음 — /field
 *
 * 모바일에서 현장 근무자가 자주 쓰는 페이지로 빠르게 이동하기 위한 허브.
 * 현장 작업일보(/field/worklog)는 절단 작업 전용이라 포함하지 않음.
 * 새 현장용 페이지가 추가되면 LINKS 배열에 한 줄 추가.
 */

interface FieldLink {
  href:        string;
  label:       string;
  description: string;
  icon:        LucideIcon;
  // Tailwind 색상 클래스 — 카드 테두리/배경/아이콘 톤
  accent:      {
    border: string;
    bg:     string;
    icon:   string;
    label:  string;
  };
}

const LINKS: FieldLink[] = [
  {
    href: "/field/supply",
    label: "현장 입출고",
    description: "자재 입고·출고 등록",
    icon: Package,
    accent: {
      border: "border-blue-500/60 active:border-blue-400",
      bg:     "from-blue-900/40 to-blue-950",
      icon:   "text-blue-300 bg-blue-500/15",
      label:  "text-blue-100",
    },
  },
  {
    href: "/field/shipout",
    label: "현장 출고관리",
    description: "판번호 입력 · 출고장 발행",
    icon: PackageOpen,
    accent: {
      border: "border-orange-500/60 active:border-orange-400",
      bg:     "from-orange-900/40 to-orange-950",
      icon:   "text-orange-300 bg-orange-500/15",
      label:  "text-orange-100",
    },
  },
  {
    href: "/field/driving-log",
    label: "현장 운행일지",
    description: "차량 운행 기록",
    icon: Truck,
    accent: {
      border: "border-emerald-500/60 active:border-emerald-400",
      bg:     "from-emerald-900/40 to-emerald-950",
      icon:   "text-emerald-300 bg-emerald-500/15",
      label:  "text-emerald-100",
    },
  },
  {
    href: "/field/facility",
    label: "현장 시설관리",
    description: "시설·설비 이슈 등록",
    icon: Wrench,
    accent: {
      border: "border-amber-500/60 active:border-amber-400",
      bg:     "from-amber-900/40 to-amber-950",
      icon:   "text-amber-300 bg-amber-500/15",
      label:  "text-amber-100",
    },
  },
  {
    href: "/field/payment",
    label: "현장 결제관리",
    description: "법인카드 사용 등록",
    icon: CreditCard,
    accent: {
      border: "border-violet-500/60 active:border-violet-400",
      bg:     "from-violet-900/40 to-violet-950",
      icon:   "text-violet-300 bg-violet-500/15",
      label:  "text-violet-100",
    },
  },
];

export default function FieldHomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* 헤더 */}
      <header className="px-5 pt-7 pb-5 border-b border-gray-800">
        <p className="text-xs font-semibold text-gray-500 tracking-wide">CNC ERP</p>
        <h1 className="text-2xl font-bold text-white mt-1">현장 페이지</h1>
        <p className="text-sm text-gray-400 mt-1">현장에서 사용하는 메뉴 모음</p>
      </header>

      {/* 카드 그리드 */}
      <main className="flex-1 p-4">
        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
          {LINKS.map(({ href, label, description, icon: Icon, accent }) => (
            <Link
              key={href}
              href={href}
              className={`group aspect-square rounded-2xl border-2 ${accent.border}
                          bg-gradient-to-br ${accent.bg}
                          p-4 flex flex-col justify-between
                          active:scale-[0.97] transition-transform`}
            >
              <div className={`w-12 h-12 rounded-xl ${accent.icon} flex items-center justify-center`}>
                <Icon size={26} />
              </div>
              <div>
                <p className={`text-lg font-bold ${accent.label} leading-tight`}>{label}</p>
                <p className="text-xs text-gray-400 mt-1 leading-tight">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>

      {/* 푸터 */}
      <footer className="px-5 py-4 border-t border-gray-800 text-center">
        <p className="text-[11px] text-gray-600">새 페이지가 추가되면 자동으로 여기에 노출됩니다</p>
      </footer>
    </div>
  );
}
