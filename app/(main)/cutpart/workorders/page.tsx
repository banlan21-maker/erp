export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, ClipboardList } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기", IN_PROGRESS: "진행중", COMPLETED: "완료", CANCELLED: "취소",
};
const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};
const PRIORITY_LABEL: Record<string, string> = {
  LOW: "낮음", NORMAL: "보통", HIGH: "높음", URGENT: "긴급",
};
const PRIORITY_COLOR: Record<string, string> = {
  LOW: "bg-gray-50 text-gray-500",
  NORMAL: "bg-blue-50 text-blue-600",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700 font-bold",
};
const TYPE_COLOR: Record<string, string> = {
  A: "bg-blue-100 text-blue-700",
  B: "bg-green-100 text-green-700",
};

export default async function WorkOrdersPage() {
  const workOrders = await prisma.workOrder.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    include: {
      project: { select: { projectCode: true, projectName: true, type: true } },
      drawingList: { select: { block: true, drawingNo: true, material: true, thickness: true } },
      equipment: { select: { name: true, type: true } },
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">작업지시</h2>
          <p className="text-sm text-gray-500 mt-0.5">전체 {workOrders.length}건</p>
        </div>
        <Link href="/cutpart/workorders/new">
          <Button className="flex items-center gap-2">
            <Plus size={16} /> 작업지시 생성
          </Button>
        </Link>
      </div>

      {workOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-xl border">
          <ClipboardList size={40} className="mb-3 opacity-40" />
          <p className="text-base font-medium">등록된 작업지시가 없습니다.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">작업지시번호</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">호선</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">블록/도면</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">장비</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">우선순위</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">상태</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">납기일</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {workOrders.map((wo) => (
                <tr key={wo.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-bold text-gray-700">{wo.orderNo}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${TYPE_COLOR[wo.project.type]}`}>
                        {wo.project.type}
                      </span>
                      <div>
                        <p className="text-xs font-bold text-gray-800">{wo.project.projectCode}</p>
                        <p className="text-xs text-gray-400 truncate max-w-[120px]">{wo.project.projectName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {wo.drawingList ? (
                      <div>
                        <p className="font-medium">{wo.drawingList.block ?? "-"}</p>
                        <p className="text-gray-400">{wo.drawingList.material} {wo.drawingList.thickness}t</p>
                      </div>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{wo.equipment?.name ?? <span className="text-gray-300">미배정</span>}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLOR[wo.priority]}`}>
                      {PRIORITY_LABEL[wo.priority]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[wo.status]}`}>
                      {STATUS_LABEL[wo.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {wo.dueDate ? new Date(wo.dueDate).toLocaleDateString("ko-KR") : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
