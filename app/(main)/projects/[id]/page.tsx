export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import DrawingUploader from "@/components/drawing-uploader";
import DrawingTable from "@/components/drawing-table";
import ProjectDeleteButton from "@/components/project-delete-button";

const TYPE_DESC: Record<string, string> = {
  A: "유형 A — 외부 도면 수신형",
  B: "유형 B — 자사 네스팅형",
};
const STATUS_LABEL: Record<string, string> = { ACTIVE: "진행중", COMPLETED: "완료", ON_HOLD: "보류" };
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "text-green-700 bg-green-100",
  COMPLETED: "text-gray-600 bg-gray-100",
  ON_HOLD: "text-yellow-700 bg-yellow-100",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      drawingLists: { orderBy: { createdAt: "asc" } },
      _count: { select: { drawingLists: true } },
    },
  });

  if (!project) notFound();

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/projects">
            <Button variant="ghost" size="sm" className="flex items-center gap-1 text-gray-500">
              <ArrowLeft size={14} /> 목록
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">
                [{project.projectCode}] {project.projectName}
              </h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[project.status]}`}>
                {STATUS_LABEL[project.status]}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {TYPE_DESC[project.type]} · {project.client}
            </p>
          </div>
        </div>
        <ProjectDeleteButton projectId={project.id} projectCode={`${project.projectCode}-${project.projectName}`} />
      </div>

      {/* 메모 */}
      {project.memo && (
        <div className="text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
          메모: {project.memo}
        </div>
      )}

      {/* 강재리스트 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-800">
            강재리스트{" "}
            <span className="text-gray-400 font-normal text-sm">({project._count.drawingLists}행)</span>
          </h3>
          <DrawingUploader projectId={project.id} />
        </div>
        <DrawingTable drawings={project.drawingLists} projectId={project.id} />
      </div>
    </div>
  );
}
