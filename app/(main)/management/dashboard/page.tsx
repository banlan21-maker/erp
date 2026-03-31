import { LayoutDashboard } from "lucide-react";

export default function ManagementDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <LayoutDashboard size={24} className="text-blue-600" /> 관리 대시보드
        </h2>
        <p className="text-sm text-gray-500 mt-1">관리 파트 현황을 한눈에 확인합니다.</p>
      </div>

      <div className="flex items-center justify-center py-32 bg-white rounded-xl border border-dashed border-gray-300">
        <div className="text-center text-gray-400">
          <LayoutDashboard size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-base font-medium">준비 중입니다.</p>
          <p className="text-sm mt-1">표시할 항목을 구상 후 추가할 예정입니다.</p>
        </div>
      </div>
    </div>
  );
}
